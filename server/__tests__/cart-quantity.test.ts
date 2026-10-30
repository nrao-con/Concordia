import { describe, expect, it } from "vitest";
import {
  getAvailableProductQuantity,
  getQuantityAfterAdd,
} from "@shared/cart-utils";

describe("cart stock quantity helpers", () => {
  it("treats disabled and zero-quantity products as unavailable", () => {
    expect(getAvailableProductQuantity({ inStock: false, stockQuantity: 12 })).toBe(0);
    expect(getAvailableProductQuantity({ inStock: true, stockQuantity: 0 })).toBe(0);
  });

  it("returns the available inventory for an in-stock product", () => {
    expect(getAvailableProductQuantity({ inStock: true, stockQuantity: 7 })).toBe(7);
  });

  it("caps a merged cart quantity at available inventory", () => {
    expect(getQuantityAfterAdd(3, 6, 5)).toBe(5);
    expect(getQuantityAfterAdd(1, 2, 5)).toBe(3);
  });
});