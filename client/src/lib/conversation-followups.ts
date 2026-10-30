export type PendingClarification = "medication_kind" | "transfer_direction";

export interface ConversationFollowUp {
  canonicalText: string;
}

export interface ConversationFollowUpState {
  resolution: ConversationFollowUp | null;
  pending: PendingClarification | null;
}

/**
 * Turns short, context-dependent replies into the complete request the
 * existing deterministic router already understands. The context is
 * intentionally narrow and one-turn only; it never grants access or performs
 * an action on its own.
 */
export function resolvePendingClarification(
  pending: PendingClarification | null,
  text: string,
): ConversationFollowUp | null {
  if (!pending) return null;

  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (pending === "medication_kind") {
    if (
      /\b(?:refill|renew|renewal|resurtir|resurtido|renovar|renovaci[oó]n)\b/.test(normalized) ||
      (/\b(?:again|more)\b/.test(normalized) && /\b(?:meds?|medicine|medication|prescription|rx)\b/.test(normalized))
    ) {
      return { canonicalText: "I need to refill a prescription" };
    }
    if (
      /\b(?:new|another|different|nuevo|nueva|otro|otra)\b/.test(normalized) &&
      /\b(?:one|prescription|rx|script|medication|medicine|meds?)\b/.test(normalized)
    ) {
      return { canonicalText: "I need help with a new prescription" };
    }
    if (/^(?:the|la|el|una|un)?\s*(?:new|nuevo|nueva|another|otro|otra)(?:\s+one)?$/.test(normalized)) {
      return { canonicalText: "I need help with a new prescription" };
    }
    if (
      /\b(?:side effects?|reaction|interaction|interact|mix|safe together|efectos secundarios|reacción|reaccion|interacción|interaccion)\b/.test(normalized)
    ) {
      return { canonicalText: "I have a medication side effect or interaction question" };
    }
    if (/\b(?:pharmacist|staff|someone|person|human|call|farmacéutico|farmaceutico|personal)\b/.test(normalized)) {
      return { canonicalText: "I want to speak to a pharmacist" };
    }
  }

  if (pending === "transfer_direction") {
    if (
      /\b(?:away|out|elsewhere|another pharmacy|different pharmacy|cvs|walgreens|rite aid|leave|otra farmacia|otra|fuera)\b/.test(normalized) &&
      /\b(?:transfer|move|switch|send|take|prescription|rx|meds?|pharmacy|here|there)\b/.test(normalized)
    ) {
      return { canonicalText: "I want to transfer my prescriptions away from Concordia to a different pharmacy" };
    }
    if (
      /\b(?:here|concordia|you|us|this pharmacy|current pharmacy|aquí|aqui|esta farmacia)\b/.test(normalized) &&
      /\b(?:transfer|move|switch|bring|send|prescription|rx|meds?|pharmacy)\b/.test(normalized)
    ) {
      return { canonicalText: "I want to transfer my prescriptions to Concordia from my current pharmacy" };
    }
    if (/\b(?:in|to)\b/.test(normalized) && /\b(?:cvs|walgreens|rite aid|another pharmacy|different pharmacy)\b/.test(normalized)) {
      return { canonicalText: "I want to transfer my prescriptions away from Concordia to a different pharmacy" };
    }
  }

  return null;
}

/**
 * Keeps an unanswered clarification active across a brief interruption, but
 * clears it as soon as the patient supplies a recognized answer.
 */
export function resolveConversationFollowUpState(
  pending: PendingClarification | null,
  text: string,
): ConversationFollowUpState {
  const resolution = resolvePendingClarification(pending, text);
  return {
    resolution,
    pending: resolution ? null : pending,
  };
}