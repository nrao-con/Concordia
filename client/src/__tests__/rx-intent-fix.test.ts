import { describe, it, expect } from "vitest";
import { detectIntentHybrid } from "../lib/intent-engine";

describe("rx intent fixes", () => {
  it('"can i also have my rx" → refill', () => expect(detectIntentHybrid("can i also have my rx")).toBe("refill"));
  it('"my rxs" → refill', () => expect(detectIntentHybrid("my rxs")).toBe("refill"));
  it('"get my rx" → refill', () => expect(detectIntentHybrid("get my rx")).toBe("refill"));
  it('"pick up my rx" → refill', () => expect(detectIntentHybrid("pick up my rx")).toBe("refill"));
  it('"rx refill" → refill', () => expect(detectIntentHybrid("rx refill")).toBe("refill"));
  it('"i need a refill" still works', () => expect(detectIntentHybrid("i need a refill")).toBe("refill"));
  // rx alone is now a meaningful token — but single token → general per size guard
  it('"rx" alone → general (single meaningful token)', () => expect(detectIntentHybrid("rx")).toBe("general"));
});
