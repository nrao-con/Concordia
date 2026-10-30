import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: {
    getUser: vi.fn(), getCartItemsByUserId: vi.fn(), getProduct: vi.fn(),
    createOrder: vi.fn(), createOrderItem: vi.fn(), removeSubmittedCartItem: vi.fn(),
    decrementProductStock: vi.fn(), incrementProductStock: vi.fn(),
  },
  verify: vi.fn(), handoff: vi.fn(), address: vi.fn(),
  claim: vi.fn(), complete: vi.fn(), release: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: mocks.storage }));
vi.mock("../staff-catalog", () => ({ verifyStaffAvailability: mocks.verify }));
vi.mock("../staff-sync", () => ({ notifyStaffAppSale: mocks.handoff }));
vi.mock("../address-verification", async importOriginal => ({
  ...await importOriginal<typeof import("../address-verification")>(),
  verifyDeliveryAddress: mocks.address,
}));
vi.mock("../request-idempotency", () => ({
  normalizeIdempotencyKey: (key?: string) => key && /^[A-Za-z0-9._:-]{1,255}$/.test(key) ? key : null,
  claimRequest: mocks.claim, completeRequest: mocks.complete, releaseUncompletedRequest: mocks.release,
}));
import { registerShopOrderRequests, handleAppShopRequest } from "../shop-order-requests";

const details = { guestName: "Isolated Fixture", guestPhone: "2025550101" };
let cart: any[], saved: any[], lines: any[], claims: Map<string, any>;
let app: express.Express;
const notify = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  cart = [
    { id: "cart-soap", productId: "local-soap", prescriptionId: null, quantity: 2, userId: "patient-fixture" },
    { id: "cart-rx", productId: null, prescriptionId: "rx-fixture", quantity: 1, userId: "patient-fixture" },
  ];
  saved = []; lines = []; claims = new Map();
  mocks.storage.getUser.mockImplementation(async id => id === "patient-fixture" ? { id, email: "fixture@example.test" } : undefined);
  mocks.storage.getCartItemsByUserId.mockImplementation(async () => structuredClone(cart));
  mocks.storage.getProduct.mockResolvedValue({
    id: "local-soap", externalId: "12", name: "Staff-priced fixture", price: "4.25",
    stockQuantity: 5, inStock: true, requiresPrescription: false,
  });
  mocks.verify.mockResolvedValue(true);
  mocks.address.mockResolvedValue({ valid: true });
  mocks.handoff.mockResolvedValue(true);
  mocks.storage.createOrder.mockImplementation(async order => {
    const created = { ...order, id: `fixture-order-${saved.length + 1}` };
    saved.push(created); return created;
  });
  mocks.storage.createOrderItem.mockImplementation(async item => { lines.push(item); return item; });
  mocks.storage.removeSubmittedCartItem.mockImplementation(async (id, userId, quantity) => {
    cart = cart.filter(item => !(item.id === id && item.userId === userId && item.quantity === quantity));
  });
  mocks.claim.mockImplementation(async (scope, key, body) => {
    const id = `${scope}:${key}`, fingerprint = JSON.stringify(body), old = claims.get(id);
    if (old && old.fingerprint !== fingerprint) return { kind: "mismatch", correlationId: id };
    if (old) return { kind: "duplicate", statusCode: old.status ?? 409, body: old.body ?? { message: "Request is already being processed" }, correlationId: id };
    claims.set(id, { fingerprint }); return { kind: "claimed", correlationId: id };
  });
  mocks.complete.mockImplementation(async (scope, key, status, body) => Object.assign(claims.get(`${scope}:${key}`), { status, body }));
  mocks.release.mockImplementation(async (scope, key) => claims.delete(`${scope}:${key}`));
  app = express(); app.use(express.json());
  registerShopOrderRequests(app, (req, res, next) => {
    if (!req.get("Fixture-Patient")) { res.status(401).json({ message: "Unauthorized" }); return; }
    next();
  }, req => req.get("Fixture-Patient"), notify);
  app.post("/fixture/app-order", (req, res) => handleAppShopRequest(req, res, req.body, notify));
});
const member = (key = "fixture-request") => request(app).post("/api/shop/order-requests")
  .set("Fixture-Patient", "patient-fixture").set("Idempotency-Key", key);

