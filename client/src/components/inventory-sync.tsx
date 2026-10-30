import { useEffect } from "react";
import { subscribeInventory } from "@/lib/inventory-sync";

export function InventorySync() {
  useEffect(subscribeInventory, []);
  return null;
}
