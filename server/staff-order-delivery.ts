import { z } from "zod";
import { storage } from "./storage";
import type { OrderWithItems, SyncOutboxEntry } from "@shared/schema";
import { STAFF_BASE, requestStaffInventoryRefresh } from "./staff-catalog";

export const STAFF_ORDER_WEBHOOK = `${STAFF_BASE}/api/public/webhooks/new-order`;
const money = z.number().finite().nonnegative()
  .refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6);
export const staffWebhookSchema = z.object({
  id: z.string().min(1), orderNumber: z.string().min(1), source: z.literal("website"),
  status: z.string().min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  customerName: z.string().nullable().optional(), customerEmail: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(), deliveryMethod: z.string().nullable().optional(),
  shippingAddress: z.string().nullable().optional(), pickupSlot: z.string().nullable().optional(),
  paymentStatus: z.string().nullable().optional(), paymentMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  orderItems: z.array(z.object({
    concordiaProductId: z.number().int().positive().safe(), name: z.string().min(1),
    quantity: z.number().int().min(1).max(100), unitPrice: money,
  })).min(1).max(100),
});

export function buildStaffWebhook(order: OrderWithItems) {
  return staffWebhookSchema.parse({
    id: order.id, orderNumber: order.orderNumber, source: "website", status: order.status,
    createdAt: new Date(order.createdAt!).toISOString(), updatedAt: new Date(order.updatedAt!).toISOString(),
    customerName: order.guestName, customerEmail: order.guestEmail, customerPhone: order.guestPhone,
    deliveryMethod: order.deliveryMethod, shippingAddress: order.shippingAddress, pickupSlot: order.pickupSlot,
    paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, notes: order.notes,
    orderItems: order.orderItems.map(item => ({
      concordiaProductId: Number(item.product?.externalId), name: item.name,
      quantity: item.quantity, unitPrice: Number(item.price),
    })),
  });
}

const delivering = new Set<number>();
export async function deliverStaffWebhook(entry: SyncOutboxEntry): Promise<boolean> {
  if (delivering.has(entry.id)) return false;
  delivering.add(entry.id);
  try {
    const parsed = staffWebhookSchema.safeParse(entry.payload);
    const key = process.env.CONCORDIA_RX_API_KEY;
    if (!parsed.success || !key) {
      await storage.markSyncOutboxFailed(entry.id, parsed.success ? "Website integration key unavailable" : "Staff webhook payload needs review");
      return false;
    }
    // Pending is durable; replays always use the same saved ID, timestamps and lines.
    await storage.incrementSyncOutboxAttempt(entry.id, new Date(Date.now() + 60_000));
    let accepted = false;
    let reason = "Staff webhook delivery uncertain";
    let permanent = false;
    try {
      const response = await fetch(STAFF_ORDER_WEBHOOK, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-API-KEY": key },
        body: JSON.stringify(parsed.data),
      });
      requestStaffInventoryRefresh();
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const body = await response.json();
        // Import receipt only: this importer may preserve shortages. It is NOT
        // a reservation, availability guarantee, or authorization to charge.
        accepted = (body?.ok === true || body?.success === true)
          && body?.ok !== false && body?.success !== false && body?.test !== true && body?.dryRun !== true
          && (body.id === parsed.data.id || body.externalOrderId === parsed.data.id
            || body.orderNumber === parsed.data.orderNumber
            || body.order?.externalOrderId === parsed.data.id || body.order?.orderNumber === parsed.data.orderNumber);
      }
      reason = accepted ? "" : `Staff webhook HTTP ${response.status}; acknowledgment not confirmed`;
      permanent = [400, 401, 403, 422].includes(response.status);
    } catch {
      // A timeout may follow a committed import. Recover inventory, not a new order.
      requestStaffInventoryRefresh();
      /* Never persist upstream bodies, credentials, or customer data in errors. */
    }
    if (accepted) { await storage.markSyncOutboxDelivered(entry.id); return true; }
    if (permanent || entry.attempts + 1 >= entry.maxAttempts) {
      await storage.markSyncOutboxFailed(entry.id, reason);
    } else {
      await storage.scheduleSyncOutboxRetry(entry.id,
        new Date(Date.now() + Math.min(960_000, 60_000 * 2 ** entry.attempts)), reason);
    }
    return false;
  } catch {
    // The saved pending entry remains available after a DB/network interruption.
    console.error("[StaffWebhook] Delivery record requires recovery");
    return false;
  } finally { delivering.delete(entry.id); }
}

export async function notifyStaffAppSale(
  orderNumber: string,
  _items: Array<{ productId: string; quantity: number }>,
  customer: { name: string; email?: string | null; phone?: string | null; [key: string]: unknown },
): Promise<boolean> {
  try {
  const order = await storage.getOrderByOrderNumberWithItems(orderNumber);
  if (!order || order.type !== "otc") return false;
  let payload;
  try {
    payload = buildStaffWebhook(order);
    payload.customerName = customer.name;
    payload.customerEmail = customer.email ?? null;
    payload.customerPhone = customer.phone ?? null;
  } catch {
    await storage.createSyncOutboxEntry({
      endpoint: STAFF_ORDER_WEBHOOK, method: "POST", payload: { id: order.id, orderNumber },
      status: "failed", maxAttempts: 1, lastError: "Staff product mapping or order lines need review",
    });
    return false;
  }
  const entry = await storage.createSyncOutboxEntry({
    endpoint: STAFF_ORDER_WEBHOOK, method: "POST", payload,
    status: "pending", maxAttempts: 10,
  });
  return deliverStaffWebhook(entry);
  } catch {
    console.error("[StaffWebhook] Order saved; handoff needs recovery through order polling");
    return false;
  }
}
