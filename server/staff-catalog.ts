import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "./storage";
import { staffInventoryEvents } from "./staff-inventory-events";

export const STAFF_BASE = "https://concordia-staff.replit.app";
export const staffProductId = z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9]\d*$/).refine(v => Number.isSafeInteger(Number(v)))])
  .transform(String);
export const productPushSchema = z.object({
  concordiaId: staffProductId,
  externalProductId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(500),
  price: z.number().finite().nonnegative().refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6),
  stockCount: z.number().int().nonnegative(),
  inStock: z.boolean().optional(),
  category: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});
export const productHideSchema = productPushSchema.pick({ concordiaId: true, externalProductId: true });
const catalogSchema = z.array(z.object({
  id: staffProductId, name: z.string().min(1), price: z.union([z.number(), z.string()]),
  stockCount: z.number().int().nonnegative().optional(),
  stockQuantity: z.number().int().nonnegative().optional(),
  inStock: z.boolean().optional(), showOnWebsite: z.boolean().optional(), showInApp: z.boolean().optional(),
  visible: z.boolean().optional(), active: z.boolean().optional(), status: z.string().optional(),
  category: z.string().nullable().optional(), imageUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).refine(p => p.stockCount !== undefined || p.stockQuantity !== undefined)
  .refine(p => Number.isFinite(Number(p.price)) && Number(p.price) >= 0
    && Math.abs(Number(p.price) * 100 - Math.round(Number(p.price) * 100)) < 1e-6));
type StaffProduct = z.infer<typeof catalogSchema>[number];

let snapshot: StaffProduct[] = [];
let fetchedAt = 0;
let revision = "uninitialized";
let flight: Promise<StaffProduct[]> | undefined;
let refreshGeneration = 0;
const CATALOG_TTL_MS = 1000;
const FAILURE_COOLDOWN_MS = 1000;
let catalogRetryAt = 0;

/** A handoff can change Staff stock even if its response was lost. */
export function requestStaffInventoryRefresh() {
  refreshGeneration++;
  fetchedAt = 0;
  catalogRetryAt = 0;
  revisionAt = 0;
  revisionRetryAt = 0;
  staffInventoryEvents.emit("revision", revision);
}

export async function getStaffShopProducts(channel: "website" | "app" = "website") {
  const current = await reconcileStaffCatalog();
  const visibleIds = new Set(current.filter(p => {
    const visible = p.visible !== false && p.active !== false && !["inactive", "hidden", "deleted"].includes(p.status ?? "");
    return visible && (channel === "app" ? (p.showInApp ?? p.showOnWebsite) !== false : p.showOnWebsite !== false);
  }).map(p => p.id));
  const source = new Map(current.map(p => [p.id, p]));
  return (await storage.getAllProducts())
    .filter(p => !!p.externalId && visibleIds.has(p.externalId) && !p.requiresPrescription)
    .map(p => ({ ...p, ...staffProductFields(source.get(p.externalId!)!) }));
}

function staffProductFields(p: StaffProduct) {
  let imageUrl: string | null = null;
  if (p.imageUrl) {
    try {
      const url = new URL(p.imageUrl, STAFF_BASE);
      if (["https:", "http:"].includes(url.protocol)) imageUrl = url.href;
    } catch { /* Invalid images must not use a website-local substitute. */ }
  }
  return {
    externalId: p.id, name: p.name, price: Number(p.price).toFixed(2),
    stockQuantity: p.stockQuantity ?? p.stockCount ?? 0,
    inStock: catalogProductAvailable(p),
    status: catalogProductAvailable(p) ? "active" : "inactive",
    showOnWebsite: p.showOnWebsite !== false && p.visible !== false && p.active !== false
      && !["inactive", "hidden", "deleted"].includes(p.status ?? ""),
    showInApp: (p.showInApp ?? p.showOnWebsite) !== false && p.visible !== false && p.active !== false
      && !["inactive", "hidden", "deleted"].includes(p.status ?? ""),
    category: p.category ?? "General", imageUrl, description: p.description ?? null,
  };
}

export function catalogProductAvailable(p: StaffProduct): boolean {
  return p.inStock !== false && (p.stockQuantity ?? p.stockCount ?? 0) > 0
    && p.showOnWebsite !== false && p.visible !== false && p.active !== false
    && !["inactive", "hidden", "deleted"].includes(p.status ?? "");
}

export async function readStaffCatalog(): Promise<StaffProduct[]> {
  const resp = await fetch(`${STAFF_BASE}/api/public/products`, {
    headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok || !resp.headers.get("content-type")?.includes("application/json")) throw new Error("Staff catalog unavailable");
  const items = catalogSchema.parse(await resp.json());
  if (new Set(items.map(p => p.id)).size !== items.length) throw new Error("Duplicate staff catalog ID");
  return items;
}

/** Compare only Staff-owned fields, leaving website metadata and timestamps alone. */
function hasProductChanges(existing: object, patch: object): boolean {
  const record = existing as Record<string, unknown>;
  return Object.entries(patch).some(([key, value]) => record[key] !== value);
}

export async function reconcileStaffCatalog(force = false, hint?: { concordiaId: string; externalProductId?: string | null }): Promise<StaffProduct[]> {
  // Serialize fetch+commit: late webhook/SSE deliveries never apply their stale body.
  if (flight) {
    await flight;
    if (hint || (force && !fetchedAt)) return reconcileStaffCatalog(true, hint);
    return snapshot;
  }
  // Forced order-time checks and authenticated push hints bypass both caches.
  if (!force && !hint && catalogRetryAt > Date.now()) throw new Error("Staff catalog temporarily unavailable");
  if (!force && !hint && fetchedAt && Date.now() - fetchedAt < CATALOG_TTL_MS) return snapshot;
  flight = (async () => {
    const generation = refreshGeneration;
    const current = await readStaffCatalog();
    const locals = await storage.getAllProducts();
    const byExternalId = new Map(locals.filter(p => p.externalId).map(p => [p.externalId, p]));
    const byLocalId = new Map(locals.map(p => [p.id, p]));
    const live = new Set(current.map(p => p.id));
    for (const p of current) {
      let existing = byExternalId.get(p.id);
      if (!existing && hint?.concordiaId === p.id && hint.externalProductId) {
        const candidate = byLocalId.get(hint.externalProductId);
        if (candidate && (!candidate.externalId || candidate.externalId === p.id)) existing = candidate;
        else if (candidate) throw new Error("Product mapping conflict");
      }
      const patch = staffProductFields(p);
      if (existing) {
        if (hasProductChanges(existing, patch) && !await storage.updateProduct(existing.id, patch))
          throw new Error("Product update not committed");
      } else {
        await storage.createProduct({ ...patch, requiresPrescription: false });
      }
    }
    // A valid empty catalog is authoritative too. Preserve records and order history.
    for (const local of locals) {
      if (local.externalId && !live.has(local.externalId)) {
        const hidden = { status: "inactive", showOnWebsite: false, showInApp: false, stockQuantity: 0, inStock: false };
        if (hasProductChanges(local, hidden) && !await storage.updateProduct(local.id, hidden))
          throw new Error("Product hide not committed");
      }
    }
    snapshot = current;
    catalogRetryAt = 0;
    fetchedAt = generation === refreshGeneration ? Date.now() : 0;
    // Staff may reorder the same rows; that alone should not invalidate every cart.
    const nextRevision = createHash("sha256")
      .update(JSON.stringify([...current].sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
    if (nextRevision !== revision) {
      revision = nextRevision;
      staffInventoryEvents.emit("revision", revision);
    }
    return snapshot;
  })();
  try {
    return await flight;
  } catch (error) {
    // Cache failure briefly, never stale success. Checkout can still force a fresh read.
    fetchedAt = 0;
    catalogRetryAt = Date.now() + FAILURE_COOLDOWN_MS;
    throw error;
  } finally { flight = undefined; }
}

let revisionFlight: Promise<{ revision: string; recovery: boolean }> | undefined;
let revisionAt = 0;
let revisionResult = { revision: "uninitialized", recovery: true };
let upstreamRevision = "";
let revisionRetryAt = 0;
export async function getInventoryRevision() {
  if (revisionFlight) return revisionFlight;
  if (revisionRetryAt > Date.now()) throw new Error("Staff inventory temporarily unavailable");
  if (Date.now() - revisionAt < 750) return revisionResult;
  revisionFlight = (async () => {
    let next = "";
    try {
      const resp = await fetch(`${STAFF_BASE}/api/public/inventory/revision`, {
        redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok || !resp.headers.get("content-type")?.includes("application/json")) throw new Error("Revision unavailable");
      const body = await resp.json();
      // Treat the public revision representation as opaque. Do not require
      // an undocumented field name from an independently deployed receiver.
      if (body === null || body?.ok === false || body?.success === false) throw new Error("Invalid revision");
      next = JSON.stringify(body);
    } catch {
      // Published older Staff versions lack this endpoint. Recover by bounded catalog polling.
      if (Date.now() - fetchedAt >= 5000) await reconcileStaffCatalog(true);
      revisionResult = { revision, recovery: true };
      revisionAt = Date.now();
      return revisionResult;
    }
    if (next !== upstreamRevision || !fetchedAt) {
      await reconcileStaffCatalog(true);
      upstreamRevision = next;
    }
    revisionResult = { revision, recovery: false };
    revisionAt = Date.now();
    return revisionResult;
  })();
  try {
    const result = await revisionFlight;
    revisionRetryAt = 0;
    return result;
  } catch (error) {
    revisionAt = 0;
    revisionRetryAt = Date.now() + FAILURE_COOLDOWN_MS;
    throw error;
  } finally { revisionFlight = undefined; }
}

export async function verifyStaffAvailability(items: Array<{ productId: string; quantity: number }>): Promise<boolean> {
  const catalog = await reconcileStaffCatalog(true);
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) return false;
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [id, quantity] of totals) {
    const local = await storage.getProduct(id);
    const p = catalog.find(p => p.id === local?.externalId);
    if (!p || !catalogProductAvailable(p) || quantity > 100 || quantity > (p.stockQuantity ?? p.stockCount ?? 0)) return false;
  }
  return totals.size > 0 && items.length <= 100;
}
