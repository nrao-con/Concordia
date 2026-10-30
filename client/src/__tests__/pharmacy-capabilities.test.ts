import { describe, expect, it } from "vitest";
import { getCapabilityScopeResponse, PHARMACY_SCOPE_RESPONSE } from "../lib/pharmacy-capabilities";

describe("pharmacy capability knowledge", () => {
  it.each([
    "what all do you do",
    "what services do you offer",
    "how can you help me",
    "tell me everything you do",
  ])("returns the verified full scope for %s", (message) => {
    expect(getCapabilityScopeResponse(message)).toBe(PHARMACY_SCOPE_RESPONSE);
  });

  it.each([
    ["Can you help with patient documents?", "securely upload"],
    ["Do you have a care journal?", "Care Navigator"],
    ["Can a caregiver manage my mom's prescriptions?", "authorized caregiver"],
    ["Do you provide nursing home pharmacy services?", "long-term-care"],
    ["Can you help with specialty medication?", "specialty-medication"],
    ["Can you handle a prior authorization?", "prior-authorization"],
    ["Can you help me find a doctor?", "doctor directory"],
    ["Do you offer flu shots?", "flu-shot"],
    ["Can you organize my pills in blister packs?", "blister packaging"],
    ["Can you transfer my prescription?", "transfer"],
    ["Can you help with refills?", "eligible refills"],
    ["Do you offer delivery?", "delivery and pickup"],
    ["Can you check what OTC products are in stock?", "live catalog"],
    ["Can you help with insurance coverage?", "insurance-assistance"],
    ["Do you have a rewards program?", "rewards and points"],
    ["Can I talk to a pharmacist?", "718"],
  ])("answers supported capability question: %s", (message, expected) => {
    expect(getCapabilityScopeResponse(message)).toContain(expected);
  });

  it.each([
    "write my college essay",
    "book an airline ticket",
    "what is the capital of France",
    "diagnose this rash",
  ])("does not invent an unrelated capability for %s", (message) => {
    expect(getCapabilityScopeResponse(message)).toBeNull();
  });
});