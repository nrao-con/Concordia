import { describe, expect, it } from "vitest";
import { FIVE_REFILL_CREDIT_POINTS, getRefillDisqualificationReason } from "../refill-credit-service";

describe("five-refill member credit eligibility", () => {
  it("uses 20,000 points for a $20 store credit at 1,000 points per dollar", () => {
    expect(FIVE_REFILL_CREDIT_POINTS).toBe(20000);
  });

  it.each(["II", "III", "IV", "V", "C2"])("excludes controlled medication schedule %s", (deaSchedule) => {
    expect(getRefillDisqualificationReason({ qtyOrdered: "30", qtyDispensed: "30", deaSchedule })).toBe("controlled");
  });

  it("excludes partial fills", () => {
    expect(getRefillDisqualificationReason({ qtyOrdered: "30", qtyDispensed: "15", deaSchedule: "none" })).toBe("partial");
  });

  it("allows a full non-controlled fill", () => {
    expect(getRefillDisqualificationReason({ qtyOrdered: "30", qtyDispensed: "30", deaSchedule: "none" })).toBeNull();
  });

  it("fails closed when controlled status or quantities are unknown", () => {
    expect(getRefillDisqualificationReason({ qtyOrdered: "30", qtyDispensed: "30", deaSchedule: null })).toBe("unknown");
    expect(getRefillDisqualificationReason({ qtyOrdered: null, qtyDispensed: "30", deaSchedule: "none" })).toBe("unknown");
    expect(getRefillDisqualificationReason({ qtyOrdered: "0", qtyDispensed: "30", deaSchedule: "none" })).toBe("unknown");
    expect(getRefillDisqualificationReason({ qtyOrdered: "-1", qtyDispensed: "30", deaSchedule: "none" })).toBe("unknown");
  });
});