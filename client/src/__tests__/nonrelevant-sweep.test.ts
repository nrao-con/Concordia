import { describe, it, expect } from "vitest";
import { detectIntentHybrid } from "../lib/intent-engine";

const SHOULD_BE_GENERAL: string[] = [
  // chit-chat / noise
  "hello", "hi there", "nice weather today", "I like pizza",
  "testing 123", "what's up", "good morning", "how are you",
  "lol ok", "k", "   ", "asdfghjkl",
  // previously false-positive keyword matches
  "oral medication", "I take this orally",
  "I got a shot", "I had a shot of espresso",
  "running late", "I'm running late to work",
  "my card was denied",
  // credit card ≠ insurance update
  "I have a new credit card",
  // credit card declined ≠ payment methods enquiry
  "credit card declined",
  "how far in advance", "gas station nearby",
  "seasonal sale", "any seasonal specials?", "denied",
  // negation guard — intent keywords present but negated
  "please don't refill my meds", "stop tracking please",
  "cancel everything", "I won't renew that",
  "never give me that again", "don't transfer my pills",
  "I won't refill that prescription",
  // single ambiguous tokens (size < 2 after tokenisation)
  "shot", "flu", "pharmacy", "transfer", "delivery",
];

const SHOULD_FIRE: Array<[string, string]> = [
  // interrogative carve-out — negation form inside a question
  ["can't I get a refill?",                          "refill"],
  ["won't you transfer my scripts from Walgreens?",  "transfer"],
  // real intent signals
  ["refill",                                         "refill"],
  ["I need a refill",                                "refill"],
  ["flu shot appointment",                           "flu_shot"],
  ["track my delivery",                              "tracking"],
  ["not covered by insurance",                       "prior_auth"],
  ["prier auth status",                              "prior_auth"],
  ["transfur to cvs pharmacy",                       "transfer"],
  // payment_methods still fires on real inputs
  ["do you accept apple pay",                        "payment_methods"],
  ["what payment methods do you accept",             "payment_methods"],
  // update_insurance still fires on real inputs
  ["I got new insurance",                            "update_insurance"],
  ["I need to update my insurance",                  "update_insurance"],
];

describe("non-relevant inputs → general", () => {
  for (const input of SHOULD_BE_GENERAL) {
    it(JSON.stringify(input), () => {
      expect(detectIntentHybrid(input)).toBe("general");
    });
  }
});

describe("real intent inputs still fire correctly", () => {
  for (const [input, expected] of SHOULD_FIRE) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(detectIntentHybrid(input)).toBe(expected);
    });
  }
});
