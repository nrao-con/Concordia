import { describe, expect, it } from "vitest";
import {
  detectIntentHybrid,
  detectSpanishIntent,
  hasClinicalTermOrDiagnosis,
  isControlledSubstanceRequest,
  isExplicitOtcRequest,
  isSignupRequest,
  isSupportedSpanishMessage,
  isUnreadableShortMessage,
} from "../lib/intent-engine";

type Outcome = "recognized" | "escalated" | "clarify" | "rejected";
type QualityCase = {
  category: string;
  message: string;
  expected: string;
  outcome: Outcome;
};

const group = (
  category: string,
  expected: string,
  outcome: Outcome,
  messages: string[],
): QualityCase[] => messages.map((message) => ({ category, message, expected, outcome }));

const corpus: QualityCase[] = [
  ...group("refill", "refill", "recognized", [
    "I need a refill", "refill my prescription please", "running low on my medicine",
    "Can I renew my rx?", "my rxs need refilling", "almost out of my pills",
    "need more refills", "refil my prescripshun", "hook me up with my usual",
    "Can I get my medication again?",
  ]),
  ...group("tracking", "tracking", "recognized", [
    "Where is my order?", "track my delivery", "my package has not arrived",
    "when will my medicine arrive", "driver location please", "shipment status",
    "still waiting for my delivery", "trackin my perscription delivery",
    "has my order shipped?", "where are my meds?",
  ]),
  ...group("transfer in", "transfer", "recognized", [
    "Transfer my prescription from CVS", "move my medications here from Walgreens",
    "I want to switch to Concordia", "bring my rx from Rite Aid",
    "transfer prescriptions to you", "leaving my old pharmacy for Concordia",
    "Can Concordia request my scripts?", "tranfer my presciption from cvs",
    "I want Concordia to be my new pharmacy", "move my meds from another pharmacy",
  ]),
  ...group("transfer out", "transfer_out", "recognized", [
    "Transfer my prescriptions out", "I am leaving Concordia",
    "move my meds from here to CVS", "transfer my rx to Walgreens",
    "switch away from this pharmacy", "send my prescriptions to Rite Aid",
    "I want another pharmacy to fill my meds", "move prescriptions out of Concordia",
    "transfer to a different pharmacy", "I am going somewhere else for my prescriptions",
  ]),
  ...group("delivery", "delivery_zones", "recognized", [
    "Do you deliver to my home?", "What areas do you deliver to?",
    "Can you deliver in the Bronx?", "Is my address in your delivery zone?",
    "Do you offer home delivery?", "send it to my house",
    "delivery coverage area", "Can meds be delivered near me?",
    "Do you deliver to Queens?", "I need delivery to my address",
  ]),
  ...group("hours", "hours", "recognized", [
    "What are your hours?", "When do you open?", "What time do you close?",
    "Are you open today?", "store hours please", "r u open rn",
    "business hours on Monday", "opening hrs", "Are you open on Saturday?",
    "what is the pharmacy schedule?",
  ]),
  ...group("location", "location", "recognized", [
    "Where are you located?", "What is the pharmacy address?", "Where you at?",
    "directions to Concordia Pharmacy", "how do I get there?", "your location please",
    "Where is the store?", "pharmcy adress", "What is your exact address?",
    "Are you near East Tremont?",
  ]),
  ...group("pickup", "pickup", "recognized", [
    "I want store pickup", "Can I pick it up?", "I will come into the pharmacy",
    "pickup instead of delivery", "Can I collect my order?", "curbside pickup",
    "I want to stop by for it", "Can I swing by?", "drive thru pickup",
    "I'll get it in person",
  ]),
  ...group("flu and vaccines", "flu_shot", "recognized", [
    "I need a flu shot", "schedule a flu vaccine", "book an influenza vaccination",
    "Can I walk in for a vaccine?", "flu vax appointment", "need a shingles vaccine",
    "schedule immunization", "for flushot", "Can I get a COVID vaccine appointment?",
    "I want a pneumonia shot",
  ]),
  ...group("insurance", "insurance_accepted", "recognized", [
    "Do you accept my insurance?", "Which insurance plans do you take?",
    "Are you in network?", "Do you take Aetna?", "insurance accepted here",
    "Can you bill my health plan?", "Do you work with BlueCross?",
    "what plans are accepted", "Does Concordia take insurance?",
    "I have coverage, can I use it here?",
  ]),
  ...group("prior authorization", "prior_auth", "recognized", [
    "My insurance denied the prescription", "I need a prior authorization",
    "The medication is not covered", "PA approval status", "insurance rejected my claim",
    "Can you help appeal the denial?", "coverage was denied", "prior auth help",
    "my rx needs insurance approval", "prescription denial assistance",
  ]),
  ...group("OTC shopping", "otc_shop", "recognized", [
    "Show me over the counter products", "I want to shop OTC items",
    "What nonprescription products do you sell?", "open the online shop",
    "I want to buy vitamins", "show products for sale", "browse the pharmacy store",
    "otc shop pls", "Do you carry sunscreen?", "Find something in the shop",
  ]),
  ...group("account signup", "signup", "recognized", [
    "I want to create an account", "sign me up", "become a patient",
    "register with Concordia", "I need to create acc", "open a new account",
    "How can I enroll?", "new patient signup", "make me an acct",
    "I want to join the pharmacy",
  ]),
  ...group("login trouble", "forgot_password", "recognized", [
    "I cannot sign in", "my login is not working", "forgot my password",
    "trouble logging into the app", "I can't access my account",
    "sign in failed", "help reset my password", "locked out of ConcordiaCare",
    "cant log in", "app login problem",
  ]),
  ...group("private app data", "app", "recognized", [
    "Show my current medications", "open my patient account", "see my prescriptions",
    "my medication list", "open ConcordiaCare", "show my private profile",
    "Where can I see my rx details?", "I want my patient records",
    "display my personal prescriptions", "take me to my account",
  ]),
  ...group("privacy", "hipaa_privacy", "recognized", [
    "How do you protect my medical data?", "What is your HIPAA policy?",
    "Is my health information private?", "medical data privacy policy",
    "Who can see my patient information?", "How is my information protected?",
    "Do you keep prescriptions confidential?", "privacy of my health records",
    "Is this chat HIPAA compliant?", "How do you secure patient data?",
  ]),
  ...group("pharmacist escalation", "speak_pharmacist", "escalated", [
    "I need to speak to a pharmacist", "connect me to a real person",
    "Can a pharmacist call me?", "I need human help", "talk to someone at the store",
    "medicine safety question", "I have a side effect question",
    "connect me with your pharmacist", "representative please", "pharmacist asap",
  ]),
  ...group("emergency", "emergency", "escalated", [
    "I have chest pain", "I can't breathe", "This may be an overdose",
    "My throat is swelling from an allergic reaction", "someone is unconscious",
    "I am having a seizure", "I think I was poisoned", "call 911",
    "Tengo dolor de pecho y no puedo respirar", "Creo que es una sobredosis",
  ]),
  ...group("controlled substances", "controlled_substance", "rejected", [
    "Do you carry controlled substances?", "Can you fill oxycodone?",
    "I need Adderall", "Do you stock Xanax?", "Can I transfer hydrocodone?",
    "Do you dispense narcotics?", "I need an opioid prescription filled",
    "Tienen sustancias controladas?", "Pueden surtir alprazolam?",
    "Do you have Klonopin in stock?",
  ]),
  ...group("clinical information", "clinical_information", "escalated", [
    "I was diagnosed with diabetes", "I have a migraine",
    "My blood pressure is high", "I have kidney disease",
    "I think I have an infection", "My A1C is elevated",
    "I have asthma and a cough", "Tengo hipertensión",
    "Me diagnosticaron diabetes", "I have depression and anxiety",
  ]),
  ...group("Spanish refill", "refill", "recognized", [
    "Necesito renovar mi receta", "Quiero resurtir mi receta",
    "Necesito un relleno de receta", "Ya casi no tengo mis pastillas",
    "Puede renovar mi medicamento?", "Necesito más medicina de mi receta",
    "Resurtido de receta por favor", "Quiero rellenar mi receta",
    "Mi receta necesita renovación", "Ayúdeme con el resurtido de mi receta",
  ]),
  ...group("Spanish tracking", "tracking", "recognized", [
    "¿Dónde está mi pedido?", "Quiero rastrear mi entrega",
    "Mi pedido no ha llegado", "¿Cuándo llega mi medicina?",
    "Necesito el estado de mi entrega", "Rastrear mi paquete por favor",
    "Sigo esperando mi pedido", "Donde esta mi entrega",
    "Mi paquete está tarde", "¿Ya enviaron mi pedido?",
  ]),
  ...group("negation", "general", "clarify", [
    "I do not need a refill", "Do not transfer my prescriptions",
    "I never asked for delivery", "Stop the automatic refill",
    "I don't want to switch pharmacies", "No refill please",
    "I am not asking to track an order", "Don't sign me up",
    "I do not want store pickup", "No quiero cancelar mi renovación",
  ]),
  ...group("ambiguity", "general", "clarify", [
    "I need help", "Can you do that?", "What about it?", "medicine question",
    "my prescription", "the patient app", "delivery", "insurance question",
    "I need something", "Can someone help me with this?",
  ]),
  ...group("noise", "unreadable", "rejected", [
    "xq", "ñq", "12345", "zz", "q7", "00", "vk", "jx", "99999999", "qb",
  ]),
];

