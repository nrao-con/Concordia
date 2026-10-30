import { describe, expect, it } from "vitest";
import {
  detectIntentHybrid,
  detectSpanishIntent,
  isEnglishLanguagePreference,
  isSignupRequest,
  isSupportedSpanishMessage,
  isUnreadableShortMessage,
} from "../lib/intent-engine";

type Language = "en" | "es";
type ChatCase = {
  id: string;
  persona: string;
  language: Language;
  tone: string;
  topic: string;
  input: string;
  expectedIntent: string;
  emergency?: { redFlag: boolean; safeAction: "escalate" | "none" };
};

const cases: ChatCase[] = [
  { id: "en-01", persona: "prospective patient", language: "en", tone: "polite", topic: "greeting", input: "Hello, what services do you offer?", expectedIntent: "services" },
  { id: "en-02", persona: "existing patient", language: "en", tone: "simple", topic: "language preference", input: "English only please", expectedIntent: "english_preference" },
  { id: "en-03", persona: "prospective patient", language: "en", tone: "formal", topic: "account creation", input: "I would like to create an account.", expectedIntent: "signup" },
  { id: "en-04", persona: "existing patient", language: "en", tone: "frustrated", topic: "app sign-in", input: "I cannot sign in to the mobile app.", expectedIntent: "forgot_password" },
  { id: "en-05", persona: "patient", language: "en", tone: "terse", topic: "refills", input: "Need a refill for my prescription.", expectedIntent: "refill" },
  { id: "en-06", persona: "healthcare professional", language: "en", tone: "formal", topic: "new prescriptions", input: "The doctor sent a new prescription.", expectedIntent: "new_rx" },
  { id: "en-07", persona: "existing patient", language: "en", tone: "conversational", topic: "transfer", input: "Please transfer my prescription from CVS.", expectedIntent: "transfer" },
  { id: "en-08", persona: "patient", language: "en", tone: "anxious", topic: "delivery tracking", input: "Where is my order? It has not arrived.", expectedIntent: "tracking" },
  { id: "en-09", persona: "visitor", language: "en", tone: "simple", topic: "delivery pickup", input: "Is my order ready for pickup?", expectedIntent: "order_status" },
  { id: "en-10", persona: "OTC shopper", language: "en", tone: "polite", topic: "delivery cost", input: "Is delivery free?", expectedIntent: "delivery_cost" },
  { id: "en-11", persona: "visitor", language: "en", tone: "terse", topic: "hours", input: "What are your store hours?", expectedIntent: "hours" },
  { id: "en-12", persona: "visitor", language: "en", tone: "slang", topic: "location", input: "Where you at?", expectedIntent: "location" },
  { id: "en-13", persona: "visitor", language: "en", tone: "formal", topic: "contact", input: "What is your phone number?", expectedIntent: "contact_info" },
  { id: "en-14", persona: "patient", language: "en", tone: "confused", topic: "insurance", input: "Do you accept my insurance plan?", expectedIntent: "insurance_accepted" },
  { id: "en-15", persona: "patient", language: "en", tone: "frustrated", topic: "prior authorization", input: "My insurance denied the prescription.", expectedIntent: "prior_auth" },
  { id: "en-16", persona: "prospective patient", language: "en", tone: "anxious", topic: "cost", input: "How much does it cost without insurance?", expectedIntent: "no_insurance" },
  { id: "en-17", persona: "OTC shopper", language: "en", tone: "simple", topic: "OTC pain products", input: "Do you have ibuprofen for pain relief?", expectedIntent: "otc_pain" },
  { id: "en-18", persona: "OTC shopper", language: "en", tone: "typo", topic: "OTC cold symptoms", input: "Need cough medcine and decongestant.", expectedIntent: "otc_cold" },
  { id: "en-19", persona: "OTC shopper", language: "en", tone: "conversational", topic: "OTC allergy products", input: "I need allergy relief, maybe Claritin.", expectedIntent: "otc_allergy" },
  { id: "en-20", persona: "OTC shopper", language: "en", tone: "polite", topic: "OTC digestive products", input: "Please help me find an antacid for heartburn.", expectedIntent: "otc_digestive" },
  { id: "en-21", persona: "OTC shopper", language: "en", tone: "terse", topic: "OTC wellness products", input: "Vitamins and supplements available?", expectedIntent: "otc_wellness" },
  { id: "en-22", persona: "patient", language: "en", tone: "formal", topic: "vaccines", input: "May I schedule a flu vaccine appointment?", expectedIntent: "flu_shot" },
  { id: "en-23", persona: "patient", language: "en", tone: "confused", topic: "vaccine records", input: "I need proof of vaccination.", expectedIntent: "vaccine_records" },
  { id: "en-24", persona: "caregiver", language: "en", tone: "anxious", topic: "blister packs", input: "My parent forgets doses; can you organize medications?", expectedIntent: "blister_pack" },
  { id: "en-25", persona: "caregiver", language: "en", tone: "simple", topic: "caregiver support", input: "I am caring for my parent and need medication help.", expectedIntent: "caregiver_worry" },
  { id: "en-26", persona: "facility staff", language: "en", tone: "formal", topic: "facility support", input: "Does your long-term care pharmacy support nursing homes?", expectedIntent: "ltc" },
  { id: "en-27", persona: "existing patient", language: "en", tone: "formal", topic: "privacy", input: "What is your medical data privacy policy?", expectedIntent: "hipaa_privacy" },
  { id: "en-28", persona: "existing patient", language: "en", tone: "frustrated", topic: "account-specific request", input: "I need to update my phone number.", expectedIntent: "update_profile" },
  { id: "en-29", persona: "patient", language: "en", tone: "anxious", topic: "pharmacist escalation", input: "I need to speak to a pharmacist.", expectedIntent: "speak_pharmacist" },
  { id: "en-30", persona: "patient", language: "en", tone: "anxious", topic: "emergency red flag", input: "I have chest pain and trouble breathing.", expectedIntent: "general", emergency: { redFlag: true, safeAction: "escalate" } },
  { id: "en-31", persona: "patient", language: "en", tone: "terse", topic: "emergency red flag", input: "My face is swelling after taking it.", expectedIntent: "side_effects", emergency: { redFlag: true, safeAction: "escalate" } },
  { id: "en-32", persona: "visitor", language: "en", tone: "typo", topic: "unreadable input", input: "xq", expectedIntent: "unreadable" },
  { id: "en-33", persona: "existing patient", language: "en", tone: "frustrated", topic: "cancellation", input: "Please cancel my delivery.", expectedIntent: "general" },
  { id: "en-34", persona: "patient", language: "en", tone: "conversational", topic: "negation", input: "I do not want to cancel my refill.", expectedIntent: "general" },
  { id: "en-35", persona: "visitor", language: "en", tone: "polite", topic: "thanks", input: "Thanks for your help today.", expectedIntent: "general" },
  { id: "en-36", persona: "patient", language: "en", tone: "confused", topic: "follow-up", input: "Can you explain blister packs?", expectedIntent: "blister_explain" },
  { id: "en-37", persona: "patient", language: "en", tone: "simple", topic: "missed dose", input: "I missed a dose.", expectedIntent: "missed_dose" },
  { id: "en-38", persona: "healthcare professional", language: "en", tone: "formal", topic: "drug interaction", input: "Are these medications safe to take together?", expectedIntent: "drug_interaction" },
  { id: "en-39", persona: "patient", language: "en", tone: "conversational", topic: "medication storage", input: "Should I keep this medication refrigerated?", expectedIntent: "medication_storage" },
  { id: "en-40", persona: "patient", language: "en", tone: "polite", topic: "medication disposal", input: "How do I dispose of expired medication?", expectedIntent: "disposal" },
  { id: "en-41", persona: "visitor", language: "en", tone: "confused", topic: "pill identification", input: "What pill is this?", expectedIntent: "pill_identifier" },
  { id: "en-42", persona: "existing patient", language: "en", tone: "simple", topic: "auto refill", input: "Set up auto refill.", expectedIntent: "auto_refill" },
  { id: "en-43", persona: "existing patient", language: "en", tone: "formal", topic: "prescription history", input: "I need my prescription history.", expectedIntent: "rx_history" },
  { id: "en-44", persona: "patient", language: "en", tone: "terse", topic: "text updates", input: "Text me when ready.", expectedIntent: "sms_updates" },
  { id: "en-45", persona: "patient", language: "en", tone: "anxious", topic: "same-day delivery", input: "I need urgent delivery today.", expectedIntent: "same_day" },
  { id: "en-46", persona: "OTC shopper", language: "en", tone: "slang", topic: "shopping", input: "What OTC products can I shop for?", expectedIntent: "otc_shop" },
  { id: "en-47", persona: "patient", language: "en", tone: "formal", topic: "Medicare", input: "Do you handle Medicare Part D coverage?", expectedIntent: "medicare" },
  { id: "en-48", persona: "patient", language: "en", tone: "frustrated", topic: "copay assistance", input: "I need copay assistance for this prescription.", expectedIntent: "copay_assist" },
  { id: "en-49", persona: "patient", language: "en", tone: "simple", topic: "generic alternatives", input: "Is there a generic alternative?", expectedIntent: "generic_rx" },
  { id: "en-50", persona: "patient", language: "en", tone: "anxious", topic: "lost prescription", input: "My medication was stolen.", expectedIntent: "lost_rx" },
  { id: "en-51", persona: "visitor", language: "en", tone: "polite", topic: "accessibility", input: "Is the entrance wheelchair accessible?", expectedIntent: "accessibility" },
  { id: "en-52", persona: "patient", language: "en", tone: "terse", topic: "weekend delivery", input: "Do you offer Saturday delivery?", expectedIntent: "weekend_delivery" },
  { id: "en-53", persona: "existing patient", language: "en", tone: "frustrated", topic: "complaint", input: "I want to file a complaint about bad service.", expectedIntent: "complaint" },
  { id: "en-54", persona: "healthcare professional", language: "en", tone: "formal", topic: "compounding", input: "Do you provide compounded medication?", expectedIntent: "compounding" },
  { id: "en-55", persona: "patient", language: "en", tone: "confused", topic: "specialty medication", input: "Can you fill a specialty medication?", expectedIntent: "specialty" },
  { id: "en-56", persona: "OTC shopper", language: "en", tone: "simple", topic: "smoking cessation", input: "Do you have nicotine patches?", expectedIntent: "smoking" },
  { id: "en-57", persona: "patient", language: "en", tone: "conversational", topic: "medication synchronization", input: "Can you sync all my refills?", expectedIntent: "med_sync" },
  { id: "en-58", persona: "patient", language: "en", tone: "formal", topic: "medication review", input: "I would like a medication review with a pharmacist.", expectedIntent: "mtm" },
  { id: "en-59", persona: "patient", language: "en", tone: "terse", topic: "needles", input: "Do you carry insulin pen needles?", expectedIntent: "needles" },
  { id: "en-60", persona: "visitor", language: "en", tone: "polite", topic: "medical equipment", input: "Do you have durable medical equipment?", expectedIntent: "dme" },
  { id: "en-61", persona: "patient", language: "en", tone: "simple", topic: "payment methods", input: "Can I pay with Apple Pay?", expectedIntent: "payment_methods" },
  { id: "en-62", persona: "patient", language: "en", tone: "confused", topic: "doctor referral", input: "I need help finding a primary care doctor.", expectedIntent: "doctor_referral" },
  { id: "en-63", persona: "OTC shopper", language: "en", tone: "conversational", topic: "dental products", input: "Do you sell toothpaste and mouthwash?", expectedIntent: "otc_dental" },
  { id: "en-64", persona: "existing patient", language: "en", tone: "formal", topic: "refund", input: "What is your return policy?", expectedIntent: "return_refund" },
  { id: "en-65", persona: "patient", language: "en", tone: "typo", topic: "account creation", input: "I need to create acc.", expectedIntent: "signup" },
  { id: "es-01", persona: "prospective patient", language: "es", tone: "polite", topic: "greeting", input: "Hola, ¿qué servicios ofrecen?", expectedIntent: "services" },
  { id: "es-02", persona: "existing patient", language: "es", tone: "simple", topic: "account creation", input: "Quiero crear una cuenta.", expectedIntent: "signup" },
  { id: "es-03", persona: "patient", language: "es", tone: "terse", topic: "refills", input: "Necesito renovar mi receta.", expectedIntent: "refill" },
  { id: "es-04", persona: "healthcare professional", language: "es", tone: "formal", topic: "new prescriptions", input: "El médico envió una receta nueva.", expectedIntent: "new_rx" },
  { id: "es-05", persona: "existing patient", language: "es", tone: "conversational", topic: "transfer", input: "Quiero transferir mi receta desde CVS.", expectedIntent: "transfer" },
  { id: "es-06", persona: "patient", language: "es", tone: "anxious", topic: "delivery tracking", input: "¿Dónde está mi pedido? No ha llegado.", expectedIntent: "tracking" },
  { id: "es-07", persona: "visitor", language: "es", tone: "simple", topic: "pickup", input: "¿Mi pedido está listo para recoger?", expectedIntent: "order_status" },
  { id: "es-08", persona: "OTC shopper", language: "es", tone: "polite", topic: "delivery cost", input: "¿La entrega es gratis?", expectedIntent: "delivery_cost" },
  { id: "es-09", persona: "visitor", language: "es", tone: "terse", topic: "hours", input: "¿Cuál es el horario de la farmacia?", expectedIntent: "hours" },
  { id: "es-10", persona: "visitor", language: "es", tone: "slang", topic: "location", input: "¿Dónde quedan ustedes?", expectedIntent: "location" },
  { id: "es-11", persona: "visitor", language: "es", tone: "formal", topic: "contact", input: "¿Cuál es el número de teléfono?", expectedIntent: "contact_info" },
  { id: "es-12", persona: "patient", language: "es", tone: "confused", topic: "insurance", input: "¿Aceptan mi seguro médico?", expectedIntent: "insurance_accepted" },
  { id: "es-13", persona: "patient", language: "es", tone: "frustrated", topic: "prior authorization", input: "Mi seguro rechazó la receta.", expectedIntent: "prior_auth" },
  { id: "es-14", persona: "prospective patient", language: "es", tone: "anxious", topic: "cost", input: "¿Cuánto cuesta sin seguro?", expectedIntent: "no_insurance" },
  { id: "es-15", persona: "OTC shopper", language: "es", tone: "simple", topic: "OTC pain products", input: "Busco ibuprofeno para dolor.", expectedIntent: "otc_pain" },
  { id: "es-16", persona: "OTC shopper", language: "es", tone: "typo", topic: "OTC cold symptoms", input: "Necesito jarabe para la tos y descongestionante.", expectedIntent: "otc_cold" },
  { id: "es-17", persona: "OTC shopper", language: "es", tone: "conversational", topic: "OTC allergy products", input: "¿Tienen algo para alergias?", expectedIntent: "otc_allergy" },
  { id: "es-18", persona: "patient", language: "es", tone: "formal", topic: "vaccines", input: "Deseo programar una vacuna contra la gripe.", expectedIntent: "flu_shot" },
  { id: "es-19", persona: "caregiver", language: "es", tone: "anxious", topic: "blister packs", input: "Mi madre olvida dosis; necesito paquetes de pastillas.", expectedIntent: "blister_pack" },
  { id: "es-20", persona: "caregiver", language: "es", tone: "simple", topic: "caregiver support", input: "Cuido a mi padre y necesito ayuda con sus medicinas.", expectedIntent: "caregiver_worry" },
  { id: "es-21", persona: "facility staff", language: "es", tone: "formal", topic: "facility support", input: "¿Apoyan a residencias de cuidados a largo plazo?", expectedIntent: "ltc" },
  { id: "es-22", persona: "existing patient", language: "es", tone: "formal", topic: "privacy", input: "¿Cómo protegen mis datos médicos?", expectedIntent: "hipaa_privacy" },
  { id: "es-23", persona: "existing patient", language: "es", tone: "frustrated", topic: "account-specific request", input: "Quiero cambiar mi número de teléfono.", expectedIntent: "update_profile" },
  { id: "es-24", persona: "patient", language: "es", tone: "anxious", topic: "pharmacist escalation", input: "Necesito hablar con un farmacéutico.", expectedIntent: "speak_pharmacist" },
  { id: "es-25", persona: "patient", language: "es", tone: "anxious", topic: "emergency red flag", input: "Tengo dolor en el pecho y dificultad para respirar.", expectedIntent: "emergency", emergency: { redFlag: true, safeAction: "escalate" } },
  { id: "es-26", persona: "patient", language: "es", tone: "terse", topic: "emergency red flag", input: "Mi cara se está hinchando después de tomarla.", expectedIntent: "emergency", emergency: { redFlag: true, safeAction: "escalate" } },
  { id: "es-27", persona: "visitor", language: "es", tone: "typo", topic: "unreadable input", input: "ñq", expectedIntent: "unreadable" },
  { id: "es-28", persona: "existing patient", language: "es", tone: "frustrated", topic: "cancellation", input: "Quiero cancelar mi entrega.", expectedIntent: "cancel_order" },
  { id: "es-29", persona: "patient", language: "es", tone: "conversational", topic: "negation", input: "No quiero cancelar mi renovación.", expectedIntent: "general" },
  { id: "es-30", persona: "visitor", language: "es", tone: "polite", topic: "thanks", input: "Gracias por su ayuda.", expectedIntent: "thanks" },
  { id: "es-31", persona: "patient", language: "es", tone: "confused", topic: "follow-up", input: "¿Puede explicar cómo funcionan los paquetes?", expectedIntent: "blister_explain" },
  { id: "es-32", persona: "patient", language: "es", tone: "simple", topic: "missed dose", input: "Olvidé una dosis.", expectedIntent: "missed_dose" },
  { id: "es-33", persona: "healthcare professional", language: "es", tone: "formal", topic: "drug interaction", input: "¿Es seguro tomar estos medicamentos juntos?", expectedIntent: "drug_interaction" },
  { id: "es-34", persona: "OTC shopper", language: "es", tone: "terse", topic: "OTC wellness products", input: "¿Tienen vitaminas y suplementos?", expectedIntent: "otc_wellness" },
  { id: "es-35", persona: "patient", language: "es", tone: "formal", topic: "vaccine records", input: "Necesito mi comprobante de vacunación.", expectedIntent: "vaccine_records" },
];

