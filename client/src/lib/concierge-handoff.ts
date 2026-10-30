export type ConciergeHandoffStatus = "PENDING_STAFF_REVIEW";

export type ConciergeHandoffSlot =
  | "fulfillment_method"
  | "verified_delivery_address"
  | "pickup_window"
  | "secure_transfer_details";

export interface ConciergeHandoff {
  status: ConciergeHandoffStatus;
  activeIntent: string;
  fulfillmentMethod: "delivery" | "pickup" | null;
  catalogItemCount: number;
  pendingItemCount: number;
  missingSlots: ConciergeHandoffSlot[];
}

export function buildConciergeHandoff(input: {
  intent: string;
  deliveryType: "delivery" | "pickup" | null;
  hasVerifiedDeliveryAddress: boolean;
  hasPickupWindow: boolean;
  catalogItemCount: number;
  pendingItemCount: number;
}): ConciergeHandoff {
  const missingSlots: ConciergeHandoffSlot[] = [];

  if (!input.deliveryType) {
    missingSlots.push("fulfillment_method");
  } else if (input.deliveryType === "delivery" && !input.hasVerifiedDeliveryAddress) {
    missingSlots.push("verified_delivery_address");
  } else if (input.deliveryType === "pickup" && !input.hasPickupWindow) {
    missingSlots.push("pickup_window");
  }

  if (input.intent === "transfer" || input.intent === "transfer_out") {
    missingSlots.push("secure_transfer_details");
  }

  return {
    status: "PENDING_STAFF_REVIEW",
    activeIntent: input.intent || "general",
    fulfillmentMethod: input.deliveryType,
    catalogItemCount: input.catalogItemCount,
    pendingItemCount: input.pendingItemCount,
    missingSlots,
  };
}