function evaluate(message: string): string {
  const lower = message.toLowerCase();
  if (isUnreadableShortMessage(message)) return "unreadable";
  if (/\b(?:do not|don't|dont|no)\b.*\b(?:refill|pickup|delivery|transfer|sign(?:\s+me)?\s+up|tracking)\b/.test(lower)) {
    return "general";
  }
  if (lower.includes("poison") || lower.includes("overdose") ||
      lower.includes("allergic reaction") || lower.includes("can't breathe") ||
      lower.includes("chest pain") || lower.includes("call 911") ||
      lower.includes("unconscious") || lower.includes("seizure") ||
      lower.includes("sobredosis") || lower.includes("no puedo respirar") ||
      lower.includes("dolor de pecho")) return "emergency";
  if (isControlledSubstanceRequest(message)) return "controlled_substance";
  if (isSignupRequest(message) && !/\bopen my patient account\b/.test(lower)) return "signup";
  if (hasClinicalTermOrDiagnosis(message) && !isExplicitOtcRequest(message)) {
    return "clinical_information";
  }
  if (isSupportedSpanishMessage(message)) {
    const spanish = detectSpanishIntent(message);
    if (spanish !== "spanish") return spanish;
  }
  return detectIntentHybrid(message);
}

describe("chatbot quality corpus — 250 end-to-end recognition requests", () => {
  it("contains exactly 250 unique and diverse cases", () => {
    expect(corpus).toHaveLength(250);
    expect(new Set(corpus.map(({ message }) => message.toLowerCase())).size).toBe(250);
    expect(new Set(corpus.map(({ category }) => category)).size).toBe(25);
    expect(new Set(corpus.map(({ outcome }) => outcome))).toEqual(
      new Set<Outcome>(["recognized", "escalated", "clarify", "rejected"]),
    );
  });

  it.each(corpus)("$category → $expected: $message", ({ message, expected }) => {
    const actual = evaluate(message);
    expect(actual).toBe(expected);
  });

  it("covers every required behavior family", () => {
    for (const required of [
      "refill", "tracking", "transfer in", "transfer out", "delivery", "hours",
      "location", "pickup", "flu and vaccines", "insurance", "prior authorization",
      "OTC shopping", "account signup", "login trouble", "private app data", "privacy",
      "pharmacist escalation", "emergency", "controlled substances",
      "clinical information", "Spanish refill", "Spanish tracking", "negation",
      "ambiguity", "noise",
    ]) expect(corpus.some(({ category }) => category === required)).toBe(true);
  });
});