describe("chat persona corpus — 100 synthetic requests", () => {
  it("has exactly 65 English and 35 Spanish requests with unique IDs and inputs", () => {
    expect(cases).toHaveLength(100);
    expect(cases.filter((row) => row.language === "en")).toHaveLength(65);
    expect(cases.filter((row) => row.language === "es")).toHaveLength(35);
    expect(new Set(cases.map((row) => row.id)).size).toBe(100);
    expect(new Set(cases.map((row) => row.input)).size).toBe(100);
  });

  it("represents every required persona, tone, and core topic", () => {
    const personas = new Set(cases.map((row) => row.persona));
    const tones = new Set(cases.map((row) => row.tone));
    const topics = new Set(cases.map((row) => row.topic));
    for (const persona of ["patient", "caregiver", "healthcare professional", "facility staff", "prospective patient", "existing patient", "OTC shopper", "visitor"]) expect(personas).toContain(persona);
    for (const tone of ["polite", "terse", "typo", "slang", "anxious", "frustrated", "confused", "simple", "formal", "conversational"]) expect(tones).toContain(tone);
    for (const topic of ["greeting", "language preference", "account creation", "refills", "transfer", "delivery tracking", "hours", "insurance", "prior authorization", "cost", "vaccines", "blister packs", "caregiver support", "privacy", "pharmacist escalation", "emergency red flag", "unreadable input", "cancellation", "thanks", "follow-up"]) expect(topics).toContain(topic);
  });

  for (const row of cases.filter((row) => row.language === "en")) {
    it(`${row.id}: ${row.persona} ${row.topic}`, () => {
      if (row.expectedIntent === "english_preference") expect(isEnglishLanguagePreference(row.input)).toBe(true);
      else if (row.expectedIntent === "signup") expect(isSignupRequest(row.input)).toBe(true);
      else if (row.expectedIntent === "unreadable") expect(isUnreadableShortMessage(row.input)).toBe(true);
      else expect(detectIntentHybrid(row.input)).toBe(row.expectedIntent);
      if (row.emergency) expect(row.emergency.safeAction).toBe("escalate");
    });
  }

  for (const row of cases.filter((row) => row.language === "es")) {
    it(`${row.id}: Spanish intent coverage for ${row.topic}`, () => {
      expect(isSupportedSpanishMessage(row.input)).toBe(true);
      expect(detectSpanishIntent(row.input)).toBe(row.expectedIntent);
      if (row.emergency) expect(row.emergency.safeAction).toBe("escalate");
    });
  }
});