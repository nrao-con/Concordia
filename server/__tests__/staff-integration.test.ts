import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  storage: {
    getAllProducts: vi.fn(), getProduct: vi.fn(), getProductByExternalId: vi.fn(),
    updateProduct: vi.fn(), createProduct: vi.fn(), getOrder: vi.fn(),
    getOrderByOrderNumber: vi.fn(), getOrderByOrderNumberWithItems: vi.fn(),
    createSyncOutboxEntry: vi.fn(), incrementSyncOutboxAttempt: vi.fn(),
    markSyncOutboxDelivered: vi.fn(), markSyncOutboxFailed: vi.fn(),
    scheduleSyncOutboxRetry: vi.fn(), decrementProductStock: vi.fn(),
  },
  dbPatch: vi.fn(), audit: vi.fn(), fetch: vi.fn(), notify: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: mocks.storage }));
vi.mock("../auditLogger", () => ({ logAudit: mocks.audit }));
vi.mock("../db", () => ({ db: { update: () => ({ set: (patch: any) => {
  mocks.dbPatch(patch);
  return { where: () => ({ returning: async () => [{ id: "web-order", ...patch }] }) };
} }) } }));

let catalog: any[];
let locals: any[];
let centralStock: number;
let centralOrders: Map<string, string>;
let queued: Map<number, any>;
let mode: "normal" | "timeout" | "401" | "html" | "offline";
let order: any;
let api: typeof import("../staff-catalog");
let delivery: typeof import("../staff-order-delivery");
let register: typeof import("../staff-inventory-routes").registerStaffInventoryRoutes;

