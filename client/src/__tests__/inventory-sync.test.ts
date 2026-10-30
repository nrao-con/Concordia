import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(), set: vi.fn(), fetch: vi.fn() }));
vi.mock("../lib/queryClient", () => ({ queryClient: {
  invalidateQueries: mocks.invalidate, setQueriesData: mocks.set,
} }));
import { subscribeInventory } from "../lib/inventory-sync";

class Stream extends EventTarget {
  static instances: Stream[] = [];
  onopen: (() => void) | undefined;
  onerror: (() => void) | undefined;
  closed = false;
  constructor(public url: string) { super(); Stream.instances.push(this); }
  close() { this.closed = true; }
}
let doc: EventTarget & { visibilityState: string };
let win: EventTarget;
let revision: string;
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); Stream.instances = [];
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  win = new EventTarget(); revision = "one";
  vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { onLine: true }); vi.stubGlobal("EventSource", Stream);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => ({ ok: true, json: async () => ({ revision }) }));
  mocks.invalidate.mockResolvedValue(undefined);
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

it("checks revision every second but refreshes product/cart queries only on changes", async () => {
  cleanup = subscribeInventory();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(mocks.fetch).toHaveBeenCalledTimes(4);
  expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  revision = "two";
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  const predicate = mocks.invalidate.mock.calls[1][0].predicate;
  for (const queryKey of [["/api/public/products"], ["/api/public/products/fixture"], ["/api/cart"], ["/api/search"]])
    expect(predicate({ queryKey })).toBe(true);
});
it("recovers on every inventory event, stream reconnect, focus and online restoration", async () => {
  cleanup = subscribeInventory(); await vi.advanceTimersByTimeAsync(0);
  for (const event of ["product_updated", "product_hidden", "product_deleted", "inventory_resync"]) {
    Stream.instances[0].dispatchEvent(new Event(event));
    await vi.advanceTimersByTimeAsync(0);
  }
  Stream.instances[0].onopen?.(); await vi.advanceTimersByTimeAsync(0);
  win.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(0);
  win.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(0);
  expect(mocks.invalidate).toHaveBeenCalledTimes(8);
  expect(mocks.fetch.mock.calls.every(([url]) => url.includes("recover=1"))).toBe(true);
});
it("pauses polling when hidden and cleans up timers/listeners/stream", async () => {
  cleanup = subscribeInventory(); await vi.advanceTimersByTimeAsync(0);
  doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  expect(Stream.instances[0].closed).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  cleanup(); cleanup = undefined;
  const count = mocks.fetch.mock.calls.length;
  await vi.advanceTimersByTimeAsync(5000);
  win.dispatchEvent(new Event("focus"));
  expect(mocks.fetch).toHaveBeenCalledTimes(count);
});
it("marks stale cards unavailable on errors and forces recovery", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("offline"));
  cleanup = subscribeInventory(); await vi.advanceTimersByTimeAsync(0);
  expect(mocks.set).toHaveBeenCalledTimes(1);
  const updater = mocks.set.mock.calls[0][1];
  expect(updater([{ id: "fixture", inStock: true, stockQuantity: 5 }])[0]).toMatchObject({ inStock: false, stockQuantity: 0 });
  expect(updater([{ id: "owned-cart", quantity: 2, product: { id: "fixture", inStock: true, stockQuantity: 5 } }])[0])
    .toMatchObject({ id: "owned-cart", quantity: 2, product: { inStock: false, stockQuantity: 0 } });
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.fetch.mock.calls[1][0]).toContain("recover=1");
  expect(mocks.invalidate).toHaveBeenCalled();
});
