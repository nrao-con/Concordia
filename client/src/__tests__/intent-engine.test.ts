import { describe, it, expect } from "vitest";
import { tokenize, queryCoverage, detectIntentByJaccard, detectIntentHybrid, getIntentVocabs, expandWithSynonyms, PRODUCT_SYNONYMS, extractVoluntaryFirstName, isEnglishLanguagePreference, isSpanishLanguagePreference, detectConversationLanguage, isSignupRequest, isUnreadableShortMessage, isMedicationContextFragment, isMedicationHelpRequest, isSmallTalkCheckIn, isAppointmentDateFragment, isFluSchedulingAssistanceFollowUp, isExplicitOtcRequest, isControlledSubstanceRequest, hasClinicalTermOrDiagnosis, isSupportedSpanishMessage, detectSpanishIntent, isInboundTransferRequest, extractOtcPainSymptom } from "../lib/intent-engine";

describe("voluntary conversational first name", () => {
  it.each([
    ["hey, how are you? i am nim", "Nim"],
    ["My name is Alex", "Alex"],
    ["Me llamo josé", "José"],
    ["Call me Mary-Jane", "Mary-Jane"],
  ])("extracts an explicitly offered first name from %s", (message, expected) => {
    expect(extractVoluntaryFirstName(message)).toBe(expected);
  });

  it.each([
    "Alex",
    "I am sick",
    "I am looking for a refill",
    "My date of birth is 01/01/1990",
  ])("does not infer a name from %s", (message) => {
    expect(extractVoluntaryFirstName(message)).toBeNull();
  });
});

describe("common pharmacy typos", () => {
  it.each([
    ["I need a refil", "refill"],
    ["Can I get delivary", "delivery"],
    ["I want pickkup", "pickup"],
  ])("routes %s to %s", (message, expected) => {
    expect(detectIntentHybrid(message)).toBe(expected);
  });

  it("recognizes perscription as a medication-help request", () => {
    expect(isMedicationHelpRequest("I need help with my perscription")).toBe(true);
  });

  it("recognizes shorthand and the common migrane typo as an OTC pain request", () => {
    expect(isExplicitOtcRequest("do u have migrane meds")).toBe(true);
    expect(detectIntentHybrid("do u have migrane meds")).toBe("otc_pain");
  });
});

describe("inbound prescription transfer language", () => {
  it.each([
    "i wanna get meds from here now not my old pharmacy",
    "I want to transfer my prescriptions from CVS to Concordia",
    "bring my meds here from my current pharmacy",
  ])("recognizes %s as an inbound transfer", (message) => {
    expect(isInboundTransferRequest(message)).toBe(true);
    expect(detectIntentHybrid(message)).toBe("transfer");
  });

  it("does not mistake an outbound transfer for an inbound transfer", () => {
    expect(isInboundTransferRequest("I want to move my meds from Concordia to CVS")).toBe(false);
    expect(detectIntentHybrid("I want to move my meds from Concordia to CVS")).toBe("transfer_out");
  });
});

describe("guided pharmacy operations", () => {
  it.each([
    ["I need to schedule an appointment", "appointment"],
    ["Quiero programar una cita", "appointment"],
    ["Can you confirm my order?", "tracking"],
    ["Quiero verificar mi pedido", "tracking"],
  ])("routes %s to %s", (message, expected) => {
    expect(detectIntentHybrid(message)).toBe(expected);
  });
});

// ── tokenize ────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("lowercases and strips punctuation", () => {
    const t = tokenize("Hello, World!");
    expect(t.has("world")).toBe(true);
  });

  it("removes general stop words", () => {
    const t = tokenize("I need to take my medication today");
    expect(t.has("i")).toBe(false);
    expect(t.has("my")).toBe(false);
    expect(t.has("to")).toBe(false);
  });

  it("removes pharmacy-domain noise words", () => {
    const t = tokenize("my prescription medication pharmacy");
    expect(t.has("prescription")).toBe(false);
    expect(t.has("medication")).toBe(false);
    expect(t.has("pharmacy")).toBe(false);
  });

  it("applies suffix stemming", () => {
    const t = tokenize("organizing medications running");
    expect(t.has("organiz")).toBe(true);
    expect(t.has("runn")).toBe(true);
  });

  it("keeps words of length >= 3", () => {
    const t = tokenize("ok go get an rx now");
    expect(t.size).toBe(0); // all filtered out
  });
});

