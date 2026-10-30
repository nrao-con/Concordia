import { describe, expect, it } from "vitest";
import { checkStaffStatusTransition } from "../staff-order-status";

describe("staff order status callbacks", () => {
  it("allows compatible fulfillment progression and duplicate callbacks", () => {
    expect(checkStaffStatusTransition("pending", "ready_for_pickup", "pickup")).toBe("apply");
    expect(checkStaffStatusTransition("ready_for_pickup", "picked_up", "pickup")).toBe("apply");
    expect(checkStaffStatusTransition("sent_for_delivery", "delivered", "delivery")).toBe("apply");
    expect(checkStaffStatusTransition("picked_up", "picked_up", "pickup")).toBe("duplicate");
  });

  it("rejects contradictory, out-of-order, or terminal updates", () => {
    expect(checkStaffStatusTransition("pending", "delivered", "delivery")).toBe("conflict");
    expect(checkStaffStatusTransition("ready_for_pickup", "sent_for_delivery", "pickup")).toBe("conflict");
    expect(checkStaffStatusTransition("cancelled", "preparing", "pickup")).toBe("conflict");
    expect(checkStaffStatusTransition("refunded", "preparing", "pickup")).toBe("conflict");
    expect(checkStaffStatusTransition("completed", "preparing", "pickup")).toBe("conflict");
    expect(checkStaffStatusTransition("pending", "preparing", null)).toBe("conflict");
  });
});