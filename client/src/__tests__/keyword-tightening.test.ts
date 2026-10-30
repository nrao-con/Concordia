/**
 * Task #282 — Chatbot intent keyword tightening
 *
 * Validates that:
 * 1. Broad single-word tokens no longer fire unrelated intents
 * 2. Legitimate multi-word signals still fire the correct intent
 * 3. Flu_shot vocabulary still works after removing "booster shot" /
 *    "shot appointment" (replaced with "vaccine booster" / removed)
 */

import { describe, it, expect } from "vitest";
import { detectIntentHybrid } from "../lib/intent-engine";

// ── Inputs that must return "general" ──────────────────────────────────────
const FALSE_POSITIVES: string[] = [
  // "denied"/"rejected" alone — credit-card denial is not prior-auth
  "my card was denied",
  "my payment was rejected",
  "the transaction was denied",
  "denied",
  "rejected",

  // "shot" without flu/vaccine context
  "I got a shot",
  "I had a shot of espresso",
  "shot",
  "he took a shot",

  // "far" without pharmacy/distance context
  "how far in advance",
  "how far should I run today",
  "far",

  // "oral" / "orally" — not dental care
  "oral medication",
  "I take this orally",
  "she takes it orally",

  // "seasonal" without allergy context
  "any seasonal specials?",
  "seasonal sale this weekend",
  "seasonal",

  // "gas" without digestive context
  "gas station nearby",
  "how much is gas",
  "gas",

  // "late" without delivery/order context
  "I'm running late",
  "running late to work",
  "sorry I'm late",

  // "new card" without insurance context
  "I have a new credit card",
  "just got a new card",

  // Transfer — "another pharmacy" / "different pharmacy" without prescription context
  "is there another pharmacy nearby?",
  "can you recommend a different pharmacy?",

  // "somewhere else" without transfer/prescription context
  "somewhere else",
  "can I go somewhere else",
  "let's eat somewhere else",

  // "appeal" / "denial" without insurance/claim/prescription context
  "I want to appeal this denial",
  "my leave request was denied and I will appeal",
  "denial",
  "appeal",
];

// ── Inputs that must still fire the right intent ───────────────────────────
const TRUE_POSITIVES: Array<[string, string]> = [
  // prior_auth — insurance + denial phrasing (scoped: requires insurance/claim/prescription context)
  ["my insurance was denied",              "prior_auth"],
  ["insurance denied my coverage",         "prior_auth"],
  ["coverage denied by my insurance",      "prior_auth"],
  ["prior authorization required",         "prior_auth"],
  ["my prescription was denied",           "prior_auth"],
  ["medication denied by insurance",       "prior_auth"],
  ["my claim was rejected",                "prior_auth"],
  ["prescription rejected by plan",        "prior_auth"],
  ["I want to appeal my insurance denial", "prior_auth"],
  ["claim appeal for coverage",            "prior_auth"],

  // flu_shot — vaccine-booster phrase replaces "booster shot"
  ["I need a vaccine booster",             "flu_shot"],
  ["flu shot appointment",                 "flu_shot"],
  ["schedule a flu vaccine",               "flu_shot"],
  ["immunization appointment",             "flu_shot"],
  ["flu vaccination",                      "flu_shot"],

  // transfer_out — clear outbound signals
  ["I want to switch to a different pharmacy for my prescriptions", "transfer_out"],
  // "transfer my meds to another pharmacy" → ambiguous; engine scores transfer (inbound) higher
  ["I want to transfer out to cvs pharmacy",  "transfer_out"],
  // "going somewhere else for meds" — Tier-2 vocab fires (requires ≥2 tokens) but bare "somewhere else" must not
  ["going somewhere else for my prescriptions", "transfer_out"],

  // location — real distance query
  ["how far away is concordia pharmacy",   "location"],
  ["pharmacy address and directions",      "location"],

  // otc_allergy — seasonal allergies phrase fires correctly
  ["seasonal allergy medication",          "otc_allergy"],

  // after_hours — clear night/weekend signals (≥2 vocab matches)
  ["open late at night pharmacy",          "after_hours"],
  ["after hours pharmacy night time",      "after_hours"],

  // otc_dental — oral + hygiene/care/health context (bare "oral" must NOT fire)
  ["oral hygiene products",               "otc_dental"],
  ["oral care routine",                   "otc_dental"],
  ["oral health tips",                    "otc_dental"],
];

describe("keyword-tightening — false positives return 'general'", () => {
  for (const input of FALSE_POSITIVES) {
    it(JSON.stringify(input), () => {
      expect(detectIntentHybrid(input)).toBe("general");
    });
  }
});

describe("keyword-tightening — legitimate phrases still fire correctly", () => {
  for (const [input, expected] of TRUE_POSITIVES) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(detectIntentHybrid(input)).toBe(expected);
    });
  }
});

// ── Task #289 — Phone-transfer context guard ───────────────────────────────
// "transfer" + phone/call/voicemail/line context must NOT route to prescription transfer

describe("Task #289 — phone-transfer context guard", () => {
  it('"can you transfer my call to the pharmacist?" → general', () => {
    expect(detectIntentHybrid("can you transfer my call to the pharmacist?")).toBe("general");
  });

  it('"Transfer my phone to the front desk" → general', () => {
    expect(detectIntentHybrid("Transfer my phone to the front desk")).toBe("general");
  });
});

// ── Task #289 — Refill slang vocab (phrase evaluator) ─────────────────────

describe("Task #289 — refill slang vocab", () => {
  it('"Hook me up with my usual stash" → refill', () => {
    expect(detectIntentHybrid("Hook me up with my usual stash")).toBe("refill");
  });

  it('"My script" → refill', () => {
    expect(detectIntentHybrid("My script")).toBe("refill");
  });

  it('"the usual" → refill', () => {
    expect(detectIntentHybrid("the usual")).toBe("refill");
  });

  it('"hook it up" → refill', () => {
    expect(detectIntentHybrid("hook it up")).toBe("refill");
  });
});

// ── Task #289 — Location slang vocab (phrase evaluator) ───────────────────

describe("Task #289 — location slang vocab", () => {
  it('"Where you at" → location', () => {
    expect(detectIntentHybrid("Where you at")).toBe("location");
  });

  it('"where are you located" → location', () => {
    expect(detectIntentHybrid("where are you located")).toBe("location");
  });
});