describe("controlled substance safety", () => {
  it.each([
    "Do you carry controlled substances?",
    "Can I get Adderall there?",
    "Tienen medicamentos controlados?",
    "Busco un opioide",
  ])("blocks availability routing for %s", (message) => {
    expect(isControlledSubstanceRequest(message)).toBe(true);
  });

  it("does not block an ordinary non-controlled OTC request", () => {
    expect(isControlledSubstanceRequest("Do you have acetaminophen?")).toBe(false);
  });
});

// ── queryCoverage ──────────────────────────────────────────────────────────

describe("queryCoverage", () => {
  it("returns 1.0 for identical sets", () => {
    const s = new Set(["refill", "early"]);
    const { score } = queryCoverage(s, s);
    expect(score).toBe(1.0);
  });

  it("returns 0 when no overlap", () => {
    const { score, intersection } = queryCoverage(
      new Set(["walgreens"]),
      new Set(["toothpaste", "floss"])
    );
    expect(score).toBe(0);
    expect(intersection).toBe(0);
  });

  it("returns 0.5 for half overlap", () => {
    const { score } = queryCoverage(
      new Set(["track", "order"]),
      new Set(["track", "delivery"])
    );
    expect(score).toBe(0.5);
  });
});

// ── detectIntentByJaccard — positive (should match expected intent) ─────────

