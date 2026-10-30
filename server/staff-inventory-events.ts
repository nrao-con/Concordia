import { EventEmitter } from "events";

// Public notifications contain a catalog revision only, never order/customer data.
export const staffInventoryEvents = new EventEmitter();
staffInventoryEvents.setMaxListeners(0);