describe("signed-in Staff-backed shop requests", () => {
  const address = {
    label: "898 East Tremont Avenue, New York, NY 10460", street: "898 East Tremont Avenue",
    city: "New York", state: "NY", zipCode: "10460", lat: 40.842, lon: -73.884,
  };
  it("requires a complete contact phone for members and the app", async () => {
    for (const phone of ["", "1234567", "not a phone", "123456789012"]) {
      expect((await member().send({ ...details, guestPhone: phone })).status).toBe(400);
      expect((await request(app).post("/fixture/app-order").set("Idempotency-Key", "app-phone-fixture").send({
        customer: { firstName: "Isolated", lastName: "Fixture", phone }, items: [{ productId: "local-soap", quantity: 2 }], total: 8.5,
      })).status).toBe(400);
    }
    expect(saved).toHaveLength(0);
    expect(mocks.handoff).not.toHaveBeenCalled();
  });
  it("verifies delivery on the server, preserves unit/phone for Staff, and safely replays the unpaid request", async () => {
    const body = { ...details, guestPhone: "+1 (202) 555-0101", deliveryMethod: "delivery",
      shippingAddress: address.label, shippingAddressUnit: "Apt 4B", shippingAddressVerification: address };
    const first = await member().send(body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ deliveryMethod: "delivery", paymentStatus: "unpaid", shippingAddress: `${address.label}, Apt 4B` });
    expect(mocks.address).toHaveBeenCalledWith(address.label, address);
    expect(saved[0]).toMatchObject({ guestPhone: "2025550101", paymentIntentId: null, status: "pending" });
    expect(mocks.handoff.mock.calls[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ phone: "2025550101", deliveryMethod: "delivery", shippingAddress: `${address.label}, Apt 4B`, paymentStatus: "unpaid" }),
    ]));
    expect((await member().send(body)).body).toEqual(first.body);
    expect(saved).toHaveLength(1); expect(mocks.handoff).toHaveBeenCalledOnce();
    expect(mocks.storage.decrementProductStock).not.toHaveBeenCalled();
  });
  it("rejects an unverified address or failed server verification before saving, without locking a safe retry", async () => {
    const body = { ...details, deliveryMethod: "delivery", shippingAddress: address.label };
    expect((await member().send(body)).status).toBe(400);
    mocks.address.mockResolvedValueOnce({ valid: false, message: "Address could not be verified" });
    expect((await member().send({ ...body, shippingAddressVerification: address })).status).toBe(400);
    expect(saved).toHaveLength(0);
    expect((await member().send({ ...body, shippingAddressVerification: address })).status).toBe(200);
  });
  it("requires authentication and a stable request key", async () => {
    expect((await request(app).post("/api/shop/order-requests").send(details)).status).toBe(401);
    expect((await request(app).post("/api/shop/order-requests").set("Fixture-Patient", "patient-fixture").send(details)).status).toBe(400);
    expect(saved).toHaveLength(0);
  });
  it("rejects client ownership, line prices, payment claims and client item lists", async () => {
    for (const extra of [{ patientId: "someone-else" }, { paymentStatus: "paid_online" }, { items: [] }, { total: 0 }]) {
      expect((await member().send({ ...details, ...extra })).status).toBe(400);
    }
    expect(saved).toHaveLength(0);
  });
  it("loads the owned cart, uses Staff prices, saves an unpaid request and leaves prescriptions untouched", async () => {
    const response = await member().send(details);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ requestOnly: true, reservationStatus: "unverified", paymentStatus: "collect_at_counter", staffHandoff: "confirmed" });
    expect(mocks.storage.getCartItemsByUserId).toHaveBeenCalledWith("patient-fixture");
    expect(saved[0]).toMatchObject({ userId: "patient-fixture", total: "8.5", status: "pending", paymentIntentId: null });
    expect(lines).toEqual([expect.objectContaining({ productId: "local-soap", quantity: 2, price: "4.25" })]);
    expect(mocks.handoff).toHaveBeenCalledOnce();
    expect(mocks.storage.decrementProductStock).not.toHaveBeenCalled();
    expect(mocks.storage.incrementProductStock).not.toHaveBeenCalled();
    expect(cart.map(item => item.id)).toEqual(["cart-rx"]);
  });
  it("returns the same saved order on replay even after cart cleanup", async () => {
    const first = await member().send(details), repeat = await member().send(details);
    expect(repeat.body).toEqual(first.body);
    expect(saved).toHaveLength(1); expect(mocks.handoff).toHaveBeenCalledOnce();
    expect((await member().send({ ...details, notes: "Changed" })).status).toBe(409);
  });
  it("retains cart quantities changed in another tab and newly added items", async () => {
    mocks.handoff.mockImplementationOnce(async () => {
      cart[0].quantity = 3;
      cart.push({ id: "new-cart-item", productId: "local-other", quantity: 1, userId: "patient-fixture" });
      return true;
    });
    expect((await member().send(details)).status).toBe(200);
    expect(cart.map(item => item.id)).toEqual(["cart-soap", "cart-rx", "new-cart-item"]);
    expect(mocks.storage.removeSubmittedCartItem).toHaveBeenCalledWith("cart-soap", "patient-fixture", 2);
  });
  it("rejects shortages and unavailable inventory before saving; a safe preflight failure can be retried", async () => {
    mocks.verify.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("Unavailable"));
    expect((await member().send(details)).status).toBe(409);
    expect((await member().send(details)).status).toBe(503);
    expect(saved).toHaveLength(0); expect(mocks.handoff).not.toHaveBeenCalled();
    expect((await member().send(details)).status).toBe(200);
  });
  it("keeps an uncertain request locked rather than creating another order after a local failure", async () => {
    mocks.storage.createOrderItem.mockRejectedValueOnce(new Error("Line write failed"));
    expect((await member().send(details)).status).toBe(503);
    expect((await member().send(details)).status).toBe(409);
    expect(saved).toHaveLength(1); expect(mocks.handoff).not.toHaveBeenCalled();
  });
});

