import { expect, it } from "vitest";
import { buildStaffWebhook } from "../staff-order-delivery";

it("includes saved fulfillment fields and canonical IDs, never DOB or prescription data", () => {
  const payload = buildStaffWebhook({
    id: "web-fixture", orderNumber: "ORD-fixture", status: "pending",
    createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z"),
    guestName: "Synthetic", dateOfBirth: "not-allowed", deliveryMethod: "pickup",
    orderItems: [{ name: "Soap", quantity: 1, price: "2.00", product: { externalId: "12" }, prescription: { name: "not-allowed" } }],
  } as any);
  expect(payload.deliveryMethod).toBe("pickup");
  expect(payload.orderItems[0].concordiaProductId).toBe(12);
  expect(payload).not.toHaveProperty("dateOfBirth");
  expect(payload.orderItems[0]).not.toHaveProperty("prescription");
});
