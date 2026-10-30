import { describe, expect, it } from "vitest";
import { selectWeeklyPicks } from "./shop-weekly-picks";

const inventory = Array.from({ length: 16 }, (_, index) => ({
  id: `staff-${index}`, inStock: true, stockQuantity: 10, requiresPrescription: false,
}));
const monday = new Date("2026-10-26T04:00:00Z");
const ids = (items: Array<{ id: string }>) => items.map((p) => p.id);

describe("weekly shop picks", () => {
  it("keeps a stable selection all week, independent of feed order", () => {
    expect(ids(selectWeeklyPicks([...inventory].reverse(), new Date("2026-10-30T19:00:00Z"))))
      .toEqual(ids(selectWeeklyPicks(inventory, monday)));
  });

  it("rotates at Monday midnight in New York, including DST changes", () => {
    const before = ids(selectWeeklyPicks(inventory, new Date("2026-11-02T04:59:59Z")));
    const after = ids(selectWeeklyPicks(inventory, new Date("2026-11-02T05:00:00Z")));
    expect(before).toEqual(ids(selectWeeklyPicks(inventory, monday)));
    expect(after).not.toEqual(before);
    expect(after.some((id) => before.includes(id))).toBe(false);
  });

  it("excludes Rx, unavailable, zero-stock and unknown-stock products", () => {
    const products = [
      ...inventory.slice(0, 1),
      { id: "rx", inStock: true, stockQuantity: 2, requiresPrescription: true },
      { id: "off", inStock: false, stockQuantity: 2 },
      { id: "zero", inStock: true, stockQuantity: 0 },
      { id: "unknown", inStock: true },
    ];
    expect(ids(selectWeeklyPicks(products, monday))).toEqual(["staff-0"]);
  });

  it("immediately excludes an item that sells out", () => {
    const selected = selectWeeklyPicks(inventory, monday);
    const changed = inventory.map((p) => p.id === selected[0].id ? { ...p, stockQuantity: 0 } : p);
    expect(ids(selectWeeklyPicks(changed, monday))).not.toContain(selected[0].id);
  });

  it("does not mutate the source or duplicate products", () => {
    const copy = structuredClone(inventory);
    const picks = selectWeeklyPicks([...inventory, inventory[0]], monday);
    expect(new Set(ids(picks)).size).toBe(4);
    expect(inventory).toEqual(copy);
  });

  it("handles empty and limited inventories without invented products", () => {
    expect(selectWeeklyPicks([], monday)).toEqual([]);
    expect(selectWeeklyPicks(inventory.slice(0, 2), monday)).toHaveLength(2);
    expect(selectWeeklyPicks(inventory, monday, 0)).toEqual([]);
  });

  it("changes selections for small catalogs when a different set is possible", () => {
    const small = inventory.slice(0, 5);
    expect(new Set(ids(selectWeeklyPicks(small, monday))))
      .not.toEqual(new Set(ids(selectWeeklyPicks(small, new Date("2026-11-02T05:00:00Z")))));
  });
});
