import { describe, expect, it } from "vitest";
import { shouldConsultLocalClassifier } from "../lib/chat-intent-guard";
import { detectCompoundIntent, isEmergencySafetySignal } from "../lib/intent-engine";

describe("chat widget safety routing", () => {
  it.each([
    ["missed_dose", "I missed a dose"],
    ["drug_interaction", "Can these medications interact?"],
    ["side_effects", "I am having side effects from my medication"],
    ["controlled_substance", "Can you refill oxycodone?"],
    ["refill", "I need a refill"],
  ])("keeps deterministic %s authoritative", (intent, text) => {
    expect(shouldConsultLocalClassifier(intent, text, false)).toBe(false);
  });

  it("allows local fallback only when deterministic routing returns general", () => {
    expect(shouldConsultLocalClassifier("general", "neds my monthly script", false)).toBe(true);
    expect(shouldConsultLocalClassifier("general", "do not refill it", false)).toBe(false);
    expect(shouldConsultLocalClassifier("general", "necesito ayuda", true)).toBe(false);
  });

  it("detects transfer and shop requests before single-intent fallback", () => {
    expect(detectCompoundIntent("Please transfer my prescriptions and let me browse OTC products")).toBe("transfer_and_shop");
    expect(detectCompoundIntent("Move my meds here, and I want to buy store items")).toBe("transfer_and_shop");
    expect(detectCompoundIntent("I need to transfer my prescriptions")).toBeNull();
    expect(detectCompoundIntent("I want to browse vitamins")).toBeNull();
  });

  it.each([
    "I accidentally took a double dose",
    "My brother passed out and is bleeding profusely",
    "I think this is anaphylaxis",
    "Mi hijo tomó veneno",
    "Tengo pensamientos de suicidio",
    "I took the whole bottle of pills",
  ])("escalates prototype emergency case: %s", (text) => {
    expect(isEmergencySafetySignal(text)).toBe(true);
  });

  it.each([
    "Do you have emergency contraception?",
    "Can you arrange urgent delivery?",
    "I need an emergency refill",
  ])("does not escalate benign urgent wording: %s", (text) => {
    expect(isEmergencySafetySignal(text)).toBe(false);
  });
});