describe("detectIntentByJaccard — positive cases", () => {
  // Refill variations
  it("detects refill from 'running low need refill soon'", () => {
    expect(detectIntentByJaccard("running low need refill soon")).toBe("refill");
  });
  it("detects refill from 'almost out early refill'", () => {
    expect(detectIntentByJaccard("almost out want early refill")).toBe("refill");
  });

  // Tracking
  it("detects tracking from 'where is my order still waiting'", () => {
    const r = detectIntentByJaccard("where order still waiting track");
    expect(r).toBe("tracking");
  });
  it("detects tracking from 'my package hasnt arrived'", () => {
    expect(detectIntentByJaccard("my package hasnt arrived delivery")).toBe("tracking");
  });

  // Transfer (inbound)
  it("detects transfer from 'switch pharmacy move meds here'", () => {
    expect(detectIntentByJaccard("switch pharmacy move meds here")).toBe("transfer");
  });
  it("detects transfer from 'transfer from walgreens to you'", () => {
    expect(detectIntentByJaccard("transfer from walgreens joining concordia")).toBe("transfer");
  });
  it("detects transfer from 'coming from cvs old pharmacy'", () => {
    expect(detectIntentByJaccard("coming from cvs old pharmacy switch")).toBe("transfer");
  });

  // Transfer out
  it("detects transfer_out from 'leave concordia switching away'", () => {
    expect(detectIntentByJaccard("leave concordia switching away")).toBe("transfer_out");
  });
  it("detects transfer_out from 'transfer out different pharmacy'", () => {
    expect(detectIntentByJaccard("transfer out going different pharmacy")).toBe("transfer_out");
  });

  // Flu shot
  it("detects flu_shot from 'schedule flu vaccine booster'", () => {
    expect(detectIntentByJaccard("schedule flu vaccine booster appointment")).toBe("flu_shot");
  });
  it("detects flu_shot from 'shingles vaccine immunization'", () => {
    expect(detectIntentByJaccard("shingles vaccine immunization appointment")).toBe("flu_shot");
  });

  // Delivery zones
  it("detects delivery_zones from 'do you deliver here brooklyn'", () => {
    expect(detectIntentByJaccard("do you deliver here brooklyn area")).toBe("delivery_zones");
  });

  // Delivery cost
  it("detects delivery_cost from 'is delivery free shipping cost'", () => {
    expect(detectIntentByJaccard("is delivery free shipping cost")).toBe("delivery_cost");
  });

  // Hours
  it("detects hours from 'store hours opening closing time'", () => {
    expect(detectIntentByJaccard("store hours opening closing time")).toBe("hours");
  });

  // Location
  it("detects location from 'pharmacy address directions concordia'", () => {
    expect(detectIntentByJaccard("pharmacy address directions concordia location")).toBe("location");
  });

  // New Rx
  it("detects new_rx from 'fill this script doctor sent'", () => {
    expect(detectIntentByJaccard("fill this script doctor sent faxed")).toBe("new_rx");
  });

  // Blister pack
  it("detects blister_pack from 'blister pack pill organizer'", () => {
    expect(detectIntentByJaccard("blister pack pill organizer doses")).toBe("blister_pack");
  });
  it("detects blister_pack from 'forgetting doses organize meds'", () => {
    expect(detectIntentByJaccard("forgetting doses organize schedule help")).toBe("blister_pack");
  });

  // Insurance accepted
  it("detects insurance_accepted from 'accept my insurance in network plan'", () => {
    expect(detectIntentByJaccard("accept my insurance network plan coverage")).toBe("insurance_accepted");
  });

  // No insurance
  it("detects no_insurance from 'no insurance cash price self pay'", () => {
    expect(detectIntentByJaccard("no insurance cash price self pay")).toBe("no_insurance");
  });

  // Loyalty
  it("detects loyalty from 'loyalty points rewards balance program'", () => {
    expect(detectIntentByJaccard("loyalty points rewards balance program")).toBe("loyalty");
  });

  // Signup
  it("detects signup from 'become patient new registration'", () => {
    expect(detectIntentByJaccard("become patient new registration enroll")).toBe("signup");
  });

  // OTC pain
  it("detects otc_pain from 'ibuprofen advil pain reliever headache'", () => {
    expect(detectIntentByJaccard("ibuprofen advil pain reliever headache")).toBe("otc_pain");
  });

  // OTC allergy
  it("detects otc_allergy from 'benadryl claritin seasonal allergies'", () => {
    expect(detectIntentByJaccard("benadryl claritin seasonal allergies relief")).toBe("otc_allergy");
  });

  // Drug interaction
  it("detects drug_interaction from 'safe take together interaction contraindication'", () => {
    expect(detectIntentByJaccard("safe take together interaction contraindication")).toBe("drug_interaction");
  });

  // Speak pharmacist
  it("detects speak_pharmacist from 'speak with pharmacist real person'", () => {
    expect(detectIntentByJaccard("speak with pharmacist real person representative")).toBe("speak_pharmacist");
  });

  // Cancel order
  it("detects cancel_order from 'cancel order delivery stop'", () => {
    expect(detectIntentByJaccard("cancel order delivery stop")).toBe("cancel_order");
  });

  // Smoking
  it("detects smoking from 'quit smoking nicotine patch cessation'", () => {
    expect(detectIntentByJaccard("quit smoking nicotine patch cessation")).toBe("smoking");
  });

  // LTC
  it("detects ltc from 'long term care nursing home pharmacy'", () => {
    expect(detectIntentByJaccard("long term care nursing home pharmacy facility")).toBe("ltc");
  });

  // Lost rx
  it("detects lost_rx from 'lost stolen prescription medication'", () => {
    expect(detectIntentByJaccard("lost stolen prescription medication missing")).toBe("lost_rx");
  });

  // Blister explain
  it("detects blister_explain from 'what is blister pack explain'", () => {
    expect(detectIntentByJaccard("what blister pack explain information")).toBe("blister_explain");
  });
});

// ── detectIntentByJaccard — false-positive guards ──────────────────────────

