export const PHARMACY_SCOPE_RESPONSE =
  "Here is what Concordia Pharmacy can help with:\n\n" +
  "• **Prescriptions**: new prescriptions, eligible refills, transfers, refill synchronization, and pharmacist questions\n" +
  "• **Medication support**: blister packaging, medication reviews, side-effect or interaction escalation, and disposal guidance\n" +
  "• **Orders**: live-catalog OTC shopping, cart and checkout, delivery or pickup requests, and signed-in order tracking\n" +
  "• **Coverage and cost**: insurance assistance, prior-authorization coordination, discount options, and specialty-medication requests\n" +
  "• **Health services**: flu-shot scheduling, doctor directory help, and signed-in care-journal tools\n" +
  "• **Ongoing care**: caregiver access, patient documents, refill reminders, rewards, and long-term-care facility inquiries\n\n" +
  "I can explain a service or start the right secure workflow. Staff must confirm prescription processing, stock, delivery addresses, pickup times, coverage, and final pricing.";

type Capability = {
  patterns: RegExp[];
  response: string;
};

const CAPABILITIES: Capability[] = [
  {
    patterns: [/\b(patient documents?|upload (?:a )?(?:document|insurance card|prescription label)|medical documents?)\b/i],
    response: "Signed-in patients can securely upload and manage supported documents. Please use ConcordiaCare rather than posting document contents or account identifiers in public chat.",
  },
  {
    patterns: [/\b(care journal|health journal|care navigator|track (?:my )?(?:condition|symptoms?))\b/i],
    response: "Signed-in patients can use ConcordiaCare's care-journal and Care Navigator tools to record health updates and review pharmacy-oriented next steps. These tools do not diagnose conditions or replace a clinician.",
  },
  {
    patterns: [/\b(caregiver|care giver|family access|manage (?:my )?(?:parent|mom|dad|loved one).*(?:med|prescription))\b/i],
    response: "ConcordiaCare supports authorized caregiver access for helping a patient manage pharmacy tasks. Access must be linked and authorized; public chat cannot disclose a patient's prescriptions or orders.",
  },
  {
    patterns: [/\b(long.?term care|nursing home|assisted living|memory care|facility pharmacy|facility services?)\b/i],
    response: "Concordia accepts long-term-care and facility service inquiries, including medication-organization and delivery coordination. The facility team confirms service scope, onboarding, schedules, and availability.",
  },
  {
    patterns: [/\b(specialty (?:medication|drug|pharmacy)|oncology medication|biologic|temperature.?controlled)\b/i],
    response: "You can browse Concordia's specialty-medication hub and submit a fulfillment request. Staff verifies sourcing, coverage, prior authorization, handling requirements, and delivery before confirming.",
  },
  {
    patterns: [/\b(prior auth|prior authorization|insurance denial|coverage appeal|appeal letter)\b/i],
    response: "Concordia can coordinate prior-authorization and coverage-assistance requests with the patient, prescriber, and insurer. Approval is determined by the insurer, and staff must confirm each case securely.",
  },
  {
    patterns: [/\b(find (?:a )?doctor|doctor directory|provider directory|physician referral)\b/i],
    response: "The website includes a doctor directory and matching-request workflow. Directory information helps with navigation but does not guarantee availability, insurance participation, or a clinical referral.",
  },
  {
    patterns: [/\b(flu shots?|vaccin(?:e|es|ation|ations)|immunizations?)\b/i],
    response: "You can request a flu-shot appointment through the website. The appointment is not created until the scheduling form is completed and confirmed.",
  },
  {
    patterns: [/\b(blister|pill pack|dose pack|organize (?:my )?(?:pills|medications))\b/i],
    response: "Concordia offers organized blister packaging by day and time. Pharmacy staff must review and confirm the medication schedule before preparing a pack.",
  },
  {
    patterns: [/\b(transfer (?:my )?(?:prescription|rx)|switch pharmac(?:y|ies)|transfer from another pharmacy)\b/i],
    response: "Concordia can receive a secure prescription-transfer request and track its status. Do not share prescription numbers in public chat; use the transfer form or call the pharmacy.",
  },
  {
    patterns: [/\b(refills?|renew (?:my )?(?:prescription|rx)|auto.?refills?|med sync|synchroniz(?:e|ation))\b/i],
    response: "Signed-in patients can request eligible refills, and staff can coordinate refill synchronization or automatic-refill support. A request is not a confirmed fill until pharmacy staff processes it.",
  },
  {
    patterns: [/\b(deliver|delivery|pickup|pick up|shipping|track (?:my )?(?:order|driver))\b/i],
    response: "Concordia supports delivery and pickup workflows plus tracking for eligible signed-in orders. Addresses, pickup windows, inventory, and delivery timing remain requests until staff confirms them.",
  },
  {
    patterns: [/\b(shop|otc|over.?the.?counter|store items?|catalog|in stock|inventory)\b/i],
    response: "I can search products that appear in Concordia's live catalog and show the current stock snapshot. Staff rechecks availability before fulfilling a pending request.",
  },
  {
    patterns: [/\b(insurance help|coverage|copay|discount|goodrx|no insurance|cash price)\b/i],
    response: "Concordia can accept an insurance-assistance request and discuss coverage, cash pricing, or available discount options. Exact coverage and pricing require a secure staff review.",
  },
  {
    patterns: [/\b(points|rewards?|loyalty|store credit)\b/i],
    response: "Signed-in members can view eligible rewards and points activity in ConcordiaCare. Reward eligibility is based on completed qualifying activity; pending, cancelled, reversed, controlled, or partial fills do not qualify for the refill credit.",
  },
  {
    patterns: [/\b(speak|talk|connect).{0,20}\b(pharmacist|staff|person|human)\b/i],
    response: "You can call Concordia Pharmacy at (718) 328-2833 during business hours to speak with pharmacy staff. I can also collect a minimal callback request without asking for medical or prescription details.",
  },
];

const SCOPE_QUESTION = /\b(what (?:all )?(?:do|can) you do|what services|how can you help|services? (?:do you|are) (?:offer|available)|capabilit(?:y|ies)|everything you do)\b/i;
const CAPABILITY_QUESTION = /\b(can (?:you|i|we|a|an|my)|do you|could you|are you able|help (?:me )?with|offer|provide|support|handle|talk to)\b/i;

export function getCapabilityScopeResponse(text: string): string | null {
  if (SCOPE_QUESTION.test(text)) return PHARMACY_SCOPE_RESPONSE;
  if (!CAPABILITY_QUESTION.test(text)) return null;
  const capability = CAPABILITIES.find((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  return capability?.response ?? null;
}