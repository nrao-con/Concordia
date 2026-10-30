/**
 * Staff owns catalog and inventory. Events trigger reconciliation against the
 * current catalog; event bodies are never trusted as ordered snapshots.
 */
import { reconcileStaffCatalog, STAFF_BASE } from "./staff-catalog";
export { notifyStaffAppSale } from "./staff-order-delivery";

export async function startStaffProductSync(): Promise<void> {
  const recover = () => reconcileStaffCatalog(true).catch(() => {
    console.warn("[StaffSync] Authoritative catalog unavailable; recovery will retry");
  });
  await recover();
  setInterval(() => { void recover(); }, 2 * 60_000);
  void (async () => {
    let failures = 0;
    while (true) {
      try {
        const response = await fetch(`${STAFF_BASE}/api/public/events`, {
          headers: { Accept: "text/event-stream" }, redirect: "error",
        });
        if (!response.ok || !response.body) throw new Error("SSE unavailable");
        failures = 0;
        console.log("[StaffSync] Connected to inventory events");
        await recover(); // Initial connection and every reconnect.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
            if (["product_updated", "product_hidden", "product_deleted", "inventory_resync"].includes(event ?? "")) await recover();
          }
          if (buffer.length > 1_000_000) throw new Error("Invalid inventory stream");
        }
        throw new Error("Stream ended");
      } catch {
        const delay = Math.min(60_000, 5000 * 2 ** failures++);
        console.warn(`[StaffSync] Inventory stream disconnected; reconnecting in ${delay / 1000}s`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  })();
}
