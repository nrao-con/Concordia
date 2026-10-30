import type { IStorage } from "./storage";
import type { Order } from "@shared/schema";
import { notifyStaffAppSale } from "./staff-sync";
import { verifyStaffAvailability } from "./staff-catalog";
import { normalizeShopPhone } from "@shared/shop-request";
import {
  formatDeliveryAddress,
  validateAddressSelection,
  verifyDeliveryAddress,
  type VerifiedAddressSelectionInput,
} from "./address-verification";

export type GuestCheckoutInput = {
  items: Array<{ productId: string; quantity: number }>;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  deliveryMethod: "pickup" | "delivery";
  shippingAddress?: string | null;
  shippingAddressUnit?: string | null;
  shippingAddressVerification?: VerifiedAddressSelectionInput | null;
  paymentMethod: "apple_pay" | "google_pay" | "credit_card" | "cash";
  notes?: string | null;
  correlationId?: string | null;
  paymentIntentId?: string | null;
  expectedTotal?: number;
  source?: "website" | "app" | "in_store";
  /** Server-resolved identity only; never copied from the public checkout body. */
  patientId?: string;
};

export type GuestCheckoutResult =
  | { ok: true; order: Order; orderNumber: string; subtotal: number; staffHandoff: "confirmed" | "needs_review" }
  | { ok: false; status: number; message: string };

export async function processGuestCheckout(
  input: GuestCheckoutInput,
  storageImpl: IStorage
): Promise<GuestCheckoutResult> {
  if (input.paymentMethod !== "cash" || input.paymentIntentId) {
    return { ok: false, status: 503, message: "Online payments are unavailable. Submit an unpaid pickup or delivery request instead." };
  }
  const contactPhone = normalizeShopPhone(input.guestPhone);
  if (!contactPhone) {
    return { ok: false, status: 400, message: "A complete 10-digit phone number is required so staff can contact you." };
  }
  try {
    if (!await verifyStaffAvailability(input.items))
      return { ok: false, status: 409, message: "Staff inventory changed. Refresh your cart before ordering." };
  } catch {
    return { ok: false, status: 503, message: "Staff inventory cannot be verified. No order was created." };
  }
  if (input.deliveryMethod === "delivery") {
    const addressValidation = validateAddressSelection(
      input.shippingAddress,
      input.shippingAddressVerification
    );
    if (!addressValidation.valid) {
      return {
        ok: false,
        status: 400,
        message: addressValidation.message,
      };
    }
    const verified = await verifyDeliveryAddress(input.shippingAddress, input.shippingAddressVerification);
    if (!verified.valid) return { ok: false, status: 400, message: verified.message };
  }

  // Validate all products: exist, OTC-only, in stock, sufficient quantity
  const productDetails: Array<{
    id: string;
    name: string;
    price: string;
    stockQuantity: number;
  }> = [];

  for (const item of input.items) {
    const product = await storageImpl.getProduct(item.productId);
    if (!product) {
      return {
        ok: false,
        status: 400,
        message: `Product not found: ${item.productId}`,
      };
    }
    if (product.requiresPrescription) {
      return {
        ok: false,
        status: 400,
        message: `Prescription items cannot be purchased as a guest. Please create an account.`,
      };
    }
    if (!product.inStock) {
      return {
        ok: false,
        status: 400,
        message: `${product.name} is currently out of stock.`,
      };
    }
    if (product.stockQuantity < item.quantity) {
      return {
        ok: false,
        status: 400,
        message: `Insufficient stock for ${product.name}. Only ${product.stockQuantity} available.`,
      };
    }
    productDetails.push({
      id: product.id,
      name: product.name,
      price: product.price,
      stockQuantity: product.stockQuantity,
    });
  }

  const subtotal = input.items.reduce((sum, item) => {
    const pd = productDetails.find((p) => p.id === item.productId)!;
    return sum + parseFloat(pd.price) * item.quantity;
  }, 0);
  if (input.expectedTotal != null && Math.abs(subtotal - input.expectedTotal) > 0.005) {
    return { ok: false, status: 409, message: "Cart total changed while payment was processing. No order was created." };
  }
  if (input.paymentMethod !== "cash" && !input.paymentIntentId) {
    return { ok: false, status: 402, message: "A confirmed Stripe payment is required before an order can be created" };
  }

  // This is an order request, not a reservation. Staff alone owns stock.
  // A preflight snapshot or importer acknowledgment cannot authorize charging.

  const orderNumber = `ORD-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 5)
    .toUpperCase()}`;

  // Save the pending request; do not reserve or deduct mirrored inventory.
  let order: Order;
  try {
    order = await storageImpl.createOrder({
      userId: input.patientId ?? null,
      orderNumber,
      type: "otc",
      status: "pending",
      subtotal: subtotal.toString(),
      total: subtotal.toString(),
       paymentIntentId: input.paymentIntentId || null,
      concordiaCareOrderId: input.correlationId || undefined,
      guestEmail: input.guestEmail || null,
      guestName: input.guestName,
      guestPhone: contactPhone,
      deliveryMethod: input.deliveryMethod,
      shippingAddress:
        input.deliveryMethod === "delivery"
          ? formatDeliveryAddress(input.shippingAddress, input.shippingAddressUnit)
          : null,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.deliveryMethod === "delivery" ? "unpaid" : "collect_at_counter",
      notes: input.notes || null,
      source: input.source ?? "website",
    });
  } catch (err) {
    throw err;
  }

  // Save request lines before attempting the Staff handoff.
  try {
    for (const item of input.items) {
      const pd = productDetails.find((p) => p.id === item.productId)!;
      await storageImpl.createOrderItem({
        orderId: order.id,
        productId: item.productId,
        name: pd.name,
        quantity: item.quantity,
        price: pd.price,
      });
    }
  } catch (err) {
    throw err;
  }

  // Keep the verified fulfillment details intact for staff. Await the attempt
  // so it is not abandoned when the request finishes; a failed attempt remains
  // unconfirmed and must not be described as delivered.
  const staffConfirmed = await notifyStaffAppSale(
    orderNumber,
    input.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    {
      name: input.guestName,
      email: input.guestEmail ?? null,
      phone: contactPhone,
      deliveryMethod: input.deliveryMethod,
      shippingAddress: input.deliveryMethod === "delivery"
        ? formatDeliveryAddress(input.shippingAddress, input.shippingAddressUnit)
        : null,
      correlationId: input.correlationId ?? undefined,
      paymentStatus: order.paymentStatus,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      source: input.source ?? "website",
    },
  );

  return { ok: true, order, orderNumber, subtotal, staffHandoff: staffConfirmed ? "confirmed" : "needs_review" };
}
