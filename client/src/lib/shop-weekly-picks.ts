import { getAvailableProductQuantity } from "@shared/cart-utils";

type FeaturedProduct = {
  id: string;
  requiresPrescription?: boolean | null;
  inStock?: boolean | null;
  stockQuantity?: number | null;
};

const DAY = 86_400_000;
const MONDAY_EPOCH = Date.UTC(1970, 0, 5);
const pharmacyDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric",
});

/** A pharmacy-local Monday boundary, unaffected by the visitor's timezone or DST. */
function pharmacyWeek(now: Date): number {
  const parts = pharmacyDate.formatToParts(now);
  const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
  const date = Date.UTC(part("year"), part("month") - 1, part("day"));
  return Math.floor((date - MONDAY_EPOCH) / (7 * DAY));
}

function shuffleKey(id: string): number {
  let hash = 2166136261;
  for (const character of `concordia-weekly-picks:${id}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

/**
 * Stable shuffled rotation, not a popularity ranking. Staff data is never mutated.
 * Adjacent weeks do not overlap when at least twice the requested count is available.
 * Small inventories necessarily repeat; sold-out items leave immediately.
 */
export function selectWeeklyPicks<T extends FeaturedProduct>(
  products: readonly T[],
  now = new Date(),
  limit = 4,
): T[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const unique = new Map<string, T>();
  for (const product of products) {
    if (!product.requiresPrescription && getAvailableProductQuantity(product) > 0) {
      unique.set(product.id, product);
    }
  }
  const pool = [...unique.values()].sort((a, b) =>
    shuffleKey(a.id) - shuffleKey(b.id) || a.id.localeCompare(b.id),
  );
  const count = Math.min(Math.floor(limit), pool.length);
  if (count === 0) return [];
  const start = ((pharmacyWeek(now) * count) % pool.length + pool.length) % pool.length;
  return Array.from({ length: count }, (_, index) => pool[(start + index) % pool.length]);
}
