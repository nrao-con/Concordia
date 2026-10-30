import { describe, expect, it } from "vitest";
import {
  getClarificationReminder,
  getContextRecoveryResponse,
  getVagueConversationResponse,
} from "../lib/conversation-recovery";

describe("conversation recovery", () => {
  it("repeats the specific unanswered question instead of a generic fallback", () => {
    expect(getContextRecoveryResponse("medication_kind", "medication", "en")).toContain(
      "refill, a new prescription, or a medication safety question",
    );
    expect(getContextRecoveryResponse("transfer_direction", "transfer", "es")).toContain(
      "transferir recetas a Concordia",
    );
  });

  it("keeps the active topic when no clarification is pending", () => {
    expect(getContextRecoveryResponse(null, "delivery", "en")).toBe(
      'I didn\'t understand that detail, but I kept your delivery request. Please say what you want to do next, or say "start over."',
    );
  });

  it("acknowledges short replies without discarding the pending question", () => {
    expect(getContextRecoveryResponse("medication_kind", "medication", "en", "okay")).toBe(
      "Got it. Is this a refill, a new prescription, or a medication safety question?",
    );
    expect(getContextRecoveryResponse("transfer_direction", "transfer", "es", "sí")).toContain(
      "Entendido. ¿Desea transferir recetas",
    );
    expect(getContextRecoveryResponse(null, "delivery", "en", "thanks")).toContain(
      "We can continue with your delivery request",
    );
    expect(getContextRecoveryResponse(null, "delivery", "en", "yes I need medicine")).toContain(
      "I didn't understand that detail",
    );
  });

  it("uses a concise capability question when there is no context", () => {
    expect(getVagueConversationResponse(null, null, "en")).toContain(
      "a prescription, delivery, an OTC product",
    );
  });

  it("provides stable bilingual clarification prompts", () => {
    expect(getClarificationReminder("medication_kind", "mixed")).toContain("resurtido");
    expect(getClarificationReminder(null, "en")).toBeNull();
  });
});