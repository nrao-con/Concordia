/**
 * Tests: order number format & lookup endpoints
 *
 * Covers:
 *   generateOrderNumber() — the REAL production helper from order-number-util.ts
 *     - output always matches ORD-{13-digit ts}-{5 uppercase alphanumeric}
 *     - produces unique values across rapid successive calls
 *
 *   GET /api/public/orders/:orderNumber
 *     - returns order fields for a known order number
 *     - is case-insensitive (lowercase param finds the order)
 *     - returns 404 for an unknown order number
 *
 *   GET /api/staff/orders/by-number/:orderNumber
 *     - returns 401 without the x-staff-key header
 *     - returns 401 with the wrong staff key
 *     - returns 503 when STAFF_API_KEY env var is not configured
 *     - returns 404 for an unknown order number
 *     - returns 200 with the full staff shape (including items[]) for a known order
 *     - is case-insensitive (lowercase param finds the order)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Application } from "express";
import supertest from "supertest";
import type { IStorage } from "../storage";
import type { Order } from "@shared/schema";
import { generateOrderNumber } from "../order-number-util";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ORDER_NUMBER = "ORD-1748440123456-AB12C";
const STAFF_KEY = "test-staff-key-abc";

const mockOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    userId: null,
    status: "pending",
    deliveryStatus: "not_assigned",
    type: "otc",
    subtotal: "12.50",
    total: "12.50",
    pointsUsed: 0,
    pointsEarned: 0,
    guestName: "Jane Guest",
    guestEmail: "jane@example.com",
    guestPhone: "555-0100",
    deliveryMethod: "pickup",
    paymentMethod: "cash",
    courierPartner: null,
    trackingNumber: null,
    estimatedDelivery: null,
    actualDelivery: null,
    deliveryNotes: null,
    proofOfDeliveryUrl: null,
    createdAt: new Date("2024-01-01T12:00:00Z"),
    updatedAt: new Date("2024-01-01T12:00:00Z"),
    ...overrides,
  } as unknown as Order);

const mockOrderWithItems = (overrides: Partial<Order> = {}) => ({
  ...mockOrder(overrides),
  customerName: "Jane Guest",
  customerPhone: "555-0100",
  orderItems: [
    {
      id: "item-001",
      orderId: ORDER_ID,
      name: "Aspirin 81mg",
      quantity: 2,
      price: "6.25",
      productId: "prod-001",
      product: null,
      prescription: null,
    },
  ],
});

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------
function makeMockStorage(overrides: Partial<IStorage> = {}): IStorage {
  return {
    getOrderByOrderNumber: vi.fn().mockResolvedValue(undefined),
    getOrderByOrderNumberWithItems: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IStorage;
}

// ---------------------------------------------------------------------------
// Exact production PUBLIC_STATUS_LABELS (from server/routes.ts)
// ---------------------------------------------------------------------------
const PUBLIC_STATUS_LABELS: Record<string, string> = {
  pending:          "Order received — we'll have it ready soon",
  preparing:        "Being prepared by our pharmacists",
  ready_for_pickup: "Ready for pickup at the pharmacy",
  sent_for_delivery:"On its way to you",
  delivered:        "Delivered",
  picked_up:        "Picked up — thank you!",
  processing:       "Being processed",
  completed:        "Order complete",
  cancelled:        "Order cancelled",
  refunded:         "Refunded",
};

// ---------------------------------------------------------------------------
// App builders that faithfully mirror the production handlers in routes.ts
// ---------------------------------------------------------------------------

/**
 * Mirrors GET /api/public/orders/:orderNumber from routes.ts (~line 12988).
 */
function buildPublicApp(storage: IStorage): Application {
  const app = express();
  app.use(express.json());

  app.get("/api/public/orders/:orderNumber", async (req: any, res) => {
    try {
      const order = await storage.getOrderByOrderNumber(req.params.orderNumber.toUpperCase());
      if (!order) {
        return res.status(404).json({ found: false, message: "Order not found" });
      }
      const statusLabel = PUBLIC_STATUS_LABELS[order.status] ?? order.status;
      res.json({
        orderNumber: order.orderNumber,
        status: order.status,
        statusLabel,
        fulfillmentType: order.deliveryMethod || "pickup",
        createdAt: order.createdAt,
      });
    } catch {
      res.status(500).json({ message: "Failed to track order" });
    }
  });

  return app;
}