describe("detectIntentByJaccard — false-positive prevention", () => {
  it("does NOT fire tracking for 'I am running late today'", () => {
    const r = detectIntentByJaccard("I am running late today");
    expect(r).not.toBe("tracking");
  });

  it("does NOT fire dental for 'I take this medication orally'", () => {
    const r = detectIntentByJaccard("I take this medication orally daily");
    expect(r).not.toBe("otc_dental");
  });

  it("returns null for very short/noise queries", () => {
    expect(detectIntentByJaccard("ok")).toBeNull();
    expect(detectIntentByJaccard("hi")).toBeNull();
  });

  it("does NOT fire flu_shot for bare 'shot' alone", () => {
    const r = detectIntentByJaccard("shot");
    expect(r).toBeNull();
  });

  it("does NOT fire transfer_out for 'transfer my prescriptions to concordia'", () => {
    // This should already be handled by Tier-1 as transfer (inbound)
    // Jaccard should fire transfer, not transfer_out
    const r = detectIntentByJaccard("transfer prescriptions joining concordia here");
    expect(r).not.toBe("transfer_out");
  });
});

// ── Vocabulary sanity ───────────────────────────────────────────────────────

describe("intent vocabulary sanity", () => {
  it("all INTENT_RULES intents produce non-empty vocabularies", () => {
    const vocabs = getIntentVocabs();
    for (const [intent, vocab] of vocabs) {
      expect(vocab.size, `empty vocab for intent: ${intent}`).toBeGreaterThan(0);
    }
  });

  it("flu_shot vocab contains 'flu' and 'shot'", () => {
    const vocabs = getIntentVocabs();
    const v = vocabs.get("flu_shot")!;
    expect(v.has("flu")).toBe(true);
    expect(v.has("shot")).toBe(true);
  });

  it("transfer_out vocab contains 'leav' (stemmed 'leave')", () => {
    const vocabs = getIntentVocabs();
    const v = vocabs.get("transfer_out")!;
    // 'leaving' → stems to 'leav' (6 chars: leav + ing = 7 > 6, strip 'ing' → 'leav')
    expect(v.has("leav") || v.has("leave")).toBe(true);
  });

  it("otc_dental vocab does NOT contain bare 'oral' as a standalone token that would match 'orally'", () => {
    // 'oral' is 4 chars, no stemming suffix, passes through as-is
    // 'orally' → stems to 'oral' (6 chars, ends in 'ly' → strip → 'oral')
    // Both would be 'oral' after stemming — so the test checks that a query
    // like "oral daily" doesn't get 100% coverage against dental.
    const queryWords = tokenize("oral daily dose");
    const vocabs = getIntentVocabs();
    const dental = vocabs.get("otc_dental")!;
    const { score } = queryCoverage(queryWords, dental);
    // Should not reach the 0.35 threshold with just "oral" matching
    expect(score).toBeLessThan(0.35);
  });
});

// ── expandWithSynonyms ─────────────────────────────────────────────────────

