import type { IStorage } from "./storage";
import { formatDeliveryAddress, validateAddressSelection, type VerifiedAddressSelectionInput } from "./address-verification";
import { buildPharmFlowsRequest, submitPharmFlows } from "./pharmflows-client";
import { notifyStaffAppSale } from "./staff-sync";
import { verifyStaffAvailability } from "./staff-catalog";
import { randomUUID } from "crypto";

export type MixedRequestInput = {
  prescriptionIds?: string[];
  products?: Array<{ productId: string; quantity: number }>;
  deliveryMethod: "pickup" | "delivery";
  shippingAddress?: string;
  shippingAddressUnit?: string;
  shippingAddressVerification?: VerifiedAddressSelectionInput;
  pickupSlot?: string;
};

export function validateMixedRequest(input: MixedRequestInput) {
  const rxIds = input.prescriptionIds ?? [];
  const products = input.products ?? [];
  if (!rxIds.length && !products.length) return "At least one prescription or OTC product is required";
  if (input.deliveryMethod === "delivery") {
    const result = validateAddressSelection(input.shippingAddress, input.shippingAddressVerification);
    if (!result.valid) return result.message;
  }
  if (products.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) {
    return "Product quantities must be whole numbers between 1 and 100";
  }
  return null;
}

export function derivePatientIdentity(user: {
  id: string; firstName?: string | null; lastName?: string | null;
  dateOfBirth?: Date | string | null; phoneNumber?: string | null;
}) {
  return {
    patientId: user.id,
    patientName: [user.firstName, user.lastName].filter(Boolean).join(" "),
    dob: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().slice(0, 10) : undefined,
    phone: user.phoneNumber ?? undefined,
  };
}

export function splitDestinationPayloads(input: {
  prescriptions: Array<{ medicationName: string; dosage: string; quantity?: number | null }>;
  products: Array<{ productId: string; quantity: number; name: string; price: number }>;
}) {
  return {
    pharmacy: input.prescriptions.map(({ medicationName, dosage, quantity }) => ({
      name: medicationName, dosage, ...(quantity == null ? {} : { quantity }),
    })),
    grocery: input.products.map(({ productId, quantity, name, price }) => ({ productId, quantity, name, price })),
  };
}

export async function processMixedRequest(userId: string, input: MixedRequestInput, storage: IStorage, correlationId: string = randomUUID()) {
  const validationError = validateMixedRequest(input);
  if (validationError) return { ok: false as const, status: 400, message: validationError };
  const user = await storage.getUser(userId);
  if (!user) return { ok: false as const, status: 404, message: "User not found" };
  if (input.products?.length) {
    try {
      if (!await verifyStaffAvailability(input.products))
        return { ok: false as const, status: 409, message: "Staff inventory changed. Refresh the requested products." };
    } catch { return { ok: false as const, status: 503, message: "Staff inventory unavailable; request not submitted" }; }
  }
  const rxIds = input.prescriptionIds ?? [];
  const prescriptions = await Promise.all(rxIds.map((id) => storage.getPrescription(id)));
  if (prescriptions.some((rx) => !rx || rx.userId !== userId)) {
    return { ok: false as const, status: 403, message: "One or more prescriptions are not owned by this patient" };
  }
  if (rxIds.length && (!user.firstName?.trim() || !user.lastName?.trim() || !user.dateOfBirth)) {
    return { ok: false as const, status: 422, message: "First name, last name, and date of birth are required for prescription requests" };
  }
  const catalog = await Promise.all((input.products ?? []).map(async (line) => ({
    line, product: await storage.getProduct(line.productId),
  })));
  if (catalog.some(({ line, product }) => !product || product.requiresPrescription || !product.inStock || product.stockQuantity < line.quantity)) {
    return { ok: false as const, status: 409, message: "One or more OTC products are unavailable" };
  }
  const products = catalog.map(({ line, product }) => ({
    productId: line.productId, quantity: line.quantity, name: product!.name, price: Number(product!.price),
  }));
  const identity = derivePatientIdentity(user);
  // The route re-verifies the selected map result with the address provider.
  // Use that verified label rather than trusting free-form request text when
  // constructing either downstream payload.
  const address = input.deliveryMethod === "delivery"
    ? formatDeliveryAddress(input.shippingAddressVerification?.label, input.shippingAddressUnit) ?? undefined : undefined;
  const payloads = splitDestinationPayloads({
    prescriptions: prescriptions.filter(Boolean) as Array<{ medicationName: string; dosage: string; quantity?: number | null }>,
    products,
  });

  let pharmacyRequest: "pending" | "submitted" | "integration_failed" = "pending";
  let groceryRequest: "pending" | "submitted" | "integration_failed" = "pending";
  if (payloads.pharmacy.length) {
    const result = await submitPharmFlows(buildPharmFlowsRequest({
      patientId: identity.patientId, patientName: identity.patientName, dob: identity.dob,
      patientPhone: identity.phone, orderType: input.deliveryMethod, deliveryAddress: address,
      correlationId, medications: payloads.pharmacy,
    }));
    pharmacyRequest = result.submitted ? "submitted" : "integration_failed";
  }
  let order;
  if (payloads.grocery.length) {
    const orderNumber = `OTC-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    order = await storage.createOrder({
      userId, orderNumber, type: "otc", status: "pending", subtotal: products.reduce((s, p) => s + p.price * p.quantity, 0).toFixed(2),
      pointsUsed: 0, pointsEarned: 0, total: products.reduce((s, p) => s + p.price * p.quantity, 0).toFixed(2),
      paymentIntentId: null, paymentStatus: "collect_at_counter", concordiaCareOrderId: `${correlationId}-otc`,
      source: "website", deliveryMethod: input.deliveryMethod, pickupSlot: input.pickupSlot ?? null, shippingAddress: address ?? null,
    });
    for (const item of products) await storage.createOrderItem({ orderId: order.id, productId: item.productId, prescriptionId: null, name: item.name, quantity: item.quantity, price: item.price.toFixed(2) });
    groceryRequest = await notifyStaffAppSale(orderNumber, products.map(({ productId, quantity }) => ({ productId, quantity })), {
      name: identity.patientName || user.email || "Patient", email: user.email ?? null, phone: identity.phone ?? null,
      deliveryMethod: input.deliveryMethod, shippingAddress: address ?? null, pickupSlot: input.pickupSlot ?? null, correlationId,
      paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod ?? "cash", source: order.source,
    }) ? "submitted" : "integration_failed";
  }
  return { ok: true as const, correlationId, order, pharmacyRequest, groceryRequest };
}