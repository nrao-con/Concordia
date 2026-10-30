import { describe, expect, it } from "vitest";
import { buildConciergeHandoff } from "../lib/concierge-handoff";

describe("concierge staff handoff state", () => {
  it("records confirmed fulfillment slots without copying sensitive chat text", () => {
    expect(buildConciergeHandoff({
      intent: "refill",
      deliveryType: "pickup",
      hasVerifiedDeliveryAddress: false,
      hasPickupWindow: true,
      catalogItemCount: 0,
      pendingItemCount: 0,
    })).toEqual({
      status: "PENDING_STAFF_REVIEW",
      activeIntent: "refill",
      fulfillmentMethod: "pickup",
      catalogItemCount: 0,
      pendingItemCount: 0,
      missingSlots: [],
    });
  });

  it("marks only the missing delivery slot for staff", () => {
    expect(buildConciergeHandoff({
      intent: "otc_shop",
      deliveryType: "delivery",
      hasVerifiedDeliveryAddress: false,
      hasPickupWindow: false,
      catalogItemCount: 1,
      pendingItemCount: 1,
    }).missingSlots).toEqual(["verified_delivery_address"]);
  });

  it("keeps transfer details in the secure workflow", () => {
    expect(buildConciergeHandoff({
      intent: "transfer",
      deliveryType: null,
      hasVerifiedDeliveryAddress: false,
      hasPickupWindow: false,
      catalogItemCount: 0,
      pendingItemCount: 0,
    }).missingSlots).toEqual(["fulfillment_method", "secure_transfer_details"]);
  });
});