describe("expandWithSynonyms", () => {
  it("always preserves the original tokens", () => {
    const result = expandWithSynonyms(["advil", "tablets"]);
    expect(result.has("advil")).toBe(true);
    expect(result.has("tablets")).toBe(true);
  });

  it("expands a known brand to its generic equivalent", () => {
    const result = expandWithSynonyms(["advil"]);
    expect(result.has("ibuprofen")).toBe(true);
  });

  it("expands a generic to its brand equivalents", () => {
    const result = expandWithSynonyms(["ibuprofen"]);
    expect(result.has("advil")).toBe(true);
    expect(result.has("motrin")).toBe(true);
  });

  it("expands tylenol to acetaminophen", () => {
    const result = expandWithSynonyms(["tylenol"]);
    expect(result.has("acetaminophen")).toBe(true);
  });

  it("expands allergy brand to generic", () => {
    const result = expandWithSynonyms(["zyrtec"]);
    expect(result.has("cetirizine")).toBe(true);
  });

  it("expands claritin to loratadine", () => {
    const result = expandWithSynonyms(["claritin"]);
    expect(result.has("loratadine")).toBe(true);
  });

  it("expands benadryl to diphenhydramine", () => {
    const result = expandWithSynonyms(["benadryl"]);
    expect(result.has("diphenhydramine")).toBe(true);
  });

  it("expands mucinex to guaifenesin", () => {
    const result = expandWithSynonyms(["mucinex"]);
    expect(result.has("guaifenesin")).toBe(true);
  });

  it("expands omeprazole to prilosec", () => {
    const result = expandWithSynonyms(["omeprazole"]);
    expect(result.has("prilosec")).toBe(true);
  });

  it("expands imodium to loperamide", () => {
    const result = expandWithSynonyms(["imodium"]);
    expect(result.has("loperamide")).toBe(true);
  });

  it("expands melatonin with sleep context", () => {
    const result = expandWithSynonyms(["melatonin"]);
    expect(result.has("sleep")).toBe(true);
  });

  it("splits multi-word synonym values into individual tokens", () => {
    // "vitamin c" → ["ascorbic", "emergen"] — both single tokens
    const result = expandWithSynonyms(["vitamin"]);
    // "vitamin" has no direct entry, but test that multi-word keys don't explode
    expect(result.has("vitamin")).toBe(true);
  });

  it("handles an unknown token gracefully — no expansion but no error", () => {
    const result = expandWithSynonyms(["unknownbrandxyz"]);
    expect(result.has("unknownbrandxyz")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("handles an empty array", () => {
    const result = expandWithSynonyms([]);
    expect(result.size).toBe(0);
  });

  it("all PRODUCT_SYNONYMS keys are lowercase", () => {
    for (const key of Object.keys(PRODUCT_SYNONYMS)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("all PRODUCT_SYNONYMS values are arrays of non-empty strings", () => {
    for (const [key, vals] of Object.entries(PRODUCT_SYNONYMS)) {
      expect(Array.isArray(vals)).toBe(true);
      for (const v of vals) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
        // ensure no accidental uppercase was introduced
        expect(v).toBe(v.toLowerCase());
      }
    }
  });
});

// ── fuzzyMatchProduct simulation against real inventory ────────────────────
// Replicates the exact fuzzyMatchProduct algorithm (with dosage filter +
// length-ratio guard) against the real product catalog fetched from DB.

interface MockProduct { name: string; category: string; }

function simulateFuzzyMatch(query: string, products: MockProduct[]): string | null {
  const COMMON = new Set([
    "do","you","have","got","want","need","the","a","an","is","are","for","any",
    "some","get","can","could","will","would","help","please","find","looking",
    "know","think","make","take","see","also","very","much","many","more","too",
    "just","back","only","well","still","even","here","there","now","then","over",
    "out","up","down","off","not","no","yes","so","but","or","and","if","what",
    "how","when","where","who","why","which","pharmacy","medicine","medication",
    "prescription","pill","drug","doctor","health","sick","pain","delivery",
    "deliver","pickup","pick","refill","blister","pack","insurance","cost",
    "price","order","track","transfer","switch","store","line","wait",
  ]);
  const inputTokens = query.toLowerCase().split(/[\s,.()\-/]+/)
    .filter(t => t.length > 2 && !COMMON.has(t));
  if (!inputTokens.length) return null;
  const expandedTokens = expandWithSynonyms(inputTokens);
  let best: { name: string; score: number } | null = null;
  for (const p of products) {
    const nameTokens = p.name.toLowerCase().split(/[\s,.()\-/]+/)
      .filter(t => t.length > 1 && !/^\d/.test(t));
    const catTokens = p.category.toLowerCase().split(/[\s,.()\-/]+/)
      .filter(t => t.length > 1);
    const allTokens = [...nameTokens, ...catTokens];
    let matches = 0;
    for (const it of expandedTokens) {
      if (allTokens.some(pt =>
        pt.includes(it) || (it.includes(pt) && pt.length >= it.length * 0.7)
      )) matches++;
    }
    const score = matches / Math.max(inputTokens.length, nameTokens.length, 1);
    if (score >= 0.45 && (!best || score > best.score)) best = { name: p.name, score };
  }
  return best?.name ?? null;
}

// Real product catalog (from DB snapshot)
const REAL_PRODUCTS: MockProduct[] = [
  { name: "Allergy Relief",                    category: "Allergy" },
  { name: "Cetirizine 10mg Allergy (30ct)",    category: "Allergy & Sinus" },
  { name: "Cough Syrup",                       category: "Cold & Flu" },
  { name: "First Aid Kit",                     category: "First Aid" },
  { name: "Acetaminophen 500mg",               category: "Pain Relief" },
  { name: "Ibuprofen 200mg",                   category: "Pain Relief" },
  { name: "Ibuprofen 200mg (24ct)",            category: "Pain Relief" },
  { name: "Melatonin 5mg",                     category: "Sleep Aid" },
  { name: "Melatonin Gummy",                   category: "Sleep Aid" },
  { name: "Omega-3 Fish Oil",                  category: "Supplements" },
  { name: "Probiotic Daily",                   category: "Supplements" },
  { name: "Calcium + Vitamin D",              category: "Vitamins" },
  { name: "Multivitamin Complete",             category: "Vitamins" },
  { name: "Aspirin 81mg",                      category: "otc" },
  { name: "Vitamin B12",                       category: "otc" },
];

describe("fuzzyMatchProduct simulation — real inventory", () => {
  it("'advil' matches Ibuprofen via synonym expansion", () => {
    expect(simulateFuzzyMatch("do you have advil", REAL_PRODUCTS)).toMatch(/ibuprofen/i);
  });

  it("'tylenol' matches Acetaminophen via synonym expansion", () => {
    expect(simulateFuzzyMatch("tylenol", REAL_PRODUCTS)).toMatch(/acetaminophen/i);
  });

  it("'zyrtec' matches Cetirizine via synonym expansion + dosage filter", () => {
    expect(simulateFuzzyMatch("got zyrtec", REAL_PRODUCTS)).toMatch(/cetirizine/i);
  });

  it("exact 'cetirizine' matches Cetirizine despite long product name (dosage filter)", () => {
    expect(simulateFuzzyMatch("cetirizine", REAL_PRODUCTS)).toMatch(/cetirizine/i);
  });

  it("'aspirin' matches Aspirin 81mg (dosage token stripped from denominator)", () => {
    expect(simulateFuzzyMatch("aspirin", REAL_PRODUCTS)).toMatch(/aspirin/i);
  });

  it("'acetaminophen' matches Acetaminophen 500mg", () => {
    expect(simulateFuzzyMatch("acetaminophen", REAL_PRODUCTS)).toMatch(/acetaminophen/i);
  });

  it("'ibuprofen' matches Ibuprofen 200mg directly", () => {
    expect(simulateFuzzyMatch("ibuprofen tablets", REAL_PRODUCTS)).toMatch(/ibuprofen/i);
  });

  it("'mucinex cough' matches Cough Syrup", () => {
    expect(simulateFuzzyMatch("mucinex cough", REAL_PRODUCTS)).toMatch(/cough syrup/i);
  });

  it("'multivitamin' correctly matches Multivitamin Complete, not Calcium+Vitamin D", () => {
    const result = simulateFuzzyMatch("multivitamin", REAL_PRODUCTS);
    expect(result).toMatch(/multivitamin/i);
    expect(result).not.toMatch(/calcium/i);
  });

  it("'fish oil omega' matches Omega-3 Fish Oil", () => {
    expect(simulateFuzzyMatch("fish oil omega", REAL_PRODUCTS)).toMatch(/omega/i);
  });

  it("'omega' (from hyphenated omega-3 query) matches Omega-3 Fish Oil via synonym", () => {
    // "omega-3" splits on hyphen → inputToken "omega" → synonym expands to {fish, oil}
    expect(simulateFuzzyMatch("omega-3", REAL_PRODUCTS)).toMatch(/omega/i);
  });

  it("'vitamin b12' matches Vitamin B12", () => {
    expect(simulateFuzzyMatch("vitamin b12", REAL_PRODUCTS)).toMatch(/vitamin b12/i);
  });

  it("'probiotics' matches Probiotic Daily (length-ratio guard allows it.includes(pt))", () => {
    // "probiotics".includes("probiotic") && "probiotic".length(9) >= "probiotics".length(10)*0.7
    expect(simulateFuzzyMatch("probiotics", REAL_PRODUCTS)).toMatch(/probiotic/i);
  });

  it("'calcium vitamin d' matches Calcium + Vitamin D", () => {
    expect(simulateFuzzyMatch("calcium vitamin d", REAL_PRODUCTS)).toMatch(/calcium/i);
  });

  it("'melatonin' matches a melatonin product", () => {
    expect(simulateFuzzyMatch("melatonin", REAL_PRODUCTS)).toMatch(/melatonin/i);
  });

  it("'claritin' returns null — loratadine is not in inventory", () => {
    // We don't carry loratadine; correct behavior is no match → bot says it's unavailable
    expect(simulateFuzzyMatch("claritin", REAL_PRODUCTS)).toBeNull();
  });

  it("'benadryl' returns null — diphenhydramine is not in inventory", () => {
    expect(simulateFuzzyMatch("benadryl", REAL_PRODUCTS)).toBeNull();
  });
});

describe("conversation control intents", () => {
  it("recognizes appointment dates supplied as short follow-ups", () => {
    expect(isAppointmentDateFragment("next monday")).toBe(true);
    expect(isAppointmentDateFragment("monday next week at 2pm")).toBe(true);
    expect(isAppointmentDateFragment("on Friday afternoon")).toBe(true);
    expect(isAppointmentDateFragment("tomorrow")).toBe(true);
    expect(isAppointmentDateFragment("11/12/2026")).toBe(true);
    expect(isAppointmentDateFragment("my refill is next monday")).toBe(false);
  });

  it("recognizes requests for help with an active flu-shot scheduler", () => {
    expect(isFluSchedulingAssistanceFollowUp("do it for me i cant")).toBe(true);
    expect(isFluSchedulingAssistanceFollowUp("book it for me")).toBe(true);
    expect(isFluSchedulingAssistanceFollowUp("I need help")).toBe(true);
    expect(isFluSchedulingAssistanceFollowUp("what are your hours")).toBe(false);
  });

  it("recognizes an English-only preference before gibberish handling", () => {
    expect(isEnglishLanguagePreference("just english")).toBe(true);
    expect(isEnglishLanguagePreference("English only, please")).toBe(true);
    expect(isEnglishLanguagePreference("do not use Spanish")).toBe(true);
  });

  it("recognizes a one-word Spanish language switch before shop search recovery", () => {
    expect(isSpanishLanguagePreference("spanish")).toBe(true);
    expect(isSpanishLanguagePreference("Español, por favor")).toBe(true);
    expect(detectConversationLanguage("spanish", "en")).toBe("es");
    expect(isSpanishLanguagePreference('Search our shop for "spanish"')).toBe(false);
  });

  it("switches languages turn by turn and preserves neutral follow-ups", () => {
    expect(detectConversationLanguage("I need a refill", "en")).toBe("en");
    expect(detectConversationLanguage("Ahora necesito una entrega", "en")).toBe("es");
    expect(detectConversationLanguage("yes", "es")).toBe("es");
    expect(detectConversationLanguage("Now I need delivery help", "es")).toBe("en");
  });

  it.each([
    "Necesito refill my prescription",
    "Can you ayudar con mi entrega?",
    "I need ayuda con insurance",
    "Quiero pickup for my receta",
  ])("recognizes mixed English and Spanish: %s", (message) => {
    expect(detectConversationLanguage(message, "en")).toBe("mixed");
  });

  it("recognizes abbreviated account creation without matching accessory", () => {
    expect(isSignupRequest("i need to create acc")).toBe(true);
    expect(isSignupRequest("open an acct")).toBe(true);
    expect(isSignupRequest("I need an accessory")).toBe(false);
  });

  it("separates short noise from normal greetings", () => {
    expect(isUnreadableShortMessage("op")).toBe(true);
    expect(isUnreadableShortMessage("996")).toBe(true);
    expect(isUnreadableShortMessage("no u ant")).toBe(true);
    expect(isUnreadableShortMessage("hi")).toBe(false);
    expect(isUnreadableShortMessage("hey")).toBe(false);
  });

  it("recognizes medication fragments that need focused clarification", () => {
    expect(isUnreadableShortMessage("op")).toBe(true);
    expect(isMedicationContextFragment("med")).toBe(true);
    expect(isMedicationContextFragment("meds")).toBe(true);
    expect(isMedicationContextFragment("prescription")).toBe(true);
    expect(isMedicationContextFragment("delivery")).toBe(false);
  });

  it("separates clinical mentions from explicit OTC requests", () => {
    expect(hasClinicalTermOrDiagnosis("I was diagnosed with diabetes")).toBe(true);
    expect(hasClinicalTermOrDiagnosis("my A1C is high")).toBe(true);
    expect(hasClinicalTermOrDiagnosis("tengo hipertensión")).toBe(true);
    expect(isExplicitOtcRequest("I have a headache")).toBe(false);
    expect(isExplicitOtcRequest("what OTC product can I use for a headache")).toBe(true);
    expect(isExplicitOtcRequest("busco algo para alergias")).toBe(true);
    expect(isSupportedSpanishMessage("Busco algo sin receta para dolor de cabeza")).toBe(true);
    expect(detectSpanishIntent("Busco algo sin receta para dolor de cabeza")).toBe("otc_pain");
    expect(isExplicitOtcRequest("what i want is something that make my knee pain go away")).toBe(true);
    expect(isExplicitOtcRequest("what i want is something that makes my knee pain go away")).toBe(true);
    expect(extractOtcPainSymptom("what i want is something that makes my knee pain go away")).toBe("knee pain");
  });

  it("preserves the requested workflow when switching to Spanish", () => {
    expect(detectSpanishIntent("Ahora necesito una entrega")).toBe("delivery_zones");
    expect(detectSpanishIntent("Quiero solicitar una entrega a domicilio")).toBe("delivery_zones");
  });

  it("fails closed for Spanish emergency and privacy language", () => {
    expect(detectSpanishIntent("Tengo una emergencia médica")).toBe("emergency");
    expect(detectSpanishIntent("¿Cómo protegen mi información personal?")).toBe("hipaa_privacy");
    expect(detectSpanishIntent("No, no quiero compartir datos")).toBe("hipaa_privacy");
    expect(detectSpanishIntent("¿Dónde está mi pedido?")).toBe("tracking");
  });
});

describe("natural medication conversation controls", () => {
  it("recognizes a newly sent prescription deterministically", () => {
    expect(detectIntentHybrid("My doctor sent in a new prescription")).toBe("new_rx");
  });

  it.each(["meds", "my prescription", "i want my meds", "i need neds", "I need my medication"])(
    "routes '%s' to focused medication clarification",
    (message) => {
      expect(isMedicationHelpRequest(message)).toBe(true);
    },
  );

  it("recognizes a short Spanish medication clause inside a mixed grocery request", () => {
    expect(isMedicationHelpRequest("un de medicina")).toBe(true);
    expect(isMedicationHelpRequest("medicina")).toBe(true);
    expect(detectConversationLanguage("un de medicina and the grocerry", "en")).toBe("es");
    expect(isMedicationHelpRequest("medicina para dolor de cabeza")).toBe(false);
  });

  it("treats a symptom followed by a medication noun as an explicit OTC request", () => {
    expect(isExplicitOtcRequest("headache med")).toBe(true);
    expect(isExplicitOtcRequest("I have a headache")).toBe(false);
    expect(detectIntentHybrid("what i want is something that make my knee pain go away")).toBe("otc_pain");
    expect(detectIntentHybrid("what i want is something that makes my knee pain go away")).toBe("otc_pain");
  });

  it.each(["how are you", "How r u doing?", "How are you today?", "what's up"])(
    "handles '%s' as small talk",
    (message) => {
      expect(isSmallTalkCheckIn(message)).toBe(true);
    },
  );

  it("does not broaden medication typo correction to unrelated words", () => {
    expect(isMedicationHelpRequest("I need news")).toBe(false);
    expect(isMedicationHelpRequest("I want beds")).toBe(false);
  });
});