describe("trusted app OTC requests", () => {
  const body = () => ({
    items: [{ productId: "local-soap", quantity: 2, price: 0 }],
    customer: { firstName: "App", lastName: "Fixture", phone: "2025550101" }, total: "8.50",
  });
  const submit = (data = body()) => request(app).post("/fixture/app-order").set("Idempotency-Key", "app-fixture").send(data);
  it("requires stable identity rather than accepting unkeyed app retries", async () => {
    expect((await request(app).post("/fixture/app-order").send(body())).status).toBe(400);
    expect(saved).toHaveLength(0);
  });
  it("ignores supplied line prices, forwards once and never guesses ownership from contacts", async () => {
    const first = await submit(), repeat = await submit();
    expect(first.status).toBe(201); expect(repeat.body).toEqual(first.body);
    expect(lines[0].price).toBe("4.25"); expect(saved[0].userId).toBe(null);
    expect(saved[0].source).toBe("app"); expect(mocks.handoff).toHaveBeenCalledOnce();
    expect(mocks.storage.decrementProductStock).not.toHaveBeenCalled();
  });
  it("rejects a changed total rather than recording a stale app price", async () => {
    expect((await submit({ ...body(), total: "0.00" })).status).toBe(409);
    expect(saved).toHaveLength(0); expect(mocks.handoff).not.toHaveBeenCalled();
  });
  it("rejects unknown patient IDs instead of contact-linking another account", async () => {
    const data = body(); Object.assign(data.customer, { userId: "unknown-patient" });
    expect((await submit(data)).status).toBe(400); expect(saved).toHaveLength(0);
  });
});
