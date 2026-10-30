import { describe, expect, it } from "vitest";
import {
  extractCommonStoreItem,
  extractPendingPickupItems,
  extractStoreItemPreference,
  extractUnmatchedPickupItem,
  getPickupWindowFromFreeText,
  isExplicitShopSearch,
  isGenericMedicationAndGroceryRequest,
  isPastPickupWindow,
  isPrescriptionReadinessRequest,
  isStoreItemCollectionComplete,
  resolveStoreCollectionTurn,
} from "../lib/chat-request-routing";

describe("chat pickup-window regression", () => {
  it("routes an unverified existing-prescription readiness question away from new pickup scheduling", () => {
    expect(isPrescriptionReadinessRequest("hi i am jd i want my rx ready about to pick up")).toBe(true);
    expect(isPrescriptionReadinessRequest("Is my prescription ready?")).toBe(true);
    expect(isPrescriptionReadinessRequest("I want to pick up eggs")).toBe(false);
    expect(isPrescriptionReadinessRequest("I need to pick up my prescription tomorrow")).toBe(false);
  });

  it("asks again when a same-day time has passed in pharmacy local time", () => {
    const now = new Date("2026-09-28T19:03:00Z"); // 3:03 PM in New York
    expect(isPastPickupWindow("after 1pm today\\", now)).toBe(true);
    expect(isPastPickupWindow("today at 3:03 PM", now)).toBe(true);
    expect(isPastPickupWindow("Today after 4 PM", now)).toBe(false);
    expect(isPastPickupWindow("Tomorrow morning", now)).toBe(false);
    expect(isPastPickupWindow("tomorrow after 1pm", now)).toBe(false);
    expect(isPastPickupWindow("Next available", now)).toBe(false);
    expect(isPastPickupWindow("after work", now)).toBe(false);
  });

  it("accepts a nonblank free-text pickup window only on the pickup step", () => {
    expect(getPickupWindowFromFreeText("  5pm  ", "pickup_time", "pickup")).toBe("5pm");
    expect(getPickupWindowFromFreeText("today at 5 PM", "pickup_time", "pickup")).toBe("today at 5 PM");
    expect(getPickupWindowFromFreeText("after work", "pickup_time", "pickup")).toBe("after work");
  });

  it("leaves blank, delivery, and other-step replies untouched", () => {
    expect(getPickupWindowFromFreeText("   ", "pickup_time", "pickup")).toBeNull();
    expect(getPickupWindowFromFreeText("5pm", "pickup_time", "delivery")).toBeNull();
    expect(getPickupWindowFromFreeText("5pm", "free_chat", "pickup")).toBeNull();
  });

  it("keeps an unmatched grocery item from a mixed pickup request pending for staff", () => {
    expect(extractUnmatchedPickupItem("i want to pickup some eggs")).toBe("eggs");
    expect(extractUnmatchedPickupItem("i want to pick up some eggs")).toBe("eggs");
    expect(extractUnmatchedPickupItem("i want pickup")).toBeNull();
    expect(extractUnmatchedPickupItem("i want to pick up my meds")).toBeNull();
  });

  it("keeps eggs when pickup and medication requests share one sentence", () => {
    expect(extractPendingPickupItems(
      "i want to pickup some eggs and also want my meds ready",
    )).toEqual(["eggs"]);
  });

  it("recognizes a vague Spanglish medication and grocery request for clarification", () => {
    expect(isGenericMedicationAndGroceryRequest("un de medicina and the grocerry")).toBe(true);
    expect(isGenericMedicationAndGroceryRequest("medicina and groceries")).toBe(true);
    expect(isGenericMedicationAndGroceryRequest("medicina para dolor")).toBe(false);
    expect(isGenericMedicationAndGroceryRequest("I need groceries")).toBe(false);
  });

  it("keeps ordinary store items out of gibberish recovery", () => {
    expect(extractCommonStoreItem("water")).toBe("water");
    expect(extractCommonStoreItem("juice")).toBe("juice");
    expect(extractCommonStoreItem("I need sugar free drinks")).toBe("sugar-free drinks");
    expect(extractStoreItemPreference("sugar free")).toBe("sugar-free");
    expect(extractStoreItemPreference("sin azúcar")).toBe("sin azúcar");
    expect(isStoreItemCollectionComplete("done")).toBe(true);
    expect(isStoreItemCollectionComplete("listo")).toBe(true);
  });

  it("fills store-item slots across turns like an ordering assistant", () => {
    const water = resolveStoreCollectionTurn("water", []);
    expect(water).toEqual({ kind: "add", item: "water", items: ["water"] });

    const juice = resolveStoreCollectionTurn("juice", water?.items ?? []);
    expect(juice).toEqual({ kind: "add", item: "juice", items: ["water", "juice"] });

    const preference = resolveStoreCollectionTurn("sugar free", juice?.items ?? []);
    expect(preference).toEqual({
      kind: "update",
      previousItem: "juice",
      item: "sugar-free juice",
      items: ["water", "sugar-free juice"],
    });

    expect(resolveStoreCollectionTurn("done", preference?.items ?? [])).toEqual({
      kind: "complete",
      items: ["water", "sugar-free juice"],
    });
  });

  it("only offers shop search for an explicit shopping request", () => {
    expect(isExplicitShopSearch("what aure i")).toBe(false);
    expect(isExplicitShopSearch("aure")).toBe(false);
    expect(isExplicitShopSearch("search the shop for water")).toBe(true);
    expect(isExplicitShopSearch("do you carry sugar-free juice")).toBe(true);
  });
});