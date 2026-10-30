/**
 * Tests: Order status push to ConcordiaCare app
 *
 * Covers the fire-and-forget pushOrderStatusToApp call that fires when a
 * pharmacist changes an order's status (PATCH /api/admin/orders/:id/status)
 * or delivery status (PATCH /api/admin/orders/:id/delivery-status).
 *
 * The function is tested in isolation through a thin HTTP wrapper that mirrors
 * the production route logic, using mocked storage and fetch.
 *
 * Scenarios:
 *   pushOrderStatusToApp — happy path
 *     - calls ConcordiaCare /api/external/order-status-update with correct payload
 *     - includes patientEmail in payload when user has an email
 *     - includes concordiaCareUserId in payload when user has one
 *     - sends X-API-KEY header
 *
 *   pushOrderStatusToApp — resilience
 *     - non-2xx response → queues to outbox, does not throw
 *     - network error (fetch throws) → queues to outbox, does not throw
 *     - missing env config → silently skips (no fetch call)
 *
 *   Order status route (PATCH /api/admin/orders/:id/status)
 *     - updates status and fires push fire-and-forget
 *     - responds 200 immediately (does not wait for push to settle)
 *     - responds 404 when order not found
 *     - responds 400 on invalid status enum value
 *     - responds 400 on invalid uuid
 *
 *   Delivery status route (PATCH /api/admin/orders/:id/delivery-status)
 *     - updates delivery status and fires push
 *     - sets actualDelivery when status is "delivered"
 *     - responds 404 when order not found
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import express, { type Application } from "express";
import supertest from "supertest";
import { z } from "zod";
import type { IStorage } from "../storage";
import type { Order, User } from "@shared/schema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const mockOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: ORDER_ID,
    orderNumber: "ORD-TEST-001",
    userId: USER_ID,
    status: "pending",
    deliveryStatus: "not_assigned",
    type: "otc",
    subtotal: "25.00",
    total: "25.00",
    pointsUsed: 0,
    pointsEarned: 0,
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    deliveryMethod: "pickup",
    paymentMethod: "credit_card",
    courierPartner: null,
    trackingNumber: null,
    estimatedDelivery: null,
    actualDelivery: null,
    deliveryNotes: null,
    proofOfDeliveryUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Order);

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: USER_ID,
    email: "patient@example.com",
    concordiaCareUserId: "cc-user-123",
    ...overrides,
  } as unknown as User);

// ---------------------------------------------------------------------------
// Mock storage
// ---------------------------------------------------------------------------
function makeMockStorage(overrides: Partial<IStorage> = {}): IStorage {
  return {
    updateOrderStatus: vi.fn().mockResolvedValue(mockOrder()),
    updateOrderDelivery: vi.fn().mockResolvedValue(mockOrder()),
    getUser: vi.fn().mockResolvedValue(mockUser()),
    getOrder: vi.fn().mockResolvedValue(mockOrder()),
    ...overrides,
  } as unknown as IStorage;
}

// ---------------------------------------------------------------------------
// Minimal Express app builder
// ---------------------------------------------------------------------------
type PushRecord = { endpoint: string; payload: Record<string, unknown>; headers: Record<string, string> };

function buildApp(storage: IStorage, options: {
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  outboxCalls?: PushRecord[];
} = {}): Application {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    (req as any).session = { isAdminLoggedIn: true };
    next();
  });

  const isAuthenticated = (_req: any, _res: any, next: any) => next();
  const isAdmin = (req: any, res: any, next: any) => {
    if ((req as any).session?.isAdminLoggedIn) return next();
    return res.status(401).json({ message: "Admin access required" });
  };

  const outboxCalls = options.outboxCalls ?? [];
  const queueToOutbox = vi.fn().mockImplementation(async (endpoint: string, _method: string, payload: unknown) => {
    outboxCalls.push({ endpoint, payload: payload as Record<string, unknown>, headers: {} });
  });

  function getConcordiaCareConfig() {
    const url = process.env.CONCORDIA_CARE_APP_URL;
    const key = process.env.API_KEY;
    if (!url || !key) return null;
    return { baseUrl: url, apiKey: key };
  }

  async function pushOrderStatusToApp(params: {
    orderId: string;
    deliveryStatus: string;
    patientEmail: string | null;
    concordiaCareUserId: string | null;
  }) {
    const config = getConcordiaCareConfig();
    if (!config) return;
    const endpoint = `${config.baseUrl}/api/external/order-status-update`;
    const fetcher = options.fetchImpl ?? globalThis.fetch;
    try {
      const resp = await (fetcher as any)(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        await queueToOutbox(endpoint, "POST", params);
      }
    } catch {
      await queueToOutbox(endpoint, "POST", params);
    }
  }

  // PATCH /api/admin/orders/:id/status
  app.patch("/api/admin/orders/:id/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { status } = z.object({
        status: z.enum(["pending", "processing", "completed", "cancelled"]),
      }).parse(req.body);

      const updated = await storage.updateOrderStatus(id, status);
      if (!updated) return res.status(404).json({ message: "Order not found" });

      void (async () => {
        let patientEmail: string | null = null;
        let concordiaCareUserId: string | null = null;
        if (updated.userId) {
          try {
            const patient = await storage.getUser(updated.userId);
            patientEmail = (patient as any)?.email ?? null;
            concordiaCareUserId = (patient as any)?.concordiaCareUserId ?? null;
          } catch (_) {}
        }
        await pushOrderStatusToApp({ orderId: updated.id, deliveryStatus: status, patientEmail, concordiaCareUserId });
      })();

      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid request", errors: err.errors });
      res.status(500).json({ message: "Failed" });
    }
  });

  // PATCH /api/admin/orders/:id/delivery-status
  app.patch("/api/admin/orders/:id/delivery-status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { deliveryStatus, deliveryNotes, proofOfDeliveryUrl } = z.object({
        deliveryStatus: z.enum(["not_assigned", "assigned", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned"]),
        deliveryNotes: z.string().optional(),
        proofOfDeliveryUrl: z.string().url().optional(),
      }).parse(req.body);

      const updateData: any = { deliveryStatus };
      if (deliveryNotes) updateData.deliveryNotes = deliveryNotes;
      if (proofOfDeliveryUrl) updateData.proofOfDeliveryUrl = proofOfDeliveryUrl;
      if (deliveryStatus === "delivered") updateData.actualDelivery = new Date();

      const updated = await storage.updateOrderDelivery(id, updateData);
      if (!updated) return res.status(404).json({ message: "Order not found" });

      void (async () => {
        let patientEmail: string | null = null;
        let concordiaCareUserId: string | null = null;
        if (updated.userId) {
          try {
            const patient = await storage.getUser(updated.userId);
            patientEmail = (patient as any)?.email ?? null;
            concordiaCareUserId = (patient as any)?.concordiaCareUserId ?? null;
          } catch (_) {}
        }
        await pushOrderStatusToApp({ orderId: updated.id, deliveryStatus, patientEmail, concordiaCareUserId });
      })();

      res.json(updated);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid request", errors: err.errors });
      res.status(500).json({ message: "Failed" });
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Env helper
// ---------------------------------------------------------------------------
function withSyncEnv<T>(fn: () => T): T {
  const prev = { url: process.env.CONCORDIA_CARE_APP_URL, key: process.env.API_KEY };
  process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
  process.env.API_KEY = "test-api-key";
  try {
    return fn();
  } finally {
    if (prev.url !== undefined) process.env.CONCORDIA_CARE_APP_URL = prev.url;
    else delete process.env.CONCORDIA_CARE_APP_URL;
    if (prev.key !== undefined) process.env.API_KEY = prev.key;
    else delete process.env.API_KEY;
  }
}

function clearSyncEnv() {
  delete process.env.CONCORDIA_CARE_APP_URL;
  delete process.env.API_KEY;
}

afterEach(() => {
  clearSyncEnv();
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/:id/status
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/orders/:id/status", () => {
  it("returns 200 with updated order on success", async () => {
    const storage = makeMockStorage();
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ORDER_ID);
  });

  it("calls updateOrderStatus with correct id and status", async () => {
    const updateMock = vi.fn().mockResolvedValue(mockOrder({ status: "completed" as any }));
    const storage = makeMockStorage({ updateOrderStatus: updateMock });
    await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "completed" });
    expect(updateMock).toHaveBeenCalledWith(ORDER_ID, "completed");
  });

  it("returns 404 when order not found", async () => {
    const storage = makeMockStorage({ updateOrderStatus: vi.fn().mockResolvedValue(undefined) });
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid status value", async () => {
    const storage = makeMockStorage();
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "shipped" });
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid uuid", async () => {
    const storage = makeMockStorage();
    const res = await supertest(buildApp(storage))
      .patch("/api/admin/orders/not-a-uuid/status")
      .send({ status: "processing" });
    expect(res.status).toBe(400);
  });

  it("calls fetch with correct payload when sync env is set", async () => {
    const captured: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      captured.push({ url, init });
      return { ok: true };
    });
    const storage = makeMockStorage();

    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });

    // Give the fire-and-forget time to settle
    await new Promise(r => setTimeout(r, 50));

    expect(captured.length).toBe(1);
    expect(captured[0].url).toBe("https://app.example.com/api/external/order-status-update");
    const body = JSON.parse(captured[0].init.body as string);
    expect(body.orderId).toBe(ORDER_ID);
    expect(body.deliveryStatus).toBe("processing");
    expect(body.patientEmail).toBe("patient@example.com");
    expect(body.concordiaCareUserId).toBe("cc-user-123");
  });

  it("includes X-API-KEY header in push call", async () => {
    const captured: { headers: Record<string, string> }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      captured.push({ headers: init.headers as Record<string, string> });
      return { ok: true };
    });
    const storage = makeMockStorage();
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "my-secret-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "pending" });

    await new Promise(r => setTimeout(r, 50));
    expect(captured[0]?.headers["X-API-KEY"]).toBe("my-secret-key");
  });

  it("queues to outbox when fetch returns non-2xx", async () => {
    const outboxCalls: PushRecord[] = [];
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const storage = makeMockStorage();
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any, outboxCalls }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "completed" });

    await new Promise(r => setTimeout(r, 50));
    expect(outboxCalls.length).toBe(1);
    expect(outboxCalls[0].endpoint).toContain("order-status-update");
  });

  it("queues to outbox when fetch throws", async () => {
    const outboxCalls: PushRecord[] = [];
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const storage = makeMockStorage();
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any, outboxCalls }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "cancelled" });

    await new Promise(r => setTimeout(r, 50));
    expect(outboxCalls.length).toBe(1);
  });

  it("does NOT call fetch when CONCORDIA_CARE_APP_URL is not set", async () => {
    const fetchImpl = vi.fn();
    const storage = makeMockStorage();
    clearSyncEnv();

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });

    await new Promise(r => setTimeout(r, 50));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("handles user with no email — sends patientEmail: null", async () => {
    const captured: { body: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      captured.push({ body: JSON.parse(init.body as string) });
      return { ok: true };
    });
    const storage = makeMockStorage({
      getUser: vi.fn().mockResolvedValue({ id: USER_ID, email: null, concordiaCareUserId: null }),
    });
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });

    await new Promise(r => setTimeout(r, 50));
    expect(captured[0]?.body.patientEmail).toBeNull();
    expect(captured[0]?.body.concordiaCareUserId).toBeNull();
  });

  it("handles storage.getUser throwing — does not crash the push", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    const storage = makeMockStorage({
      getUser: vi.fn().mockRejectedValue(new Error("DB connection lost")),
    });
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    const res = await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });

    await new Promise(r => setTimeout(r, 50));
    // The HTTP response must still succeed even if the async push has an error
    expect(res.status).toBe(200);
  });

  it("order with no userId — skips user lookup, patientEmail null", async () => {
    const captured: { body: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      captured.push({ body: JSON.parse(init.body as string) });
      return { ok: true };
    });
    const getUserMock = vi.fn();
    const storage = makeMockStorage({
      updateOrderStatus: vi.fn().mockResolvedValue(mockOrder({ userId: null })),
      getUser: getUserMock,
    });
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/status`)
      .send({ status: "processing" });

    await new Promise(r => setTimeout(r, 50));
    expect(getUserMock).not.toHaveBeenCalled();
    expect(captured[0]?.body.patientEmail).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/:id/delivery-status
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/orders/:id/delivery-status", () => {
  it("returns 200 with updated order", async () => {
    const storage = makeMockStorage();
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "in_transit" });
    expect(res.status).toBe(200);
  });

  it("calls updateOrderDelivery with correct deliveryStatus", async () => {
    const deliveryMock = vi.fn().mockResolvedValue(mockOrder());
    const storage = makeMockStorage({ updateOrderDelivery: deliveryMock });
    await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "out_for_delivery" });
    expect(deliveryMock).toHaveBeenCalledWith(ORDER_ID, expect.objectContaining({ deliveryStatus: "out_for_delivery" }));
  });

  it("includes actualDelivery in update when deliveryStatus is 'delivered'", async () => {
    const deliveryMock = vi.fn().mockResolvedValue(mockOrder());
    const storage = makeMockStorage({ updateOrderDelivery: deliveryMock });
    await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "delivered" });
    const updateArg = deliveryMock.mock.calls[0][1];
    expect(updateArg.actualDelivery).toBeInstanceOf(Date);
  });

  it("does NOT set actualDelivery for non-delivered statuses", async () => {
    const deliveryMock = vi.fn().mockResolvedValue(mockOrder());
    const storage = makeMockStorage({ updateOrderDelivery: deliveryMock });
    await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "picked_up" });
    const updateArg = deliveryMock.mock.calls[0][1];
    expect(updateArg.actualDelivery).toBeUndefined();
  });

  it("returns 404 when order not found", async () => {
    const storage = makeMockStorage({ updateOrderDelivery: vi.fn().mockResolvedValue(undefined) });
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "delivered" });
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid deliveryStatus value", async () => {
    const storage = makeMockStorage();
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "teleported" });
    expect(res.status).toBe(400);
  });

  it("fires push to ConcordiaCare with deliveryStatus in payload", async () => {
    const captured: { body: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      captured.push({ body: JSON.parse(init.body as string) });
      return { ok: true };
    });
    const storage = makeMockStorage();
    process.env.CONCORDIA_CARE_APP_URL = "https://app.example.com";
    process.env.API_KEY = "test-api-key";

    await supertest(buildApp(storage, { fetchImpl: fetchImpl as any }))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "delivered" });

    await new Promise(r => setTimeout(r, 50));
    expect(captured[0]?.body.deliveryStatus).toBe("delivered");
    expect(captured[0]?.body.orderId).toBe(ORDER_ID);
  });

  it("accepts optional deliveryNotes and proofOfDeliveryUrl", async () => {
    const deliveryMock = vi.fn().mockResolvedValue(mockOrder());
    const storage = makeMockStorage({ updateOrderDelivery: deliveryMock });
    await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({
        deliveryStatus: "delivered",
        deliveryNotes: "Left at front door",
        proofOfDeliveryUrl: "https://cdn.example.com/proof.jpg",
      });
    const updateArg = deliveryMock.mock.calls[0][1];
    expect(updateArg.deliveryNotes).toBe("Left at front door");
    expect(updateArg.proofOfDeliveryUrl).toBe("https://cdn.example.com/proof.jpg");
  });

  it("returns 400 when proofOfDeliveryUrl is not a valid URL", async () => {
    const storage = makeMockStorage();
    const res = await supertest(buildApp(storage))
      .patch(`/api/admin/orders/${ORDER_ID}/delivery-status`)
      .send({ deliveryStatus: "delivered", proofOfDeliveryUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });
});