const product = () => ({ id: "12", name: "Synthetic soap", price: 3.5, stockCount: 5, inStock: true, imageUrl: "https://example.test/soap.png" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function app() {
  const app = express(); app.use(express.json()); register(app, mocks.notify); return app;
}
const header = { "X-API-KEY": "synthetic-website-key" };

beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv("CONCORDIA_RX_API_KEY", "synthetic-website-key");
  vi.stubGlobal("fetch", mocks.fetch);
  catalog = [product()];
  locals = [{ id: "local-soap", externalId: "12", name: "Synthetic soap", price: "3.50", stockQuantity: 5, inStock: true }];
  centralStock = 5; centralOrders = new Map(); queued = new Map(); mode = "normal";
  order = {
    id: "web-order", orderNumber: "ORD-fixture", type: "otc", source: "website", status: "pending",
    createdAt: new Date("2026-10-01T12:00:00Z"), updatedAt: new Date("2026-10-01T12:00:00Z"),
    guestName: "Synthetic customer", guestPhone: "555-test", paymentStatus: "collect_at_counter",
    paymentMethod: "cash", deliveryMethod: "pickup", notes: "Synthetic note",
    orderItems: [{ id: "line-not-canonical", name: "Synthetic soap", quantity: 2, price: "3.50", product: locals[0] }],
  };
  mocks.storage.getAllProducts.mockImplementation(async () => locals.map(p => ({ ...p })));
  mocks.storage.getProduct.mockImplementation(async id => locals.find(p => p.id === id));
  mocks.storage.getProductByExternalId.mockImplementation(async id => locals.find(p => p.externalId === id));
  mocks.storage.updateProduct.mockImplementation(async (id, patch) => {
    const local = locals.find(p => p.id === id); if (!local) return undefined;
    Object.assign(local, patch); return local;
  });
  mocks.storage.createProduct.mockImplementation(async patch => {
    const p = { ...patch, id: `new-local-${locals.length}` }; locals.push(p); return p;
  });
  mocks.storage.getOrderByOrderNumberWithItems.mockImplementation(async () => order);
  mocks.storage.getOrder.mockImplementation(async id => id === order.id ? order : undefined);
  mocks.storage.getOrderByOrderNumber.mockImplementation(async id => id === order.orderNumber ? order : undefined);
  mocks.storage.createSyncOutboxEntry.mockImplementation(async input => {
    const entry = { ...input, id: queued.size + 1, attempts: 0, nextRetryAt: new Date(), createdAt: new Date() };
    queued.set(entry.id, structuredClone(entry)); return structuredClone(entry);
  });
  mocks.storage.incrementSyncOutboxAttempt.mockImplementation(async (id, date) => {
    queued.get(id).attempts++; queued.get(id).nextRetryAt = date;
  });
  mocks.storage.markSyncOutboxDelivered.mockImplementation(async id => { queued.get(id).status = "delivered"; });
  mocks.storage.markSyncOutboxFailed.mockImplementation(async (id, error) => { Object.assign(queued.get(id), { status: "failed", lastError: error }); });
  mocks.storage.scheduleSyncOutboxRetry.mockImplementation(async (id, date, reason) => {
    Object.assign(queued.get(id), { status: "pending", nextRetryAt: date, lastError: reason });
  });
  mocks.fetch.mockImplementation(async (url, options) => {
    if (mode === "offline") throw new Error("synthetic offline");
    if (String(url).endsWith("/api/public/products")) return json(catalog);
    if (String(url).endsWith("/inventory/revision")) return json({ revision: "revision-1" });
    if (String(url).endsWith("/webhooks/new-order")) {
      expect(options.headers["X-API-KEY"]).toBe("synthetic-website-key");
      if (mode === "401") return json({ message: "Denied" }, 401);
      if (mode === "html") return new Response("<html>app</html>", { headers: { "content-type": "text/html" } });
      const body = JSON.parse(options.body);
      if (!centralOrders.has(body.id)) {
        centralOrders.set(body.id, options.body);
        centralStock -= body.orderItems.reduce((sum: number, i: any) => sum + i.quantity, 0);
      } else expect(options.body).toBe(centralOrders.get(body.id));
      if (mode === "timeout") throw new Error("synthetic timeout after central commit");
      return json({ ok: true, externalOrderId: body.id, orderNumber: body.orderNumber });
    }
    throw new Error("Unexpected mocked URL");
  });
  api = await import("../staff-catalog");
  delivery = await import("../staff-order-delivery");
  register = (await import("../staff-inventory-routes")).registerStaffInventoryRoutes;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("canonical product receiver", () => {
  it("accepts numeric concordiaId and null externalProductId without changing canonical identity", async () => {
    const res = await request(app()).post("/api/external/products/sync").set(header).send({
      concordiaId: 12, externalProductId: null, name: "A late name", price: 1, stockCount: 100,
    });
    expect(res.status).toBe(200); expect(res.body.ok).toBe(true);
    expect(locals[0]).toMatchObject({ externalId: "12", name: "Synthetic soap", stockQuantity: 5, price: "3.50" });
  });
  it("acknowledges repeated hides for absent products and retains order history", async () => {
    catalog = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: 12, externalProductId: null });
      expect(res.status).toBe(200); expect(res.body.action).toBe("hidden");
    }
    expect(locals[0]).toMatchObject({ status: "inactive", showOnWebsite: false, stockQuantity: 0 });
    expect(order.orderItems).toHaveLength(1);
    const missing = await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: 999, externalProductId: null });
    expect(missing.body.action).toBe("not_found");
  });
  it("does not apply a late hide when the authoritative product is visible again", async () => {
    const res = await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: 12, externalProductId: null });
    expect(res.body.action).toBe("reconciled"); expect(locals[0].showOnWebsite).toBe(true);
  });
  it("uses a local externalProductId only as an explicit mapping hint", async () => {
    locals[0].externalId = null;
    await request(app()).post("/api/external/products/sync").set(header).send({
      concordiaId: 12, externalProductId: "local-soap", name: "Synthetic soap", price: 3.5, stockCount: 5,
    }).expect(200);
    expect(locals).toHaveLength(1); expect(locals[0].externalId).toBe("12");
  });
  it("never authorizes missing or incorrect credentials", async () => {
    await request(app()).post("/api/external/products/hide").send({ concordiaId: 12 }).expect(401);
    vi.stubEnv("CONCORDIA_RX_API_KEY", "");
    await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: 12 }).expect(503);
  });
  it("returns sanitized field errors and does not leak supplied values", async () => {
    const res = await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: "sensitive-invalid-value" });
    expect(res.status).toBe(400); expect(res.body.errors[0].field).toBe("concordiaId");
    expect(JSON.stringify(res.body)).not.toContain("sensitive-invalid-value");
  });
  it("does not acknowledge catalog failures or failed commits", async () => {
    mode = "offline";
    await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: 12 }).expect(503);
    mode = "normal"; mocks.storage.updateProduct.mockResolvedValue(undefined);
    await request(app()).post("/api/external/products/hide").set(header).send({ concordiaId: 12 }).expect(503);
  });
  it("rejects invalid snapshots before mutating any product", async () => {
    catalog.push({ ...product(), id: "13", stockCount: -1 });
    await expect(api.reconcileStaffCatalog(true)).rejects.toThrow();
    expect(mocks.storage.updateProduct).not.toHaveBeenCalled();
  });
  it("restocks products, restores current Staff visibility and applies prices/images", async () => {
    catalog = [{ ...product(), stockCount: 0 }];
    await api.reconcileStaffCatalog(true);
    expect(locals[0].inStock).toBe(false);
    catalog = [{ ...product(), price: 8.75, imageUrl: null, stockCount: 9 }];
    await api.reconcileStaffCatalog(true);
    expect(locals[0]).toMatchObject({ inStock: true, showOnWebsite: true, price: "8.75", imageUrl: null, stockQuantity: 9 });
  });
  it("never exposes local-only listings or overridden prices through either shop feed", async () => {
    catalog[0].imageUrl = "/images/fixture-soap.png";
    await api.reconcileStaffCatalog(true);
    locals.push({ id: "website-only", name: "Not published by Staff", price: "1.00", externalId: null });
    locals[0].price = "999.00"; locals[0].name = "Local override"; locals[0].stockQuantity = 999;
    for (const channel of ["website", "app"] as const) {
      const products = await api.getStaffShopProducts(channel);
      expect(products).toHaveLength(1);
      expect(products[0]).toMatchObject({
        name: "Synthetic soap", price: "3.50", stockQuantity: 5,
        imageUrl: "https://concordia-staff.replit.app/images/fixture-soap.png", showInApp: true,
      });
    }
  });
  it("rejects stale, hidden, absent or over-quantity checkout items against Staff", async () => {
    expect(await api.verifyStaffAvailability([{ productId: "local-soap", quantity: 2 }])).toBe(true);
    catalog = [];
    expect(await api.verifyStaffAvailability([{ productId: "local-soap", quantity: 1 }])).toBe(false);
    catalog = [{ ...product(), stockCount: 0 }];
    expect(await api.verifyStaffAvailability([{ productId: "local-soap", quantity: 1 }])).toBe(false);
    catalog = [product()];
    expect(await api.verifyStaffAvailability([{ productId: "local-soap", quantity: 3 }, { productId: "local-soap", quantity: 3 }])).toBe(false);
  });
  it("fetches full data only when revision changes and supports old Staff recovery", async () => {
    await api.getInventoryRevision();
    const firstCount = mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/products")).length;
    await api.getInventoryRevision();
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/products")).length).toBe(firstCount);
  });
  it("treats revisions as opaque and fetches full products only when they change", async () => {
    vi.useFakeTimers();
    const transport = mocks.fetch.getMockImplementation()!;
    let token = "A";
    mocks.fetch.mockImplementation((url, options) => String(url).endsWith("/inventory/revision")
      ? json({ opaqueChangeToken: token }) : transport(url, options));
    await api.getInventoryRevision();
    const count = () => mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/products")).length;
    expect(count()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await api.getInventoryRevision();
    expect(count()).toBe(1);
    token = "B"; catalog[0].price = 7.25;
    await vi.advanceTimersByTimeAsync(1000);
    await api.getInventoryRevision();
    expect(count()).toBe(2); expect(locals[0].price).toBe("7.25");
  });
  it("recovers from an unpublished revision API through bounded catalog refreshes", async () => {
    vi.useFakeTimers();
    const transport = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url, options) => String(url).endsWith("/inventory/revision")
      ? new Response("Not found", { status: 404 }) : transport(url, options));
    const first = await api.getInventoryRevision();
    expect(first.recovery).toBe(true);
    const count = () => mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/products")).length;
    await vi.advanceTimersByTimeAsync(1000);
    await api.getInventoryRevision(); expect(count()).toBe(1);
    catalog = [];
    await vi.advanceTimersByTimeAsync(5000);
    const recovered = await api.getInventoryRevision();
    expect(count()).toBe(2); expect(recovered.revision).not.toBe(first.revision);
    expect(locals[0].inStock).toBe(false);
  });
  it("does not rewrite unchanged products on repeated forced refreshes", async () => {
    await api.reconcileStaffCatalog(true);
    mocks.storage.updateProduct.mockClear();
    await api.reconcileStaffCatalog(true);
    await api.reconcileStaffCatalog(true);
    expect(mocks.storage.updateProduct).not.toHaveBeenCalled();
    expect(mocks.storage.createProduct).not.toHaveBeenCalled();
  });
  it("writes only the changed row and leaves unchanged product timestamps alone", async () => {
    catalog = Array.from({ length: 174 }, (_, i) => ({ ...product(), id: String(i + 1) }));
    locals = catalog.map(p => ({ id: `local-${p.id}`, externalId: p.id, requiresPrescription: false }));
    await api.reconcileStaffCatalog(true);
    expect(mocks.storage.updateProduct).toHaveBeenCalledTimes(174);
    mocks.storage.updateProduct.mockClear();
    await api.reconcileStaffCatalog(true);
    expect(mocks.storage.updateProduct).not.toHaveBeenCalled();
    catalog[80].stockCount = 2;
    await api.reconcileStaffCatalog(true);
    expect(mocks.storage.updateProduct).toHaveBeenCalledTimes(1);
    expect(mocks.storage.updateProduct).toHaveBeenCalledWith("local-81", expect.objectContaining({ stockQuantity: 2 }));
  });
  it("does not repeatedly hide an already hidden product", async () => {
    catalog = [];
    await api.reconcileStaffCatalog(true);
    mocks.storage.updateProduct.mockClear();
    await api.reconcileStaffCatalog(true);
    expect(mocks.storage.updateProduct).not.toHaveBeenCalled();
  });
  it("ignores catalog row ordering when calculating the public revision", async () => {
    catalog.push({ ...product(), id: "13", name: "Second synthetic product" });
    const first = await api.getInventoryRevision();
    catalog.reverse();
    mocks.storage.updateProduct.mockClear();
    await api.reconcileStaffCatalog(true);
    expect((await api.getInventoryRevision()).revision).toBe(first.revision);
    expect(mocks.storage.updateProduct).not.toHaveBeenCalled();
  });
  it("shares simultaneous catalog fetches and expires the ordinary read cache", async () => {
    vi.useFakeTimers();
    await Promise.all(Array.from({ length: 12 }, () => api.getStaffShopProducts()));
    const catalogCalls = () => mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/products")).length;
    expect(catalogCalls()).toBe(1);
    await api.getStaffShopProducts();
    expect(catalogCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    await api.getStaffShopProducts();
    expect(catalogCalls()).toBe(2);
  });
  it("forces a new order-time stock check even while the read cache is fresh", async () => {
    await api.getStaffShopProducts();
    catalog[0].stockCount = 0;
    expect(await api.verifyStaffAvailability([{ productId: "local-soap", quantity: 1 }])).toBe(false);
    expect(mocks.fetch.mock.calls.filter(([url]) => String(url).endsWith("/products"))).toHaveLength(2);
  });
  it("briefly throttles failed reads without returning stale stock, while forced checks bypass it", async () => {
    vi.useFakeTimers();
    await api.getStaffShopProducts();
    mode = "offline";
    await vi.advanceTimersByTimeAsync(1001);
    await expect(api.getStaffShopProducts()).rejects.toThrow();
    const attempts = mocks.fetch.mock.calls.length;
    await expect(api.getStaffShopProducts()).rejects.toThrow("temporarily unavailable");
    expect(mocks.fetch).toHaveBeenCalledTimes(attempts);
    mode = "normal";
    catalog[0].stockCount = 0;
    expect(await api.verifyStaffAvailability([{ productId: "local-soap", quantity: 1 }])).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(attempts + 1);
  });
  it("bounds failed revision recovery attempts and recovers after the cooldown", async () => {
    vi.useFakeTimers();
    mode = "offline";
    await expect(api.getInventoryRevision()).rejects.toThrow();
    const attempts = mocks.fetch.mock.calls.length;
    await expect(api.getInventoryRevision()).rejects.toThrow("temporarily unavailable");
    expect(mocks.fetch).toHaveBeenCalledTimes(attempts);
    mode = "normal";
    await vi.advanceTimersByTimeAsync(1001);
    expect((await api.getInventoryRevision()).recovery).toBe(false);
  });
  it("invalidates the failure cooldown when an order handoff requests fresh inventory", async () => {
    mode = "offline";
    await expect(api.getStaffShopProducts()).rejects.toThrow();
    mode = "normal";
    api.requestStaffInventoryRefresh();
    expect((await api.getStaffShopProducts())[0].stockQuantity).toBe(5);
  });
});

