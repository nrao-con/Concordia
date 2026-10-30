import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { processGuestCheckout } from "./guest-checkout-service";
import { claimRequest, completeRequest, normalizeIdempotencyKey, releaseUncompletedRequest } from "./request-idempotency";
import { shopPhoneSchema, shopFulfillmentFields } from "@shared/shop-request";
import type { VerifiedAddressSelectionInput } from "./address-verification";

/** Trusted app backend only. Patient ownership is never inferred from contacts. */
export async function handleAppShopRequest(
  req: Request, res: Response,
  data: {
    items: Array<{ productId?: string; quantity: number }>;
    customer: { userId?: string; firstName: string; lastName: string; phone?: string; email?: string };
    total: string | number; notes?: string;
    deliveryMethod?: "pickup" | "delivery";
    shippingAddress?: string; shippingAddressUnit?: string;
    shippingAddressVerification?: VerifiedAddressSelectionInput;
  },
  notify: (orderId: string) => void,
) {
  const key = normalizeIdempotencyKey(req.get("Idempotency-Key"));
  if (!key) return res.status(400).json({ message: "A stable Idempotency-Key header is required for app shop requests" });
  if (data.items.length > 100 || data.items.some(item => !item.productId || item.quantity > 100))
    return res.status(400).json({ message: "Every shop item needs a website product ID and a quantity from 1 to 100" });
  if (!Number.isFinite(Number(data.total)) || Number(data.total) < 0)
    return res.status(400).json({ message: "Invalid expected total" });
  if (!shopPhoneSchema.safeParse(data.customer.phone).success)
    return res.status(400).json({ message: "A complete 10-digit contact phone number is required" });
  const scope = "care-app-shop-request";
  try {
    if (data.customer.userId && !await storage.getUser(data.customer.userId))
      return res.status(400).json({ message: "Unknown pharmacy patient ID; contact matching cannot assign order ownership" });
    const claim = await claimRequest(scope, key, data);
    if (!claim) return res.status(400).json({ message: "Invalid request identity" });
    if (claim.kind === "mismatch") return res.status(409).json({ message: "Request key belongs to different order details" });
    if (claim.kind === "duplicate") return res.status(claim.statusCode).json(claim.body);
    const result = await processGuestCheckout({
      items: data.items.map(item => ({ productId: item.productId!, quantity: item.quantity })),
      guestName: [data.customer.firstName, data.customer.lastName].filter(Boolean).join(" "),
      guestPhone: data.customer.phone ?? "", guestEmail: data.customer.email ?? null,
      patientId: data.customer.userId, source: "app", correlationId: claim.correlationId,
      expectedTotal: Number(data.total), notes: data.notes,
      deliveryMethod: data.deliveryMethod ?? "pickup", paymentMethod: "cash",
      shippingAddress: data.shippingAddress, shippingAddressUnit: data.shippingAddressUnit,
      shippingAddressVerification: data.shippingAddressVerification,
    }, storage);
    if (!result.ok) {
      await releaseUncompletedRequest(scope, key);
      return res.status(result.status).json({ message: result.message });
    }
    const body = {
      success: true, orderId: result.order.id, orderNumber: result.orderNumber,
      staffHandoff: result.staffHandoff, requestOnly: true,
      reservationStatus: "unverified", paymentStatus: result.order.paymentStatus,
      deliveryMethod: result.order.deliveryMethod, shippingAddress: result.order.shippingAddress,
      message: "Order request saved. No payment taken. Wait for staff confirmation; stock is not reserved or guaranteed.",
    };
    await completeRequest(scope, key, 201, body);
    notify(result.order.id);
    return res.status(201).json(body);
  } catch {
    return res.status(503).json({ message: "App request outcome needs review. Retry only with the same request key." });
  }
}

export function registerShopOrderRequests(
  app: Express,
  requireAuth: RequestHandler,
  patientIdFor: (req: any) => string | undefined | null,
  notify: (orderId: string) => void,
) {
  app.post("/api/shop/order-requests", requireAuth, async (req: Request, res) => {
    const patientId = patientIdFor(req);
    if (!patientId) return res.status(401).json({ message: "Patient authentication required" });
    const parsed = z.object({
      guestName: z.string().trim().min(2).max(200),
      guestPhone: shopPhoneSchema,
      guestEmail: z.string().email().max(254).optional(),
      notes: z.string().max(2000).optional(),
      ...shopFulfillmentFields,
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid order request details" });
    const key = normalizeIdempotencyKey(req.get("Idempotency-Key"));
    if (!key) return res.status(400).json({ message: "A valid Idempotency-Key header is required" });
    const scope = `patient-shop-request:${patientId}`;
    try {
      const patient = await storage.getUser(patientId);
      if (!patient) return res.status(403).json({ message: "Patient account is not ready" });
      const claim = await claimRequest(scope, key, parsed.data);
      if (!claim) return res.status(400).json({ message: "Invalid request identity" });
      if (claim.kind === "mismatch") return res.status(409).json({ message: "This request key belongs to different details" });
      if (claim.kind === "duplicate") return res.status(claim.statusCode).json(claim.body);
      const cart = await storage.getCartItemsByUserId(patientId);
      // Prescription selections stay in their separate workflow and in the cart.
      const items = cart.filter(item => item.productId && !item.prescriptionId)
        .map(item => ({ id: item.id, productId: item.productId!, quantity: item.quantity }));
      if (!items.length || items.length > 100) {
        await releaseUncompletedRequest(scope, key);
        return res.status(400).json({ message: "Your shop cart is empty or too large" });
      }
      const result = await processGuestCheckout({
        ...parsed.data, patientId,
        items: items.map(item => ({ productId: item.productId!, quantity: item.quantity })),
        deliveryMethod: parsed.data.deliveryMethod, paymentMethod: "cash", source: "website",
        correlationId: claim.correlationId,
      }, storage);
      if (!result.ok) {
        // The shared service returns these rejections before any request is saved.
        await releaseUncompletedRequest(scope, key);
        return res.status(result.status).json({ message: result.message });
      }
      const body = {
        orderId: result.order.id, orderNumber: result.orderNumber,
        staffHandoff: result.staffHandoff, requestOnly: true,
        reservationStatus: "unverified", paymentStatus: result.order.paymentStatus,
        deliveryMethod: result.order.deliveryMethod, shippingAddress: result.order.shippingAddress, paymentMethod: "cash",
        message: "Order request saved. No payment has been taken. Staff will call to confirm availability, fulfillment and payment arrangements.",
      };
      // Persist the replay response before nonessential cart/UI cleanup.
      await completeRequest(scope, key, 200, body);
      for (const item of items) {
        try { await storage.removeSubmittedCartItem(item.id, patientId, item.quantity); }
        catch { console.warn("[ShopRequest] Saved request needs cart cleanup"); }
      }
      notify(result.order.id);
      return res.json(body);
    } catch {
      // Keep an uncertain claim: retry must never create a second order.
      return res.status(503).json({ message: "Request outcome needs review. Retry only with the same request key; do not submit another order." });
    }
  });
}
