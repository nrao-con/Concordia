import { z } from "zod";

const SAFE_METADATA_TOKEN = /^[a-z0-9_:.-]+$/;
const conciergeHandoffSlotSchema = z.enum([
  "fulfillment_method",
  "verified_delivery_address",
  "pickup_window",
  "secure_transfer_details",
]);

export const conciergeLeadSchema = z.object({
  contactName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(30).default("not-provided"),
  email: z.string().trim().email().max(254).optional(),
  // "guest" is deliberately not an identity or patient-linking assertion.
  role: z.enum(["patient", "caregiver", "professional", "guest"]).default("guest"),
  intent: z.string().trim().min(1).max(80).regex(SAFE_METADATA_TOKEN).optional(),
  sentiment: z.enum(["neutral", "positive", "frustrated", "urgent", "tech_difficulty"]).optional(),
  deliveryAddress: z.string().trim().max(300).optional(),
  apartmentUnit: z.string().trim().max(50).optional(),
  deliveryAddressSelection: z.object({
    label: z.string().trim().min(1).max(300),
    street: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(2).max(50),
    zipCode: z.string().trim().min(5).max(10),
    lat: z.number().finite(),
    lon: z.number().finite(),
    osmType: z.string().trim().max(30).optional(),
    osmId: z.number().int().optional(),
  }).optional(),
  deliveryType: z.enum(["delivery", "pickup"]).optional(),
  pickupWindow: z.string().trim().max(100).optional(),
  requestedItems: z.array(z.object({
    productId: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
  })).max(20).optional(),
  // Free-text grocery/OTC requests that were not matched to a live catalog
  // product. These remain pending for staff review and are never treated as
  // in-stock items.
  pendingItems: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  callRequested: z.boolean().optional(),
  // Structured staff context only. Never accept conversation text or clinical
  // identifiers in this handoff object.
  handoff: z.object({
    status: z.literal("PENDING_STAFF_REVIEW"),
    activeIntent: z.string().trim().min(1).max(80).regex(SAFE_METADATA_TOKEN),
    fulfillmentMethod: z.enum(["delivery", "pickup"]).nullable(),
    catalogItemCount: z.number().int().min(0).max(20),
    pendingItemCount: z.number().int().min(0).max(20),
    missingSlots: z.array(conciergeHandoffSlotSchema).max(4),
  }).optional(),
  confirmed: z.literal(true).optional(),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
}).superRefine((value, ctx) => {
  // The public endpoint applies the required-contract checks before using
  // this privacy/schema parser. Keeping these optional here preserves the
  // parser's use by legacy non-submission chat metadata validation.
  if (!value.deliveryType) return;
  if (value.deliveryType === "pickup") {
    if (!value.pickupWindow?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pickupWindow"], message: "Pickup window is required" });
    }
    return;
  }
  if (!value.deliveryAddress?.trim() || !value.deliveryAddressSelection) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAddressSelection"], message: "A verified delivery address selection is required" });
  }
});

/**
 * The authenticated shop sourcing card is not a fulfillment request. Keep its
 * contract separate so it cannot accidentally bypass the public concierge
 * confirmation/address rules or accept client identity fields.
 */
export const conciergeSourcingInquirySchema = z.object({
  inquiryText: z.string().trim().min(1).max(1000),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export function validateConciergeLeadSubmission(input: unknown):
  | { success: true; data: z.infer<typeof conciergeLeadSchema> & { confirmed: true; deliveryType: "pickup" | "delivery"; idempotencyKey: string } }
  | { success: false; message: string; errors?: z.ZodIssue[] } {
  const parsed = conciergeLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid input", errors: parsed.error.errors };
  }
  if (parsed.data.confirmed !== true) {
    return { success: false, message: "Explicit confirmation is required before sending a pending request." };
  }
  if (!parsed.data.deliveryType) {
    return { success: false, message: "Delivery type is required." };
  }
  if (!parsed.data.idempotencyKey) {
    return { success: false, message: "A valid idempotency key is required." };
  }
  return {
    success: true,
    data: parsed.data as z.infer<typeof conciergeLeadSchema> & {
      confirmed: true;
      deliveryType: "pickup" | "delivery";
      idempotencyKey: string;
    },
  };
}

export function sanitizeConciergeReviewText(value: string, maxLength = 200): string {
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);
}

/**
 * Only server-established local IDs participate in ownership. Client role,
 * contact, and selected-patient fields are intentionally not arguments.
 */
export function deriveAuthenticatedPatientId(input: {
  localPatientId?: string | null;
  attendantId?: string | number | null;
  actingPatientId?: string | null;
}): string | null {
  if (input.attendantId && input.actingPatientId) return String(input.actingPatientId);
  return input.localPatientId || null;
}