describe("durable order delivery", () => {
  it("uses saved order/item IDs correctly and includes real timestamps and money", async () => {
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(true);
    const payload = JSON.parse(mocks.fetch.mock.calls.find(([u]) => String(u).includes("new-order"))![1].body);
    expect(payload).toMatchObject({ id: "web-order", source: "website", status: "pending", paymentMethod: "cash", notes: "Synthetic note",
      orderItems: [{ concordiaProductId: 12, quantity: 2, unitPrice: 3.5 }] });
    expect(payload.createdAt).toBe("2026-10-01T12:00:00.000Z");
    expect(payload.orderItems[0].concordiaProductId).not.toBe("line-not-canonical");
    expect(payload).not.toHaveProperty("stockQuantity");
    expect([...queued.values()][0].status).toBe("delivered");
  });
  it("retries a timeout with identical saved ID/body against an isolated deduplicating receiver", async () => {
    mode = "timeout";
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(false);
    const entry = [...queued.values()][0];
    expect(entry.status).toBe("pending"); expect(entry.lastError).toContain("uncertain");
    expect(centralStock).toBe(3);
    mode = "normal";
    expect(await delivery.deliverStaffWebhook(structuredClone(entry))).toBe(true);
    expect(centralOrders.size).toBe(1); expect(centralStock).toBe(3);
    const sent = mocks.fetch.mock.calls.filter(([u]) => String(u).includes("new-order")).map(([, o]) => o.body);
    expect(sent[1]).toBe(sent[0]);
  });
  it("treats an importer acknowledgment with a shortage as receipt, not paid or reserved", async () => {
    centralStock = 0;
    mocks.fetch.mockImplementationOnce(async () => json({ ok: true, externalOrderId: order.id }));
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(true);
    expect(centralStock).toBe(0);
    expect(order.status).toBe("pending");
    expect(order.paymentStatus).toBe("collect_at_counter");
    expect(locals[0].stockQuantity).toBe(5);
    expect([...queued.values()][0]).toMatchObject({
      status: "delivered", payload: { status: "pending", paymentStatus: "collect_at_counter" },
    });
  });
  it("refreshes Staff-owned stock after an import without any website deduction", async () => {
    await api.reconcileStaffCatalog(true);
    expect(locals[0].stockQuantity).toBe(5);
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(true);
    // The receiver fixture, not the website, made the stock transition.
    expect(centralStock).toBe(3); expect(locals[0].stockQuantity).toBe(5);
    catalog[0].stockCount = centralStock;
    // A normal immediate read must bypass the old one-second catalog cache.
    const products = await api.getStaffShopProducts();
    expect(products[0].stockQuantity).toBe(3);
    expect(products[0].price).toBe("3.50");
  });
  it("refreshes inventory after an uncertain import, using the same saved order identity", async () => {
    await api.reconcileStaffCatalog(true);
    mode = "timeout";
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(false);
    catalog[0].stockCount = centralStock;
    expect((await api.getStaffShopProducts())[0].stockQuantity).toBe(3);
    const entry = [...queued.values()][0];
    mode = "normal";
    expect(await delivery.deliverStaffWebhook(entry)).toBe(true);
    expect(centralOrders.size).toBe(1); expect(centralStock).toBe(3);
  });
  it("retains authentication failures for review rather than requesting new keys or discarding orders", async () => {
    mode = "401";
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(false);
    expect([...queued.values()][0]).toMatchObject({ status: "failed", payload: { id: order.id } });
  });
  it("does not treat HTML as acknowledgment", async () => {
    mode = "html";
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(false);
    expect([...queued.values()][0].status).toBe("pending");
  });
  it.each(["price", "mapping", "quantity"])("does not send invalid %s", async (invalid) => {
    if (invalid === "price") order.orderItems[0].price = "3.505";
    if (invalid === "mapping") order.orderItems[0].product.externalId = null;
    if (invalid === "quantity") order.orderItems[0].quantity = 101;
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect([...queued.values()][0].status).toBe("failed");
  });
  it("keeps saved orders recoverable when initial queue persistence fails", async () => {
    mocks.storage.createSyncOutboxEntry.mockRejectedValue(new Error("synthetic DB unavailable"));
    expect(await delivery.notifyStaffAppSale(order.orderNumber, [], { name: "Synthetic" })).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("authenticated callback", () => {
  it("updates existing orders without stock changes, order creation or an outbound callback", async () => {
    const res = await request(app()).patch(`/api/external/orders/${order.id}/app-status`).set(header)
      .send({ appStatus: "preparing", concordiaOrderNumber: "STAFF-fixture" });
    expect(res.status).toBe(200); expect(res.body.changed).toBe(true);
    expect(mocks.dbPatch).toHaveBeenCalledWith(expect.objectContaining({ status: "preparing" }));
    expect(mocks.storage.decrementProductStock).not.toHaveBeenCalled();
    expect(mocks.storage.createSyncOutboxEntry).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("acknowledges duplicates and late statuses without touching timestamps or restarting polling loops", async () => {
    order.status = "preparing";
    const res = await request(app()).patch(`/api/external/orders/${order.id}/app-status`).set(header)
      .send({ appStatus: "preparing", concordiaOrderNumber: "STAFF-fixture" });
    expect(res.body.changed).toBe(false);
    expect(mocks.dbPatch).not.toHaveBeenCalled();
    order.status = "picked_up";
    const late = await request(app()).patch(`/api/external/orders/${order.id}/app-status`).set(header)
      .send({ appStatus: "preparing", concordiaOrderNumber: "STAFF-fixture" });
    expect(late.body.changed).toBe(false); expect(mocks.dbPatch).not.toHaveBeenCalled();
  });
  it("requires authentication and separates cancellations/refunds from normal status updates", async () => {
    await request(app()).patch(`/api/external/orders/${order.id}/app-status`).send({ appStatus: "preparing" }).expect(401);
    const res = await request(app()).patch(`/api/external/orders/${order.id}/app-status`).set(header)
      .send({ appStatus: "refunded", concordiaOrderNumber: "STAFF-fixture" });
    expect(res.status).toBe(409); expect(mocks.dbPatch).not.toHaveBeenCalled();
  });
  it("recovers a missed intermediate event without inventing another order", async () => {
    const res = await request(app()).patch(`/api/external/orders/${order.id}/app-status`).set(header)
      .send({ appStatus: "picked_up", concordiaOrderNumber: "STAFF-fixture" });
    expect(res.body.changed).toBe(true);
    expect(mocks.dbPatch).toHaveBeenCalledWith(expect.objectContaining({ status: "picked_up" }));
  });
});
