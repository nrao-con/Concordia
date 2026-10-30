import { describe, expect, it } from "vitest";
import {
  resolveConversationFollowUpState,
  resolvePendingClarification,
} from "../lib/conversation-followups";

describe("conversation follow-up resolution", () => {
  it.each([
    ["refill", "I need to refill a prescription"],
    ["the new one", "I need help with a new prescription"],
    ["la nueva", "I need help with a new prescription"],
    ["side effects", "I have a medication side effect or interaction question"],
    ["efectos secundarios", "I have a medication side effect or interaction question"],
    ["a pharmacist", "I want to speak to a pharmacist"],
  ])("resolves medication answer %s", (reply, canonicalText) => {
    expect(resolvePendingClarification("medication_kind", reply)).toEqual({ canonicalText });
  });

  it.each([
    ["bring them here", "I want to transfer my prescriptions to Concordia from my current pharmacy"],
    ["move it to CVS", "I want to transfer my prescriptions away from Concordia to a different pharmacy"],
    ["transfer out to Walgreens", "I want to transfer my prescriptions away from Concordia to a different pharmacy"],
  ])("resolves transfer answer %s", (reply, canonicalText) => {
    expect(resolvePendingClarification("transfer_direction", reply)).toEqual({ canonicalText });
  });

  it("does not force unrelated messages into the pending question", () => {
    expect(resolvePendingClarification("medication_kind", "What are your hours?")).toBeNull();
    expect(resolvePendingClarification("transfer_direction", "I need delivery")).toBeNull();
    expect(resolvePendingClarification(null, "refill")).toBeNull();
  });

  it("clears a pending question only after the patient answers it", () => {
    expect(resolveConversationFollowUpState("medication_kind", "refill")).toEqual({
      resolution: { canonicalText: "I need to refill a prescription" },
      pending: null,
    });
    expect(resolveConversationFollowUpState("transfer_direction", "bring them here")).toEqual({
      resolution: {
        canonicalText: "I want to transfer my prescriptions to Concordia from my current pharmacy",
      },
      pending: null,
    });
  });

  it("preserves the pending question across an unrelated interruption", () => {
    expect(resolveConversationFollowUpState("medication_kind", "What are your hours?")).toEqual({
      resolution: null,
      pending: "medication_kind",
    });
    expect(resolveConversationFollowUpState("transfer_direction", "Thanks")).toEqual({
      resolution: null,
      pending: "transfer_direction",
    });
  });
});