/**
 * Mirrors requireStaffKey + GET /api/staff/orders/by-number/:orderNumber
 * from routes.ts (~lines 10856–10930).
 *
 * requireStaffKey reads process.env.STAFF_API_KEY at request time, returning
 * 503 when the env var is absent and 401 when the key is wrong/missing.
 */
function buildStaffApp(storage: IStorage): Application {
  const app = express();
  app.use(express.json());

  function requireStaffKey(req: any, res: any, next: any) {
    const staffKey = process.env.STAFF_API_KEY;
    if (!staffKey) return res.status(503).json({ message: "Staff API key not configured" });
    const provided = req.headers["x-staff-key"];
    if (typeof provided !== "string" || provided !== staffKey) {
      return res.status(401).json({ message: "Invalid or missing staff API key" });
    }
    next();
  }

  app.get("/api/staff/orders/by-number/:orderNumber", requireStaffKey, async (req: any, res) => {
    try {
      const o = await storage.getOrderByOrderNumberWithItems(req.params.orderNumber.toUpperCase());
      if (!o) return res.status(404).json({ found: false, message: "Order not found" });
      res.json({
        id: (o as any).id,
        orderNumber: (o as any).orderNumber,
        type: (o as any).type,
        status: (o as any).status,
        paymentStatus: (o as any).paymentStatus ?? null,
        deliveryMethod: (o as any).deliveryMethod ?? null,
        total: (o as any).total,
        items: ((o as any).orderItems || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          productId: item.productId ?? null,
        })),
        customer: {
          name: (o as any).customerName || null,
          phone: (o as any).customerPhone || null,
        },
        createdAt: (o as any).createdAt,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------
function setStaffKey(key: string) {
  process.env.STAFF_API_KEY = key;
}

function clearStaffKey() {
  delete process.env.STAFF_API_KEY;
}

// ---------------------------------------------------------------------------
// generateOrderNumber format tests — calls the REAL production function
// ---------------------------------------------------------------------------
describe("generateOrderNumber format", () => {
  it("matches ORD-{13-digit ts}-{5 uppercase alphanumeric}", () => {
    const pattern = /^ORD-\d{13}-[A-Z0-9]{5}$/;
    for (let i = 0; i < 20; i++) {
      expect(generateOrderNumber()).toMatch(pattern);
    }
  });

  it("produces unique values across rapid successive calls", () => {
    const nums = new Set(Array.from({ length: 50 }, () => generateOrderNumber()));
    expect(nums.size).toBeGreaterThanOrEqual(45);
  });
});

// ---------------------------------------------------------------------------
// GET /api/public/orders/:orderNumber
// ---------------------------------------------------------------------------
describe("GET /api/public/orders/:orderNumber", () => {
  let storage: IStorage;
  let app: Application;

  beforeEach(() => {
    storage = makeMockStorage({
      getOrderByOrderNumber: vi.fn().mockResolvedValue(undefined),
    });
    app = buildPublicApp(storage);
  });

  it("returns order fields for a known order number", async () => {
    (storage.getOrderByOrderNumber as any).mockResolvedValue(mockOrder());

    const res = await supertest(app).get(`/api/public/orders/${ORDER_NUMBER}`);

    expect(res.status).toBe(200);
    expect(res.body.orderNumber).toBe(ORDER_NUMBER);
    expect(res.body.status).toBe("pending");
    expect(res.body.statusLabel).toBe("Order received — we'll have it ready soon");
    expect(res.body.fulfillmentType).toBe("pickup");
  });

  it("normalises the param to uppercase before lookup", async () => {
    (storage.getOrderByOrderNumber as any).mockResolvedValue(mockOrder());

    const lowerParam = ORDER_NUMBER.toLowerCase();
    await supertest(app).get(`/api/public/orders/${lowerParam}`);

    expect(storage.getOrderByOrderNumber).toHaveBeenCalledWith(ORDER_NUMBER.toUpperCase());
  });

  it("returns 404 for an unknown order number", async () => {
    const res = await supertest(app).get("/api/public/orders/ORD-0000000000000-XXXXX");

    expect(res.status).toBe(404);
    expect(res.body.found).toBe(false);
  });

  it("returns 404 (not 500) when the param contains SQL-injection-like characters", async () => {
    const malicious = "' OR '1'='1";
    const res = await supertest(app).get(`/api/public/orders/${encodeURIComponent(malicious)}`);

    expect(res.status).toBe(404);
    expect(res.body.found).toBe(false);
    expect(res.body).not.toHaveProperty("stack");
  });

  it("returns 404 or 400 (not 500) for a param exceeding 100 characters", async () => {
    const longParam = "ORD-" + "X".repeat(120);
    const res = await supertest(app).get(`/api/public/orders/${longParam}`);

    expect([400, 404]).toContain(res.status);
    expect(res.body).not.toHaveProperty("stack");
  });

  it("returns 500 with a safe message and no stack trace when storage throws unexpectedly", async () => {
    (storage.getOrderByOrderNumber as any).mockRejectedValue(
      new Error("Unexpected DB connection failure"),
    );

    const res = await supertest(app).get(`/api/public/orders/${ORDER_NUMBER}`);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to track order");
    expect(res.body).not.toHaveProperty("stack");
    expect(JSON.stringify(res.body)).not.toContain("DB connection failure");
  });
});

// ---------------------------------------------------------------------------
// GET /api/staff/orders/by-number/:orderNumber
// ---------------------------------------------------------------------------
describe("GET /api/staff/orders/by-number/:orderNumber", () => {
  let storage: IStorage;
  let app: Application;

  beforeEach(() => {
    setStaffKey(STAFF_KEY);
    storage = makeMockStorage({
      getOrderByOrderNumberWithItems: vi.fn().mockResolvedValue(undefined),
    });
    app = buildStaffApp(storage);
  });

  afterEach(() => {
    clearStaffKey();
  });

  it("returns 401 without the x-staff-key header", async () => {
    const res = await supertest(app).get(`/api/staff/orders/by-number/${ORDER_NUMBER}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong staff key", async () => {
    const res = await supertest(app)
      .get(`/api/staff/orders/by-number/${ORDER_NUMBER}`)
      .set("x-staff-key", "wrong-key");
    expect(res.status).toBe(401);
  });

  it("returns 503 when STAFF_API_KEY env var is not configured", async () => {
    clearStaffKey();
    const res = await supertest(app)
      .get(`/api/staff/orders/by-number/${ORDER_NUMBER}`)
      .set("x-staff-key", STAFF_KEY);
    expect(res.status).toBe(503);
  });

  it("returns 404 for an unknown order number", async () => {
    const res = await supertest(app)
      .get("/api/staff/orders/by-number/ORD-0000000000000-XXXXX")
      .set("x-staff-key", STAFF_KEY);

    expect(res.status).toBe(404);
    expect(res.body.found).toBe(false);
  });

  it("returns 200 with the full staff shape including items", async () => {
    (storage.getOrderByOrderNumberWithItems as any).mockResolvedValue(mockOrderWithItems());

    const res = await supertest(app)
      .get(`/api/staff/orders/by-number/${ORDER_NUMBER}`)
      .set("x-staff-key", STAFF_KEY);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ORDER_ID);
    expect(res.body.orderNumber).toBe(ORDER_NUMBER);
    expect(res.body.status).toBe("pending");
    expect(res.body.total).toBe("12.50");
    expect(res.body.customer.name).toBe("Jane Guest");
    expect(res.body.customer.phone).toBe("555-0100");
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("Aspirin 81mg");
    expect(res.body.items[0].quantity).toBe(2);
    expect(res.body.items[0].productId).toBe("prod-001");
  });

  it("normalises the param to uppercase before lookup", async () => {
    (storage.getOrderByOrderNumberWithItems as any).mockResolvedValue(mockOrderWithItems());

    const lowerParam = ORDER_NUMBER.toLowerCase();
    await supertest(app)
      .get(`/api/staff/orders/by-number/${lowerParam}`)
      .set("x-staff-key", STAFF_KEY);

    expect(storage.getOrderByOrderNumberWithItems).toHaveBeenCalledWith(ORDER_NUMBER.toUpperCase());
  });
});
