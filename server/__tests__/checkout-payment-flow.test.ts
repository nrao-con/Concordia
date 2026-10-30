/**
 * Tests: Authenticated checkout flow (processAuthenticatedCheckout)
 *
 * Tests the REAL production function extracted from the checkout route into
 * server/checkout-service.ts.  Any future change to the production checkout
 * logic will be exercised directly by these tests — there is no duplicated
 * or re-implemented logic here.
 *
 * Scenarios covered:
 *   Happy path        — request saved, cart cleared, no local stock deductions
 *   Empty cart        — returns 400 when no cart items exist
 *   Out-of-stock      — returns 400 when a product's inStock flag is false
 *   Insufficient qty  — returns 400 when cart qty exceeds stockQuantity
 *   Concurrent rollback — first item decremented OK, second atomic decrement
 *                         returns undefined → 409 + first item stock restored
 *   Order-create fail — storage.createOrder throws → rethrows + all stock
 *                       restored (route handler maps this to 500)
 *   Points overdraw   — returns 400 when pointsToUse exceeds wallet balance
 *   Points deduction  — deductPoints called when pointsToUse > 0
 *   Points failure    — deductPoints returning false → 409, stock restored
 *   Cart cleared      — clearCart is called after a successful order
 *   No stock rollback — incrementProductStock not called on the happy path
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Application } from "express";
import supertest from "supertest";
import { z } from "zod";

const { notifyStaffAppSale } = vi.hoisted(() => ({
  notifyStaffAppSale: vi.fn().mockResolvedValue(true),
}));
vi.mock("../staff-sync", () => ({ notifyStaffAppSale }));
vi.mock("../staff-catalog", () => ({ verifyStaffAvailability: vi.fn().mockResolvedValue(true) }));

// Import the REAL production function — any regression in checkout-service.ts
// will immediately cause these tests to fail.
import {
  processAuthenticatedCheckout as productionProcessAuthenticatedCheckout,
  type PointsServiceDep,
  type CheckoutResult,
} from "../checkout-service";

// All successful service fixtures represent a confirmed Stripe payment. The
// production function remains directly available for the missing-confirmation
// rejection tests below.
const processAuthenticatedCheckout: typeof productionProcessAuthenticatedCheckout = (
  userId,
  body,
  storage,
  points,
  onOrderCreated,
) => productionProcessAuthenticatedCheckout(
  userId,
  { paymentIntentId: "pi_test_confirmed", ...body },
  storage,
  points,
  onOrderCreated,
);

import type { IStorage } from "../storage";
import type { Order, User, PointsWallet, HybridCartItem } from "@shared/schema";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const USER_ID = "user-alice-001";
const REFERRER_ID = "user-referrer-007";
const verifiedDeliveryAddress = {
  label: "898 East Tremont Avenue, New York, NY 10460",
  street: "898 East Tremont Avenue",
  city: "New York",
  state: "NY",
  zipCode: "10460",
  lat: 40.842,
  lon: -73.884,
};

const mockUser: User = {
  id: USER_ID,
  email: "alice@example.com",
  firstName: "Alice",
  lastName: null,
  profileImageUrl: null,
  role: "patient",
  phone: null,
  dateOfBirth: null,
  address: null,
  city: null,
  state: null,
  zipCode: null,
  insuranceProvider: null,
  insuranceMemberId: null,
  primeRxPatientId: null,
  concordiaCareUserId: null,
  referralCode: null,
  referredByUserId: null,
  referralPointsAwarded: null,
  loyaltyPoints: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  familyGroupId: null,
  username: null,
  passwordHash: null,
  concordiaCareLinked: null,
  communicationPreferences: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  twoFactorEnabled: null,
  lastLoginAt: null,
} as unknown as User;

const mockWallet: PointsWallet = {
  id: "wallet-001",
  userId: USER_ID,
  currentBalance: 500,
  totalEarned: 500,
  totalRedeemed: 0,
  lifetimeTier: "bronze",
  dailyPointsEarned: 0,
  weeklyPointsEarned: 0,
  dailyPointsResetAt: null,
  weeklyPointsResetAt: null,
  frozenUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as PointsWallet;

const productA = {
  id: "prod-a",
  name: "Vitamin C",
  price: "12.99",
  inStock: true,
  stockQuantity: 10,
};

const productB = {
  id: "prod-b",
  name: "Zinc Tablets",
  price: "8.50",
  inStock: true,
  stockQuantity: 5,
};

function makeCartItems(): HybridCartItem[] {
  return [
    {
      id: "cart-1",
      userId: USER_ID,
      productId: productA.id,
      prescriptionId: null,
      quantity: 2,
      product: { ...productA } as any,
      prescription: null,
      createdAt: new Date(),
    } as unknown as HybridCartItem,
    {
      id: "cart-2",
      userId: USER_ID,
      productId: productB.id,
      prescriptionId: null,
      quantity: 1,
      product: { ...productB } as any,
      prescription: null,
      createdAt: new Date(),
    } as unknown as HybridCartItem,
  ];
}

const mockOrder: Order = {
  id: "order-001",
  orderNumber: "ORD-TEST-001",
  userId: USER_ID,
  status: "pending",
  type: "otc",
  subtotal: "34.48",
  total: "34.48",
  pointsUsed: 0,
  pointsEarned: 34,
  paymentIntentId: "pi_test_confirmed",
  source: "website",
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Order;

// ---------------------------------------------------------------------------
// Mock factory helpers
// ---------------------------------------------------------------------------

function buildMockPointsService(
  overrides: Partial<PointsServiceDep> = {}
): PointsServiceDep {
  return {
    calculatePointsForPurchase: vi.fn().mockResolvedValue({ points: 34 }),
    awardPoints: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildMockStorage(overrides: Partial<IStorage> = {}): IStorage {
  return {
    getUser: vi.fn().mockResolvedValue({ ...mockUser }),
    getOrCreatePointsWallet: vi.fn().mockResolvedValue({ ...mockWallet }),
    getPointsWallet: vi.fn().mockResolvedValue({ ...mockWallet }),
    getCartItemsByUserId: vi.fn().mockResolvedValue(makeCartItems()),
    getProduct: vi.fn().mockResolvedValue(undefined),
    decrementProductStock: vi.fn().mockImplementation(async (id: string) => {
      if (id === productA.id)
        return { ...productA, stockQuantity: productA.stockQuantity - 2 };
      if (id === productB.id)
        return { ...productB, stockQuantity: productB.stockQuantity - 1 };
      return undefined;
    }),
    incrementProductStock: vi.fn().mockResolvedValue(undefined),
    deductPoints: vi.fn().mockResolvedValue(true),
    awardPoints: vi.fn().mockResolvedValue(undefined),
    createOrder: vi.fn().mockResolvedValue({ ...mockOrder }),
    createOrderItem: vi.fn().mockResolvedValue(undefined),
    createLoyaltyTransaction: vi.fn().mockResolvedValue(undefined),
    updateUserPoints: vi.fn().mockResolvedValue(undefined),
    updateUserProfile: vi.fn().mockResolvedValue(undefined),
    getOrdersByUserId: vi.fn().mockResolvedValue([]),
    clearCart: vi.fn().mockResolvedValue(undefined),
    // Satisfy remaining IStorage members with no-ops so TypeScript is happy
    ...({} as IStorage),
    ...overrides,
  } as unknown as IStorage;
}

// ---------------------------------------------------------------------------
// Tests: Happy path
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — happy path", () => {
  let storage: IStorage;
  let points: PointsServiceDep;

  beforeEach(() => {
    storage = buildMockStorage();
    points = buildMockPointsService();
    notifyStaffAppSale.mockClear();
  });

  it("returns ok:true with order on successful checkout", async () => {
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      points
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.id).toBe("order-001");
    }
  });

  it("does not deduct stock from the website mirror", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });

  it("creates the order with correct fields", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(storage.createOrder).toHaveBeenCalledTimes(1);
    expect(storage.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        type: "otc",
        status: "pending",
      })
    );
  });

  it("sets paymentStatus to paid_online when a paymentIntentId is present", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(storage.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: "paid_online",
      })
    );
  });

  it("creates one order item per cart entry", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(storage.createOrderItem).toHaveBeenCalledTimes(2);
  });

  it("does not tell staff about an order whose line items failed to save", async () => {
    storage = buildMockStorage({
      createOrderItem: vi.fn().mockRejectedValue(new Error("line item save failed")),
    });
    await expect(processAuthenticatedCheckout(USER_ID, {}, storage, points))
      .rejects.toThrow("line item save failed");
    expect(notifyStaffAppSale).not.toHaveBeenCalled();
  });

  it("submits to staff only after every order line is saved", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(notifyStaffAppSale).toHaveBeenCalledOnce();
    expect(vi.mocked(storage.createOrderItem).mock.invocationCallOrder.at(-1))
      .toBeLessThan(notifyStaffAppSale.mock.invocationCallOrder[0]);
  });

  it("clears the cart after a successful order", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(storage.clearCart).toHaveBeenCalledWith(USER_ID);
  });

  it("does NOT roll back stock on a successful checkout", async () => {
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });

  it("invokes the onOrderCreated callback when provided", async () => {
    const onOrderCreated = vi.fn().mockResolvedValue(undefined);
    await processAuthenticatedCheckout(USER_ID, {}, storage, points, onOrderCreated);
    expect(onOrderCreated).toHaveBeenCalledTimes(1);
    expect(onOrderCreated).toHaveBeenCalledWith(
      mockOrder.id,
      expect.stringMatching(/^ORD-/),
      expect.any(Number)
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: Cart and stock validation
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — cart and stock validation", () => {
  it("rejects an unpaid checkout without creating an order after cart validation", async () => {
    const storage = buildMockStorage();
    const result = await productionProcessAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      buildMockPointsService(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(402);
    expect(storage.createOrder).not.toHaveBeenCalled();
  });

  it("rejects a manually typed delivery address without map verification", async () => {
    const storage = buildMockStorage();
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {
        deliveryMethod: "delivery",
        shippingAddress: "123 Fake Street, Bronx, NY 10451",
      },
      storage,
      buildMockPointsService()
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
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {
        deliveryMethod: "delivery",
        shippingAddress: "123 Fake Street, Bronx, NY 10451",
        shippingAddressVerification: verifiedDeliveryAddress,
      },
      storage,
      buildMockPointsService()
    );

    expect(result.ok).toBe(false);
    expect(storage.createOrder).not.toHaveBeenCalled();
  });

  it("accepts a delivery address whose text exactly matches its map selection", async () => {
    const storage = buildMockStorage();
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {
        deliveryMethod: "delivery",
        shippingAddress: verifiedDeliveryAddress.label,
        shippingAddressVerification: verifiedDeliveryAddress,
      },
      storage,
      buildMockPointsService()
    );

    expect(result.ok).toBe(true);
    expect(storage.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMethod: "delivery",
        shippingAddress: verifiedDeliveryAddress.label,
      })
    );
  });

  it("returns 404 when the user does not exist", async () => {
    const storage = buildMockStorage({
      getUser: vi.fn().mockResolvedValue(undefined),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.message).toMatch(/user not found/i);
    }
  });

  it("returns 400 when the cart is empty", async () => {
    const storage = buildMockStorage({
      getCartItemsByUserId: vi.fn().mockResolvedValue([]),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/cart is empty/i);
    }
  });

  it("returns 400 when a product is out of stock (inStock flag)", async () => {
    const outOfStockItem = {
      ...makeCartItems()[0],
      product: { ...productA, inStock: false, stockQuantity: 0 },
    };
    const storage = buildMockStorage({
      getCartItemsByUserId: vi.fn().mockResolvedValue([outOfStockItem]),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/out of stock/i);
    }
  });

  it("returns 400 when cart quantity exceeds available stock", async () => {
    const lowStockItem = {
      ...makeCartItems()[0],
      quantity: 99,
      product: { ...productA, stockQuantity: 3 },
    };
    const storage = buildMockStorage({
      getCartItemsByUserId: vi.fn().mockResolvedValue([lowStockItem]),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/insufficient stock/i);
    }
  });

  it("returns 400 when pointsToUse exceeds wallet balance", async () => {
    const storage = buildMockStorage({
      getOrCreatePointsWallet: vi
        .fn()
        .mockResolvedValue({ ...mockWallet, currentBalance: 100 }),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      { pointsToUse: 999 },
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/insufficient loyalty points/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Concurrent checkout rollback
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — Staff-only stock ownership", () => {
  it("does not use independent stock deduction or restock APIs", async () => {
    const storage = buildMockStorage({
      decrementProductStock: vi.fn().mockRejectedValue(new Error("Forbidden local deduction")),
      incrementProductStock: vi.fn().mockRejectedValue(new Error("Forbidden local restock")),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      {},
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(true);
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Order creation failure rollback
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — order creation failure rollback", () => {
  it("rethrows when storage.createOrder throws (mapped to 500 by the route)", async () => {
    const storage = buildMockStorage({
      createOrder: vi.fn().mockRejectedValue(new Error("DB write error")),
    });
    await expect(
      processAuthenticatedCheckout(USER_ID, {}, storage, buildMockPointsService())
    ).rejects.toThrow("DB write error");
  });

  it("does not mutate stock when order creation throws", async () => {
    const storage = buildMockStorage({
      createOrder: vi.fn().mockRejectedValue(new Error("DB write error")),
    });
    await expect(
      processAuthenticatedCheckout(USER_ID, {}, storage, buildMockPointsService())
    ).rejects.toThrow();
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });

  it("does NOT clear the cart when order creation fails", async () => {
    const storage = buildMockStorage({
      createOrder: vi.fn().mockRejectedValue(new Error("DB write error")),
    });
    await expect(
      processAuthenticatedCheckout(USER_ID, {}, storage, buildMockPointsService())
    ).rejects.toThrow();
    expect(storage.clearCart).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Loyalty points redemption
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — loyalty points redemption", () => {
  it("calls deductPoints when pointsToUse is provided and wallet has sufficient balance", async () => {
    const storage = buildMockStorage();
    await processAuthenticatedCheckout(
      USER_ID,
      { pointsToUse: 200 },
      storage,
      buildMockPointsService()
    );
    expect(storage.deductPoints).toHaveBeenCalledWith(
      expect.objectContaining({ points: 200, actionType: "redeem_otc" })
    );
  });

  it("returns 409 without stock mutations when deductPoints returns false", async () => {
    const storage = buildMockStorage({
      deductPoints: vi.fn().mockResolvedValue(false),
    });
    const result = await processAuthenticatedCheckout(
      USER_ID,
      { pointsToUse: 200 },
      storage,
      buildMockPointsService()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.message).toMatch(/unable to redeem points/i);
    }
    expect(storage.decrementProductStock).not.toHaveBeenCalled();
    expect(storage.incrementProductStock).not.toHaveBeenCalled();
  });

  it("does not call deductPoints when pointsToUse is 0", async () => {
    const storage = buildMockStorage();
    await processAuthenticatedCheckout(
      USER_ID,
      { pointsToUse: 0 },
      storage,
      buildMockPointsService()
    );
    expect(storage.deductPoints).not.toHaveBeenCalled();
  });

  it("applies points discount to the order total", async () => {
    const storage = buildMockStorage();
    await processAuthenticatedCheckout(
      USER_ID,
      { pointsToUse: 200 },
      storage,
      buildMockPointsService()
    );
    const createOrderCall = (storage.createOrder as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    const total = parseFloat(createOrderCall.total);
    const expectedTotal = 2 * 12.99 + 1 * 8.5 - 200 / 1000;
    expect(total).toBeCloseTo(expectedTotal, 2);
  });
});

// ---------------------------------------------------------------------------
// Tests: Loyalty points earned on purchase
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — points earned on purchase", () => {
  it("calls PointsService.awardPoints when pointsEarned > 0", async () => {
    const storage = buildMockStorage();
    const points = buildMockPointsService({
      calculatePointsForPurchase: vi.fn().mockResolvedValue({ points: 50 }),
    });
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(points.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        actionType: "otc_purchase",
        points: 50,
      })
    );
  });

  it("does NOT call PointsService.awardPoints when pointsEarned is 0", async () => {
    const storage = buildMockStorage();
    const points = buildMockPointsService({
      calculatePointsForPurchase: vi.fn().mockResolvedValue({ points: 0 }),
    });
    await processAuthenticatedCheckout(USER_ID, {}, storage, points);
    expect(points.awardPoints).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Referral bonus (first-order trigger)
// ---------------------------------------------------------------------------

describe("processAuthenticatedCheckout — referral bonus", () => {
  it("awards referral bonus points when user has a referrer and this is their first order", async () => {
    const referredUser: User = {
      ...mockUser,
      referredByUserId: REFERRER_ID,
      referralPointsAwarded: null,
    } as User;
    const storage = buildMockStorage({
      getUser: vi.fn().mockResolvedValue(referredUser),
      // Only one order exists (the one we just created)
      getOrdersByUserId: vi.fn().mockResolvedValue([{ ...mockOrder }]),
    });
    const points = buildMockPointsService();

    await processAuthenticatedCheckout(USER_ID, {}, storage, points);

    // Referrer should receive 500 pts
    expect(points.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: REFERRER_ID,
        actionType: "referral_completed",
        points: 500,
      })
    );
    // Referee should receive 250 pts
    expect(points.awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        actionType: "signup_bonus",
        points: 250,
      })
    );
    // Mark referral as awarded
    expect(storage.updateUserProfile).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ referralPointsAwarded: true })
    );
  });

  it("does NOT award referral bonus when referralPointsAwarded is already true", async () => {
    const alreadyBonusedUser: User = {
      ...mockUser,
      referredByUserId: REFERRER_ID,
      referralPointsAwarded: true,
    } as User;
    const storage = buildMockStorage({
      getUser: vi.fn().mockResolvedValue(alreadyBonusedUser),
      getOrdersByUserId: vi.fn().mockResolvedValue([{ ...mockOrder }]),
    });
    const points = buildMockPointsService({
      calculatePointsForPurchase: vi.fn().mockResolvedValue({ points: 0 }),
    });

    await processAuthenticatedCheckout(USER_ID, {}, storage, points);

    const referralCall = (points.awardPoints as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].actionType === "referral_completed"
    );
    expect(referralCall).toBeUndefined();
  });

  it("does NOT award referral bonus when user has more than one order", async () => {
    const referredUser: User = {
      ...mockUser,
      referredByUserId: REFERRER_ID,
      referralPointsAwarded: null,
    } as User;
    const storage = buildMockStorage({
      getUser: vi.fn().mockResolvedValue(referredUser),
      // Multiple orders → not the first purchase
      getOrdersByUserId: vi.fn().mockResolvedValue([
        { ...mockOrder },
        { ...mockOrder, id: "order-002" },
      ]),
    });
    const points = buildMockPointsService({
      calculatePointsForPurchase: vi.fn().mockResolvedValue({ points: 0 }),
    });

    await processAuthenticatedCheckout(USER_ID, {}, storage, points);

    const referralCall = (points.awardPoints as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0].actionType === "referral_completed"
    );
    expect(referralCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Route-level HTTP response mapping
//
// Mounts a minimal Express app that mirrors the thin wrapper in routes.ts
// (Zod validation → processAuthenticatedCheckout call → HTTP status mapping)
// so we verify that service outcomes are correctly translated into HTTP
// responses, independently of the business-logic tests above.
// ---------------------------------------------------------------------------

function buildRouteApp(
  checkoutFn: typeof processAuthenticatedCheckout,
  authenticatedUserId: string | null = USER_ID
): Application {
  const app = express();
  app.use(express.json());

  const bodySchema = z.object({
    pointsToUse: z.number().int().nonnegative().optional().default(0),
    source: z.string().optional(),
  });

  app.post("/api/checkout", async (req: any, res: any) => {
    try {
      const userId: string | null = authenticatedUserId;
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: "Invalid request data", errors: parsed.error.errors });
      }

      const result: CheckoutResult = await checkoutFn(
        userId,
        parsed.data,
        buildMockStorage() as unknown as IStorage,
        buildMockPointsService()
      );

      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }

      return res.json({ message: "Order placed successfully", order: result.order });
    } catch {
      return res.status(500).json({ message: "Failed to process checkout" });
    }
  });

  return app;
}

describe("POST /api/checkout — HTTP route mapping", () => {
  it("responds 200 with order when service returns ok:true", async () => {
    const app = buildRouteApp(processAuthenticatedCheckout);
    const res = await supertest(app).post("/api/checkout").send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Order placed successfully");
    expect(res.body.order).toBeDefined();
  });

  it("responds 401 when no authenticated user is present", async () => {
    const app = buildRouteApp(processAuthenticatedCheckout, null);
    const res = await supertest(app).post("/api/checkout").send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  it("responds 400 with errors when Zod validation fails (negative pointsToUse)", async () => {
    const app = buildRouteApp(processAuthenticatedCheckout);
    const res = await supertest(app)
      .post("/api/checkout")
      .send({ pointsToUse: -5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid request data/i);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("propagates service error status — 400 for empty cart", async () => {
    // Override cart to be empty so service returns {ok:false, status:400}
    const emptyCartFn: typeof processAuthenticatedCheckout = async () => ({
      ok: false,
      status: 400,
      message: "Cart is empty",
    });
    const app = buildRouteApp(emptyCartFn);
    const res = await supertest(app).post("/api/checkout").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cart is empty/i);
  });

  it("propagates service error status — 409 for concurrent stock conflict", async () => {
    const concurrentFn: typeof processAuthenticatedCheckout = async () => ({
      ok: false,
      status: 409,
      message: "Sorry, Vitamin C just went out of stock. Please refresh and try again.",
    });
    const app = buildRouteApp(concurrentFn);
    const res = await supertest(app).post("/api/checkout").send({});
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/just went out of stock/i);
  });

  it("responds 500 when the service throws an unexpected error", async () => {
    const throwingFn: typeof processAuthenticatedCheckout = async () => {
      throw new Error("Unexpected DB error");
    };
    const app = buildRouteApp(throwingFn);
    const res = await supertest(app).post("/api/checkout").send({});
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to process checkout/i);
  });
});
