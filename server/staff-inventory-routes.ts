import type { Express, RequestHandler } from "express";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { db } from "./db";
import { storage } from "./storage";
import { orders } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { checkStaffStatusTransition, type StaffFulfillmentStatus } from "./staff-order-status";
import { productPushSchema, productHideSchema, reconcileStaffCatalog, getInventoryRevision } from "./staff-catalog";
import { logAudit } from "./auditLogger";
import { staffInventoryEvents } from "./staff-inventory-events";

export const requireWebsiteIntegrationKey: RequestHandler = (req, res, next) => {
  const expected = process.env.CONCORDIA_RX_API_KEY;
  const supplied = req.get("X-API-KEY") ?? "";
  if (!expected) { res.status(503).json({ message: "Website integration is not configured" }); return; }
  if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    res.status(401).json({ message: "Invalid or missing X-API-KEY" }); return;
  }
  next();
};

export function registerStaffInventoryRoutes(app: Express, notify: (orderId: string, status: string) => void) {
  app.get("/api/inventory/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": inventory connected\n\n");
    const emit = (revision: string) => {
      res.write(`event: inventory_resync\ndata: ${JSON.stringify({ revision })}\n\n`);
    };
    staffInventoryEvents.on("revision", emit);
    const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      staffInventoryEvents.off("revision", emit);
    });
  });
  for (const operation of ["sync", "hide"] as const) {
    app.post(`/api/external/products/${operation}`, requireWebsiteIntegrationKey, async (req, res) => {
      const parsed = (operation === "sync" ? productPushSchema : productHideSchema).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid product request",
          errors: parsed.error.issues.map(issue => ({ field: issue.path.join("."), code: issue.code })),
        });
      }
      try {
        const current = await reconcileStaffCatalog(true, parsed.data);
        const local = await storage.getProductByExternalId(parsed.data.concordiaId);
        const present = current.some(p => p.id === parsed.data.concordiaId);
        return res.json({ ok: true, action: !local ? "not_found" : present ? "reconciled" : "hidden", id: local?.id ?? null });
      } catch {
        return res.status(503).json({ message: "Authoritative inventory reconciliation unavailable; retry with the same product ID" });
      }
    });
  }
  app.get("/api/inventory/revision", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.query.recover === "1") await reconcileStaffCatalog(true);
      return res.json(await getInventoryRevision());
    }
    catch { return res.status(503).json({ message: "Inventory temporarily unavailable" }); }
  });
  app.patch("/api/external/orders/:externalOrderId/app-status", requireWebsiteIntegrationKey, async (req, res) => {
    const parsed = z.object({ appStatus: z.string().trim().min(1).max(60), concordiaOrderNumber: z.string().trim().min(1).max(100) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid staff status payload" });
    const aliases: Record<string, StaffFulfillmentStatus> = {
      preparing: "preparing", processing: "preparing", ready: "ready_for_pickup",
      ready_for_pickup: "ready_for_pickup", out_for_delivery: "sent_for_delivery",
      sent_for_delivery: "sent_for_delivery", delivered: "delivered", picked_up: "picked_up",
    };
    try {
      const id = req.params.externalOrderId;
      const order = await storage.getOrder(id) ?? await storage.getOrderByOrderNumber(id);
      if (!order || order.type !== "otc" || !["website", "app"].includes(order.source))
        return res.status(404).json({ message: "Order not found" });
      const raw = parsed.data.appStatus.toLowerCase();
      if (raw === "pending") return res.json({ ok: true, changed: false, orderNumber: order.orderNumber });
      const next = aliases[raw] ?? (raw === "completed"
        ? order.deliveryMethod === "delivery" ? "delivered" : "picked_up" : undefined);
      if (!next) {
        if (["cancelled", "canceled", "refunded"].includes(raw)) {
          await logAudit({ req, actionType: "update", entityType: "order", entityId: order.id,
            newValue: { requestedAppStatus: raw, applied: false, reason: "central_inventory_transition_contract_required" } });
        }
        return res.status(409).json({ message: "Unsupported status; cancellation/refund inventory transition requires a separate contract" });
      }
      let decision = checkStaffStatusTransition(order.status, next, order.deliveryMethod);
      // Recovery callbacks may skip an intermediate event. Allow forward
      // progress on the same fulfillment path, never backward or across paths.
      const rank: Record<string, number> = { pending: 0, processing: 0, preparing: 1,
        ready_for_pickup: 2, sent_for_delivery: 2, delivered: 3, picked_up: 3 };
      const samePath = order.deliveryMethod === "pickup"
        ? ["preparing", "ready_for_pickup", "picked_up"].includes(next)
        : order.deliveryMethod === "delivery" && ["preparing", "sent_for_delivery", "delivered"].includes(next);
      if (decision === "conflict" && samePath && rank[order.status] !== undefined
        && rank[order.status] < 3 && rank[next] > rank[order.status]) decision = "apply";
      if (decision === "duplicate") return res.json({ ok: true, changed: false, orderNumber: order.orderNumber });
      // Late events acknowledge without moving the order backward.
      if (decision === "conflict") return res.json({ ok: true, changed: false, ignored: "stale_or_conflicting_status" });
      const [updated] = await db.update(orders).set({
        status: next, appStatus: parsed.data.appStatus, updatedAt: new Date(),
      }).where(and(eq(orders.id, order.id), eq(orders.status, order.status))).returning();
      if (!updated) return res.status(409).json({ message: "Order changed; retry callback" });
      await logAudit({ req, actionType: "update", entityType: "order", entityId: order.id,
        newValue: { status: next, appStatus: parsed.data.appStatus, concordiaOrderNumber: parsed.data.concordiaOrderNumber } });
      notify(order.id, next);
      // No outbound order POST, stock mutation, or callback relay here.
      return res.json({ ok: true, changed: true, orderNumber: order.orderNumber });
    } catch { return res.status(503).json({ message: "Status update not committed; retry callback" }); }
  });
}
