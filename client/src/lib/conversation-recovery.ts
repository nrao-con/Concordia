import type { PendingClarification } from "./conversation-followups";

export type RecoveryLanguage = "en" | "es" | "mixed";

const CLARIFICATION_PROMPTS: Record<PendingClarification, { en: string; es: string }> = {
  medication_kind: {
    en: "Is this a refill, a new prescription, or a medication safety question?",
    es: "¿Es un resurtido, una receta nueva o una pregunta sobre la seguridad de un medicamento?",
  },
  transfer_direction: {
    en: "Are you moving prescriptions to Concordia, or from Concordia to another pharmacy?",
    es: "¿Desea transferir recetas a Concordia o de Concordia a otra farmacia?",
  },
};

function languageKey(language: RecoveryLanguage): "en" | "es" {
  return language === "en" ? "en" : "es";
}

export function getClarificationReminder(
  pending: PendingClarification | null,
  language: RecoveryLanguage,
): string | null {
  if (!pending) return null;
  return CLARIFICATION_PROMPTS[pending][languageKey(language)];
}

export function getVagueConversationResponse(
  pending: PendingClarification | null,
  activeIntentLabel: string | null,
  language: RecoveryLanguage,
): string {
  const clarification = getClarificationReminder(pending, language);
  if (clarification) return clarification;

  if (activeIntentLabel) {
    return language === "en"
      ? `We can continue with your ${activeIntentLabel}. What would you like to do next?`
      : `Podemos continuar con su solicitud de ${activeIntentLabel}. ¿Qué desea hacer ahora?`;
  }

  return language === "en"
    ? "What do you need help with: a prescription, delivery, an OTC product, or contacting the pharmacy?"
    : "¿Con qué necesita ayuda: una receta, entrega, un producto sin receta o contactar a la farmacia?";
}

export function getContextRecoveryResponse(
  pending: PendingClarification | null,
  activeIntentLabel: string | null,
  language: RecoveryLanguage,
  text = "",
): string {
  const acknowledgement = /^(?:ok(?:ay)?|sure|yes|thanks|thank you|got it|all right|si|sí|gracias|vale|entendido)[.! ]*$/i.test(text.trim());
  const clarification = getClarificationReminder(pending, language);
  if (clarification) {
    if (acknowledgement) {
      return language === "en" ? `Got it. ${clarification}` : `Entendido. ${clarification}`;
    }
    return language === "en"
      ? `I didn't understand that answer. ${clarification}`
      : `No entendí esa respuesta. ${clarification}`;
  }

  if (activeIntentLabel) {
    if (acknowledgement) {
      return language === "en"
        ? `Got it. We can continue with your ${activeIntentLabel} request. What would you like to do next?`
        : `Entendido. Podemos continuar con su solicitud de ${activeIntentLabel}. ¿Qué desea hacer ahora?`;
    }
    return language === "en"
      ? `I didn't understand that detail, but I kept your ${activeIntentLabel} request. Please say what you want to do next, or say "start over."`
      : `No entendí ese detalle, pero conservé su solicitud de ${activeIntentLabel}. Diga qué desea hacer ahora o escriba "comenzar de nuevo".`;
  }

  return language === "en"
    ? "I didn't understand that yet. I can help with prescriptions, delivery, OTC products, store information, or contacting pharmacy staff."
    : "Todavía no entendí. Puedo ayudar con recetas, entrega, productos sin receta, información de la farmacia o contacto con el personal.";
}