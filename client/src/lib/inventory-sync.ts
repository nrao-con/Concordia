import { queryClient } from "./queryClient";

/** One shared browser subscription for shop, search, detail pages and carts. */
export function subscribeInventory() {
  let stopped = false;
  let inFlight = false;
  let lastRevision: string | null = null;
  let timer: ReturnType<typeof setInterval>;
  let stream: EventSource | undefined;
  let recoveryNeeded = true;
  const inventoryQuery = (query: { queryKey: readonly unknown[] }) =>
    query.queryKey.some(key => typeof key === "string" && (/products?|search/.test(key) || key === "/api/cart"));
  const refresh = async (recover = false) => {
    recoveryNeeded ||= recover;
    if (stopped || inFlight || document.visibilityState === "hidden" || !navigator.onLine) return;
    inFlight = true;
    try {
      const response = await fetch(`/api/inventory/revision${recoveryNeeded ? "?recover=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Inventory unavailable");
      const result = await response.json();
      if (stopped) return;
      if (typeof result.revision !== "string") throw new Error("Invalid inventory revision");
      if (recoveryNeeded || result.revision !== lastRevision) {
        lastRevision = result.revision;
        recoveryNeeded = false;
        await queryClient.invalidateQueries({ predicate: inventoryQuery });
      }
    } catch {
      recoveryNeeded = true;
      // Stale product cards must not remain purchasable during a sync failure.
      queryClient.setQueriesData({ predicate: inventoryQuery }, (old: any) => {
        const unavailable = (p: any) => p && typeof p === "object"
          ? { ...p, inStock: false, stockQuantity: 0, stockCount: 0 } : p;
        const item = (p: any) => p?.product ? { ...p, product: unavailable(p.product) } : unavailable(p);
        return Array.isArray(old) ? old.map(item) : item(old);
      });
    } finally { inFlight = false; }
  };
  const recover = () => { void refresh(true); };
  const visibility = () => {
    if (document.visibilityState === "hidden") { stream?.close(); stream = undefined; }
    else { connect(); recover(); }
  };
  const connect = () => {
    if (stream || stopped || document.visibilityState === "hidden" || !navigator.onLine) return;
    // Same-origin relay avoids depending on Staff's browser CORS configuration.
    stream = new EventSource("/api/inventory/events");
    stream.onopen = recover;
    for (const event of ["product_updated", "product_hidden", "product_deleted", "inventory_resync"]) stream.addEventListener(event, recover);
    // EventSource reconnects; revision polling also recovers missed events.
    stream.onerror = () => { recoveryNeeded = true; };
  };
  const online = () => { connect(); recover(); };
  window.addEventListener("focus", recover);
  window.addEventListener("online", online);
  document.addEventListener("visibilitychange", visibility);
  connect();
  recover();
  timer = setInterval(() => { void refresh(); }, 1000);
  return () => {
    stopped = true;
    clearInterval(timer);
    stream?.close();
    window.removeEventListener("focus", recover);
    window.removeEventListener("online", online);
    document.removeEventListener("visibilitychange", visibility);
  };
}
