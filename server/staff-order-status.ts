export type StaffFulfillmentStatus =
  | "preparing"
  | "ready_for_pickup"
  | "sent_for_delivery"
  | "delivered"
  | "picked_up";

export function checkStaffStatusTransition(
  current: string,
  next: StaffFulfillmentStatus,
  deliveryMethod: string | null | undefined,
): "apply" | "duplicate" | "conflict" {
  if (current === next) return "duplicate";
  if (deliveryMethod !== "pickup" && deliveryMethod !== "delivery") return "conflict";
  if (current === "cancelled" || current === "refunded" ||
      current === "completed" || current === "delivered" || current === "picked_up") {
    return "conflict";
  }
  if (next === "preparing") {
    return ["pending", "processing"].includes(current) ? "apply" : "conflict";
  }
  if (next === "ready_for_pickup") {
    return deliveryMethod === "pickup" && ["pending", "processing", "preparing"].includes(current)
      ? "apply" : "conflict";
  }
  if (next === "sent_for_delivery") {
    return deliveryMethod === "delivery" && ["pending", "processing", "preparing"].includes(current)
      ? "apply" : "conflict";
  }
  if (next === "picked_up") {
    return deliveryMethod === "pickup" && current === "ready_for_pickup" ? "apply" : "conflict";
  }
  return deliveryMethod === "delivery" && current === "sent_for_delivery" ? "apply" : "conflict";
}