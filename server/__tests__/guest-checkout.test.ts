/**
 * Tests: Guest checkout flow (processGuestCheckout)
 *
 * Tests the REAL production function extracted from the guest checkout route
 * into server/guest-checkout-service.ts.  Any future change to the guest
 * checkout logic will be exercised directly by these tests.
 *
 * Scenarios covered:
 *   Happy path           — pending request saved without local stock changes
 *   Product not found    — returns 400 when a productId doesn't exist
 *   Rx-only guard        — returns 400 when product requires a prescription
 *   Out-of-stock guard   — returns 400 when inStock flag is false
 *   Insufficient qty     — returns 400 when requested qty > stockQuantity
 *   Persistence failures — propagate without stock deductions or restocking
 *   Order fields         — createOrder called with correct guest / OTC fields
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IStorage } from "../storage";
import type { Order } from "@shared/schema";
const { notifyStaffAppSale } = vi.hoisted(() => ({
  notifyStaffAppSale: vi.fn().mockResolvedValue(true),
}));
vi.mock("../staff-sync", () => ({ notifyStaffAppSale }));
vi.mock("../staff-catalog", () => ({ verifyStaffAvailability: vi.fn().mockResolvedValue(true) }));
vi.mock("../address-verification", async importOriginal => ({
  ...await importOriginal<typeof import("../address-verification")>(),
  verifyDeliveryAddress: vi.fn().mockResolvedValue({ valid: true }),
}));
import {
  processGuestCheckout as productionProcessGuestCheckout,
  type GuestCheckoutInput,
} from "../guest-checkout-service";
import { verifyStaffAvailability } from "../staff-catalog";
import { verifyDeliveryAddress } from "../address-verification";

const processGuestCheckout = (input: GuestCheckoutInput, storage: IStorage) =>
  productionProcessGuestCheckout(
    { paymentIntentId: input.paymentMethod === "cash" ? undefined : "pi_test_confirmed", ...input },
    storage,
  );

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const productA = {
  id: "prod-a",
  name: "Vitamin C",
  price: "12.99",
  inStock: true,
  stockQuantity: 10,
  requiresPrescription: false,
};

const productB = {
  id: "prod-b",
  name: "Zinc Tablets",
  price: "8.50",
  inStock: true,
  stockQuantity: 5,
  requiresPrescription: false,
};

const mockOrder: Order = {
  id: "order-g-001",
  orderNumber: "ORD-TEST-GUEST-001",
  userId: null,
  status: "pending",
  type: "otc",
  subtotal: "34.48",
  total: "34.48",
  pointsUsed: 0,
  pointsEarned: 0,
  paymentIntentId: null,
  source: "website",
  guestName: "Jane Guest",
  guestPhone: "5551234567",
  guestEmail: "jane@example.com",
  deliveryMethod: "pickup",
  paymentMethod: "cash",
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Order;

const validInput: GuestCheckoutInput = {
  items: [
    { productId: productA.id, quantity: 2 },
    { productId: productB.id, quantity: 1 },
  ],
  guestName: "Jane Guest",
  guestPhone: "5551234567",
  guestEmail: "jane@example.com",
  deliveryMethod: "pickup",
  paymentMethod: "cash",
};

const verifiedDeliveryAddress = {
  label: "898 East Tremont Avenue, New York, NY 10460",
  street: "898 East Tremont Avenue",
  city: "New York",
  state: "NY",
  zipCode: "10460",
  lat: 40.842,
  lon: -73.884,
};

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

function buildMockStorage(overrides: Partial<IStorage> = {}): IStorage {
  return {
    getProduct: vi.fn().mockImplementation(async (id: string) => {
      if (id === productA.id) return { ...productA };
      if (id === productB.id) return { ...productB };
      return undefined;
    }),
    decrementProductStock: vi.fn().mockImplementation(async (id: string, qty: number) => {
      if (id === productA.id) return { ...productA, stockQuantity: productA.stockQuantity - qty };
      if (id === productB.id) return { ...productB, stockQuantity: productB.stockQuantity - qty };
      return undefined;
    }),
    incrementProductStock: vi.fn().mockResolvedValue(undefined),
    createOrder: vi.fn().mockResolvedValue({ ...mockOrder }),
    createOrderItem: vi.fn().mockResolvedValue(undefined),
    // Satisfy remaining IStorage members
    ...({} as IStorage),
    ...overrides,
  } as unknown as IStorage;
}

// ---------------------------------------------------------------------------
// Tests: Happy path
// ---------------------------------------------------------------------------

describe("processGuestCheckout — happy path", () => {
  let storage: IStorage;

  beforeEach(() => {
    storage = buildMockStorage();
    notifyStaffAppSale.mockClear();
  });

  it("reports a saved order with uncertain staff receipt without resubmitting it", async () => {
    notifyStaffAppSale.mockResolvedValueOnce(false);
    const result = await processGuestCheckout(validInput, storage);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.staffHandoff).toBe("needs_review");
    expect(notifyStaffAppSale).toHaveBeenCalledTimes(1);
  });

  it("returns ok:true with order and orderNumber on success", async () => {
    const result = await processGuestCheckout(validInput, storage);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.id).toBe("order-g-001");
      expect(result.orderNumber).toMatch(/^ORD-/);
    }
  });

  it("passes the guest's verified fulfillment details to staff", async () => {
    await processGuestCheckout({
      ...validInput,
      deliveryMethod: "delivery",
      shippingAddress: verifiedDeliveryAddress.label,
      shippingAddressVerification: verifiedDeliveryAddress,
      shippingAddressUnit: "Apt 2",
      correlationId: "guest-correlation-1",
    }, storage);
    expect(notifyStaffAppSale).toHaveBeenCalledWith(
      expect.stringMatching(/^ORD-/),
      validInput.items,
      expect.objectContaining({
        name: validInput.guestName,
        phone: validInput.guestPhone,
        deliveryMethod: "delivery",
        shippingAddress: expect.stringContaining("Apt 2"),
        correlationId: "guest-correlation-1",
      }),
    );
  });

  it("saves the request without deducting or restoring local stock", async () => {
    await processGuestCheckout(validInput, storage);
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });

  it("creates the order with correct OTC and guest fields", async () => {
    await processGuestCheckout(validInput, storage);
    expect(storage.createOrder).toHaveBeenCalledTimes(1);
    expect(storage.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        type: "otc",
        status: "pending",
        guestName: validInput.guestName,
        guestPhone: validInput.guestPhone,
        guestEmail: validInput.guestEmail,
        deliveryMethod: validInput.deliveryMethod,
        paymentMethod: validInput.paymentMethod,
        source: "website",
      })
    );
  });

  it("rejects card/wallet methods even with a claimed payment intent", async () => {
    for (const method of ["credit_card", "apple_pay", "google_pay"] as const) {
      const storage2 = buildMockStorage();
      const result = await processGuestCheckout({ ...validInput, deliveryMethod: "pickup", paymentMethod: method }, storage2);
      expect(result).toMatchObject({ ok: false, status: 503 });
      expect(storage2.createOrder).not.toHaveBeenCalled();
    }
  });

  it("sets paymentStatus to collect_at_counter for cash payment", async () => {
    const storage2 = buildMockStorage();
    await processGuestCheckout({ ...validInput, deliveryMethod: "pickup", paymentMethod: "cash" }, storage2);
    expect(storage2.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "collect_at_counter" })
    );
  });

  it("creates one order item per requested item", async () => {
    await processGuestCheckout(validInput, storage);
    expect(storage.createOrderItem).toHaveBeenCalledTimes(2);
  });

  it("does NOT roll back stock on a successful checkout", async () => {
    await processGuestCheckout(validInput, storage);
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });

  it("computes the correct subtotal from item prices and quantities", async () => {
    const result = await processGuestCheckout(validInput, storage);
    if (result.ok) {
      // 2 × 12.99 + 1 × 8.50 = 34.48
      expect(result.subtotal).toBeCloseTo(34.48, 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Pre-decrement validation guards
// ---------------------------------------------------------------------------

describe("processGuestCheckout — validation guards", () => {
  it("requires a complete phone before contacting Staff or saving an order", async () => {
    for (const guestPhone of ["", "1234567", "not a phone", "123456789012"]) {
      const storage = buildMockStorage();
      expect(await productionProcessGuestCheckout({ ...validInput, guestPhone }, storage)).toMatchObject({ ok: false, status: 400 });
      expect(storage.createOrder).not.toHaveBeenCalled();
    }
  });
  it("fails closed when server-side delivery verification rejects the address", async () => {
    const storage = buildMockStorage();
    vi.mocked(verifyDeliveryAddress).mockResolvedValueOnce({ valid: false, message: "Select a verified address" });
    expect(await productionProcessGuestCheckout({
      ...validInput, deliveryMethod: "delivery", shippingAddress: verifiedDeliveryAddress.label,
      shippingAddressVerification: verifiedDeliveryAddress,
    }, storage)).toMatchObject({ ok: false, status: 400 });
    expect(storage.createOrder).not.toHaveBeenCalled();
  });
  it("rejects an online checkout without a confirmed payment intent", async () => {
    const storage = buildMockStorage();
    const result = await productionProcessGuestCheckout({ ...validInput, paymentMethod: "credit_card" }, storage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(storage.createOrder).not.toHaveBeenCalled();
  });

  it("saves a verified unpaid delivery request without touching stock", async () => {
    const storage = buildMockStorage();
    const result = await productionProcessGuestCheckout({
      ...validInput,
      deliveryMethod: "delivery",
      paymentMethod: "cash",
      shippingAddress: verifiedDeliveryAddress.label,
      shippingAddressVerification: verifiedDeliveryAddress,
    }, storage);
    expect(result.ok).toBe(true);
    expect(storage.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      deliveryMethod: "delivery", paymentStatus: "unpaid", paymentIntentId: null,
      shippingAddress: verifiedDeliveryAddress.label, guestPhone: validInput.guestPhone,
    }));
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
  });

  it("rejects a manually typed delivery address without map verification", async () => {
    const storage = buildMockStorage();
    const result = await processGuestCheckout(
      {
        ...validInput,
        deliveryMethod: "delivery",
        shippingAddress: "123 Fake Street, Bronx, NY 10451",
      },
      storage
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/select a valid delivery address/i);
    }
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.createOrder).not.toHaveBeenCalled();
  });

  it("rejects an address edited after a verified suggestion was selected", async () => {
    const storage = buildMockStorage();
    const result = await processGuestCheckout(
      {
        ...validInput,
        deliveryMethod: "delivery",
        shippingAddress: "123 Fake Street, Bronx, NY 10451",
        shippingAddressVerification: verifiedDeliveryAddress,
      },
      storage
    );

    expect(result.ok).toBe(false);
    expect(storage.createOrder).not.toHaveBeenCalled();
  });

  it("accepts a delivery address whose text exactly matches its map selection", async () => {
    const storage = buildMockStorage();
    const result = await processGuestCheckout(
      {
        ...validInput,
        deliveryMethod: "delivery",
        shippingAddress: verifiedDeliveryAddress.label,
        shippingAddressVerification: verifiedDeliveryAddress,
      },
      storage
    );

    expect(result.ok).toBe(true);
    expect(storage.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMethod: "delivery",
        shippingAddress: verifiedDeliveryAddress.label,
      })
    );
  });

  it("returns 400 when a productId does not exist in storage", async () => {
    const storage = buildMockStorage({
      getProduct: vi.fn().mockResolvedValue(undefined),
    });
    const result = await processGuestCheckout(validInput, storage);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/product not found/i);
    }
  });

  it("returns 400 when any product requires a prescription", async () => {
    const storage = buildMockStorage({
      getProduct: vi.fn().mockResolvedValue({
        ...productA,
        requiresPrescription: true,
      }),
    });
    const result = await processGuestCheckout(validInput, storage);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/prescription/i);
    }
  });

  it("returns 400 when a product's inStock flag is false", async () => {
    const storage = buildMockStorage({
      getProduct: vi.fn().mockResolvedValue({
        ...productA,
        inStock: false,
        stockQuantity: 0,
      }),
    });
    const result = await processGuestCheckout(validInput, storage);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/out of stock/i);
    }
  });

  it("returns 400 when requested quantity exceeds available stock", async () => {
    const storage = buildMockStorage({
      getProduct: vi.fn().mockResolvedValue({
        ...productA,
        stockQuantity: 1,
      }),
    });
    const singleItemInput: GuestCheckoutInput = {
      ...validInput,
      items: [{ productId: productA.id, quantity: 5 }],
    };
    const result = await processGuestCheckout(singleItemInput, storage);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/insufficient stock/i);
    }
  });

  it("does NOT call decrementProductStock when pre-flight validation fails", async () => {
    const storage = buildMockStorage({
      getProduct: vi.fn().mockResolvedValue({ ...productA, inStock: false }),
    });
    await processGuestCheckout(validInput, storage);
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Concurrent checkout rollback
// ---------------------------------------------------------------------------

describe("processGuestCheckout — Staff-only stock ownership", () => {
  it("never uses the website stock mutation APIs", async () => {
    const storage = buildMockStorage({
      decrementProductStock: vi.fn().mockRejectedValue(new Error("Forbidden local deduction")),
      incrementProductStock: vi.fn().mockRejectedValue(new Error("Forbidden local restock")),
    });
    expect((await processGuestCheckout(validInput, storage)).ok).toBe(true);
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });
  it("rejects a Staff preflight shortage before saving or handing off", async () => {
    vi.mocked(verifyStaffAvailability).mockResolvedValueOnce(false);
    const storage = buildMockStorage();
    notifyStaffAppSale.mockClear();
    expect(await processGuestCheckout(validInput, storage)).toMatchObject({ ok: false, status: 409 });
    expect(storage.createOrder).not.toHaveBeenCalled();
    expect(notifyStaffAppSale).not.toHaveBeenCalled();
  });
  it("fails closed when the authoritative preflight is unavailable", async () => {
    vi.mocked(verifyStaffAvailability).mockRejectedValueOnce(new Error("Unavailable"));
    const storage = buildMockStorage();
    expect(await processGuestCheckout(validInput, storage)).toMatchObject({ ok: false, status: 503 });
    expect(storage.createOrder).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Order creation failure rollback
// ---------------------------------------------------------------------------

describe("processGuestCheckout — order creation failure rollback", () => {
  it("rethrows when storage.createOrder throws (mapped to 500 by the route)", async () => {
    const storage = buildMockStorage({
      createOrder: vi.fn().mockRejectedValue(new Error("DB write error")),
    });
    await expect(processGuestCheckout(validInput, storage)).rejects.toThrow(
      "DB write error"
    );
  });

  it("does not mutate stock when order creation throws", async () => {
    const storage = buildMockStorage({
      createOrder: vi.fn().mockRejectedValue(new Error("DB write error")),
    });
    await expect(processGuestCheckout(validInput, storage)).rejects.toThrow();
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Order item creation failure rollback
// ---------------------------------------------------------------------------

describe("processGuestCheckout — order item creation failure rollback", () => {
  it("rethrows when storage.createOrderItem throws", async () => {
    const storage = buildMockStorage({
      createOrderItem: vi.fn().mockRejectedValue(new Error("Item write error")),
    });
    await expect(processGuestCheckout(validInput, storage)).rejects.toThrow(
      "Item write error"
    );
  });

  it("does not mutate stock when createOrderItem throws", async () => {
    const storage = buildMockStorage({
      createOrderItem: vi.fn().mockRejectedValue(new Error("Item write error")),
    });
    await expect(processGuestCheckout(validInput, storage)).rejects.toThrow();
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });
});
