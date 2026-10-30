import { z } from "zod";

export function normalizeShopPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^\d{10}$/.test(local) ? local : null;
}

export const shopPhoneSchema = z.string().trim().max(40).transform((value, ctx) => {
  const phone = normalizeShopPhone(value);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A complete 10-digit phone number is required so staff can contact you" });
    return z.NEVER;
  }
  return phone;
});

export const shopAddressSelectionSchema = z.object({
  label: z.string().min(1), street: z.string().min(1), city: z.string().min(1),
  state: z.string().min(1), zipCode: z.string().regex(/^\d{5}$/),
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  osmType: z.string().optional(), osmId: z.number().finite().optional(),
});

export const shopFulfillmentFields = {
  deliveryMethod: z.enum(["pickup", "delivery"]).default("pickup"),
  shippingAddress: z.string().trim().max(1000).optional(),
  shippingAddressUnit: z.string().trim().max(100).optional(),
  shippingAddressVerification: shopAddressSelectionSchema.optional(),
};
