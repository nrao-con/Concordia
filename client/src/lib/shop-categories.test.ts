import { describe, expect, it } from "vitest";
import { getShopCategory } from "./shop-categories";

describe("getShopCategory", () => {
  it.each([
    ["Hershey's Milk Chocolate", "Candy & Snacks"],
    ["Reese's Peanut Butter Cups", "Candy & Snacks"],
    ["Butterfinger Bar", "Candy & Snacks"],
    ["Blow Pops", "Candy & Snacks"],
    ["Tootsie Roll", "Candy & Snacks"],
    ["Junior Mints", "Candy & Snacks"],
    ["Mr Goodbar", "Candy & Snacks"],
    ["Sugar Daddy", "Candy & Snacks"],
    ["Fluffy Stuff", "Candy & Snacks"],
    ["Sweet Pops", "Candy & Snacks"],
    ["Sweet & Sour Pops", "Candy & Snacks"],
    ["Whatchamacallit", "Candy & Snacks"],
    ["York Peppermint Patties", "Candy & Snacks"],
    ["Alcohol Swabsticks", "First Aid & Medical Supplies"],
    ["Cotton Tip Applicators", "First Aid & Medical Supplies"],
    ["Drain SG", "First Aid & Medical Supplies"],
    ["Sponge NW SG", "First Aid & Medical Supplies"],
    ["Tegaderm dressing", "First Aid & Medical Supplies"],
    ["Sterile gauze pads", "First Aid & Medical Supplies"],
    ["Adhesive bandages", "First Aid & Medical Supplies"],
    ["Tylenol Extra Strength", "Pain Relief"],
    ["Ibuprofen 200 mg", "Pain Relief"],
    ["Acetaminophen tablets", "Pain Relief"],
    ["Soothe DR", "Eye Care"],
    ["Eye drops", "Eye Care"],
    ["Veet Hair Removal", "Personal Care"],
    ["Juven nutrition", "Vitamins & Nutrition"],
    ["Daily vitamins", "Vitamins & Nutrition"],
    ["Colon Cleanse", "Digestive Care"],
  ])("groups %s as %s", (name, category) => {
    expect(getShopCategory({ name, category: "General" })).toBe(category);
  });

  it("leaves unrecognized products in General", () => {
    expect(getShopCategory({ name: "Everyday wellness essentials", category: "other" })).toBe("General");
    expect(getShopCategory({ name: "Vitamin-like aroma candle", category: "uncategorized" })).toBe("General");
  });

  it("preserves a specific Staff category after trimming", () => {
    expect(getShopCategory({ name: "Tylenol", category: "  Staff Curated  " })).toBe("Staff Curated");
  });

  it("normalizes generic label casing and whitespace before inference", () => {
    expect(getShopCategory({ name: "Tylenol", category: "  gEnErAl " })).toBe("Pain Relief");
    expect(getShopCategory({ name: "Unknown item", category: " OTHER " })).toBe("General");
  });

  it("handles empty and missing categories", () => {
    expect(getShopCategory({ name: "Unknown item", category: "   " })).toBe("General");
    expect(getShopCategory({ name: "Unknown item" })).toBe("General");
  });
});
