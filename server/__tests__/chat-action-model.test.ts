import { describe, expect, it } from "vitest";
import { CHAT_ACTION_INTENTS, classifyChatAction, getChatActionTrainingSummary } from "../chat-action-model";

describe("local chat action model", () => {
  it.each([
    ["i want a flu shot next monday", "flu_shot"],
    ["for flushot", "flu_shot"],
    ["renew my perscription", "refill"],
    ["where is my package", "tracking"],
    ["move my rx from cvs", "transfer"],
    ["show me my current meds", "app"],
    ["add some vitamins from the shop", "otc_shop"],
    ["let me review my basket", "cart"],
    ["I am ready to pay for my order", "checkout"],
    ["I want to collect it at the pharmacy", "pickup"],
    ["send it to my home", "delivery_zones"],
    ["when are you open saturday", "hours"],
    ["what are your fees for dropping off my purchase", "delivery_cost"],
    ["which health plans are you in network with", "insurance_accepted"],
    ["can i leave my car nearby", "parking"],
    ["is anyone on your team bilingual", "languages"],
    ["can i use a debit card", "payment_methods"],
  ] as const)("classifies %s", (text, expected) => {
    const result = classifyChatAction(text);
    expect(result.intent).toBe(expected);
    expect(result.confident).toBe(true);
  });

  it("returns only an allowlisted action", () => {
    expect(CHAT_ACTION_INTENTS).toContain(classifyChatAction("anything at all").intent);
  });

  it("exposes a versioned training summary without patient data", () => {
    expect(getChatActionTrainingSummary()).toEqual({
      model: "concordia-char-ngram-v2",
       examples: 215,
      intents: 20,
    });
  });
});