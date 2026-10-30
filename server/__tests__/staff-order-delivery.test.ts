import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrderByOrderNumberWithItems: vi.fn(),
  createSyncOutboxEntry: vi.fn(),
  incrementSyncOutboxAttempt: vi.fn(),
  markSyncOutboxDelivered: vi.fn(),
  markSyncOutboxFailed: vi.fn(),
  scheduleSyncOutboxRetry: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: mocks }));
const customer = { name: "Isolated Fixture" };
let order: any;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  order = {
    id: "fixture-website-order", orderNumber: "ORD-FIXTURE", type: "otc",
    status: "pending", createdAt: new Date("2026-10-23T12:00:00Z"),
    updatedAt: new Date("2026-10-23T12:00:00Z"), deliveryMethod: "pickup",
    paymentStatus: "collect_at_counter", paymentMethod: "cash",
    orderItems: [
      { name: "Soap", quantity: 1, price: "2.50", product: { externalId: "12" } },
      { name: "Shampoo", quantity: 2, price: "2.50", product: { externalId: "13" } },
    ],
  };
  mocks.getOrderByOrderNumberWithItems.mockImplementation(async () => order);
  mocks.createSyncOutboxEntry.mockImplementation(async (entry) => ({
    id: 1, attempts: 0, ...entry,
  }));
  vi.stubEnv("CONCORDIA_RX_API_KEY", "fixture-website-key");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(
    JSON.stringify({ ok: true, externalOrderId: order.id }),
    { status: 200, headers: { "content-type": "application/json" } },
  )));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("never sends a partial Staff request if a saved line has no canonical mapping", async () => {
  order.orderItems[1].product.externalId = null;
  const { notifyStaffAppSale } = await import("../staff-order-delivery");
  expect(await notifyStaffAppSale(order.orderNumber, [], customer)).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.createSyncOutboxEntry).toHaveBeenCalledWith(expect.objectContaining({
    status: "failed", payload: { id: order.id, orderNumber: order.orderNumber },
  }));
});

it("rejects a malformed canonical ID rather than truncating it", async () => {
  order.orderItems[0].product.externalId = "12-other";
  const { notifyStaffAppSale } = await import("../staff-order-delivery");
  expect(await notifyStaffAppSale(order.orderNumber, [], customer)).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.createSyncOutboxEntry).toHaveBeenCalledOnce();
});

it("persists then sends all saved request lines together using the saved external identity", async () => {
  const { notifyStaffAppSale, STAFF_ORDER_WEBHOOK } = await import("../staff-order-delivery");
  expect(await notifyStaffAppSale(order.orderNumber, [], customer)).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  expect(mocks.createSyncOutboxEntry).toHaveBeenCalledWith(expect.objectContaining({
    endpoint: STAFF_ORDER_WEBHOOK, status: "pending",
    payload: expect.objectContaining({ id: order.id, orderNumber: order.orderNumber }),
  }));
  expect(mocks.createSyncOutboxEntry.mock.invocationCallOrder[0])
    .toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[0]);
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(body.orderItems).toEqual([
    { concordiaProductId: 12, name: "Soap", quantity: 1, unitPrice: 2.5 },
    { concordiaProductId: 13, name: "Shampoo", quantity: 2, unitPrice: 2.5 },
  ]);
  expect(body).toMatchObject({
    id: order.id, status: "pending", paymentStatus: "collect_at_counter",
  });
  expect(mocks.markSyncOutboxDelivered).toHaveBeenCalledWith(1);
});
