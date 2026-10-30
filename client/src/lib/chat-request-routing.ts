type PickupStep = "pickup_time" | string;

/**
 * Recognize a vague combined medication + grocery request before the generic
 * search fallback. This deliberately does not extract "grocery" as an item;
 * the patient still needs to say which store products they want.
 */
export function isGenericMedicationAndGroceryRequest(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasMedication = /\b(?:meds?|medicine|medications?|prescriptions?|rx|medicinas?|medicamentos?|recetas?|pastillas?)\b/.test(normalized);
  const hasGrocery = /\b(?:grocer(?:y|ies)|grocer+y|grocerys|grocerr?y|store items?|food items?)\b/.test(normalized);
  return hasMedication && hasGrocery;
}

/** Extracts a common non-prescription store item without claiming availability. */
export function extractCommonStoreItem(text: string): string | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\d\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:i\s+)?(?:want|need|would like|looking for|add|some|a|an|the)\s+/, "");
  if (/^(?:water|bottled water|juice|soda|milk|eggs?|bread|rice|cereal|snacks?|drinks?|beverages?|toiletries|paper towels?|toilet paper)$/.test(normalized)) {
    return normalized;
  }
  if (/^(?:sugar[- ]free|diet|gluten[- ]free|low[- ]sodium)\s+(?:juice|soda|snacks?|drinks?|beverages?|food)$/.test(normalized)) {
    return normalized.replace(" ", "-");
  }
  return null;
}

/** A product preference that needs a noun or can modify the last listed item. */
export function extractStoreItemPreference(text: string): string | null {
  const normalized = text.toLowerCase().replace(/[^\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  if (/^sin\s+az[uú]car$/.test(normalized)) return "sin azúcar";
  if (/^bajo\s+en\s+sodio$/.test(normalized)) return "bajo en sodio";
  if (/^sin\s+gluten$/.test(normalized)) return "sin gluten";
  return /^(?:sugar[- ]free|diet|gluten[- ]free|low[- ]sodium)$/.test(normalized)
    ? normalized.replace(" ", "-")
    : null;
}

export function isStoreItemCollectionComplete(text: string): boolean {
  return /^(?:done|that'?s all|no more|finished|done adding items|listo|lista|eso es todo|nada m[aá]s|termin[eé])$/i.test(text.trim());
}

export type StoreCollectionTurn =
  | { kind: "add"; item: string; items: string[] }
  | { kind: "update"; previousItem: string; item: string; items: string[] }
  | { kind: "clarify_preference"; preference: string; items: string[] }
  | { kind: "complete"; items: string[] };

/**
 * Stateful slot filling for store requests. Each turn updates the existing
 * item list instead of sending short replies back through fresh intent
 * classification.
 */
export function resolveStoreCollectionTurn(text: string, currentItems: string[]): StoreCollectionTurn | null {
  if (currentItems.length > 0 && isStoreItemCollectionComplete(text)) {
    return { kind: "complete", items: currentItems };
  }

  const preference = extractStoreItemPreference(text);
  if (preference) {
    if (currentItems.length === 0) {
      return { kind: "clarify_preference", preference, items: currentItems };
    }
    const previousItem = currentItems[currentItems.length - 1];
    const item = `${preference} ${previousItem}`;
    return {
      kind: "update",
      previousItem,
      item,
      items: [...currentItems.slice(0, -1), item],
    };
  }

  const item = extractCommonStoreItem(text);
  if (!item) return null;
  return {
    kind: "add",
    item,
    items: Array.from(new Set([...currentItems, item])),
  };
}

export function isExplicitShopSearch(text: string): boolean {
  return /\b(?:search|find|buy|shop|browse|looking for|do you (?:have|carry|sell)|where can i get)\b/i.test(text);
}

/**
 * Pickup windows can be entered in the shared composer as well as selected
 * from the quick-reply buttons. Keep this deliberately narrow: only the
 * pickup-time step may interpret free text this way.
 */
export function getPickupWindowFromFreeText(
  text: string,
  activeStep: PickupStep,
  deliveryType: "delivery" | "pickup" | null,
): string | null {
  const trimmed = text.trim();
  return activeStep === "pickup_time" && deliveryType === "pickup" && trimmed ? trimmed : null;
}

/** A readiness question about an existing prescription is not a new pickup request. */
export function isPrescriptionReadinessRequest(text: string): boolean {
  return /\b(?:rx|prescriptions?|meds?|medications?|pills?)\b/i.test(text)
    && /\b(?:ready|status)\b/i.test(text);
}

/** Ask for a new time instead of forwarding a same-day window whose stated time has passed. */
export function isPastPickupWindow(text: string, now: Date = new Date()): boolean {
  if (/\b(?:tomorrow|next week|next monday|next tuesday|next wednesday|next thursday|next friday|next saturday|next sunday)\b/i.test(text)) return false;
  const match = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (!match) return false;
  const hour = (Number(match[1]) % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  const minute = Number(match[2] ?? 0);
  const current = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  }).formatToParts(now);
  const currentHour = Number(current.find(part => part.type === "hour")?.value);
  const currentMinute = Number(current.find(part => part.type === "minute")?.value);
  return hour * 60 + minute <= currentHour * 60 + currentMinute;
}

/**
 * A pickup clause can contain an OTC/grocery request as well as the pharmacy
 * intent (for example, "I want to pick up some eggs"). Preserve that item for
 * staff instead of treating the whole clause as only an intent.
 */
export function extractUnmatchedPickupItem(clause: string): string | null {
  if (!/\b(?:pickup|pick\s+up)\b/i.test(clause)) return null;
  const item = clause
    .replace(/^(?:i\s+)?(?:want|need)\s+(?:to\s+)?/i, "")
    .replace(/\b(?:pickup|pick\s+up)\b/i, "")
    .replace(/^\s*(?:some|a|an|the)\s+/i, "")
    .trim();
  if (/\b(?:meds?|medication|medicine|prescriptions?|pills?|drugs?|rx)\b/i.test(item)) return null;
  return item.length >= 3 ? item : null;
}

/**
 * Preserve non-medication items even when later routing recognizes the whole
 * message primarily as a pharmacy request.
 */
export function extractPendingPickupItems(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/\b(?:and|then|also|plus|along with|as well as)\b|,/i)
    .map((clause) => extractUnmatchedPickupItem(clause.trim()))
    .filter((item): item is string => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}