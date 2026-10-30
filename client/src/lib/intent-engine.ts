/**
 * Jaccard + query-coverage hybrid intent engine for the Care Concierge.
 *
 * Architecture
 * ────────────
 * Tier 1 (existing chat-widget.tsx): sequential lower.includes() checks —
 *   fast, order-sensitive, handles exact phrases perfectly.
 *
 * Tier 2 (this file): query-coverage scoring — fires ONLY when Tier 1
 *   returns "general".  Handles rephrasings and partial-word queries that
 *   fall through the exact-match chain.
 *
 * Scoring
 * ───────
 * score = |intersection(queryWords, intentVocab)| / queryWords.size
 *
 * Using query-coverage (not pure Jaccard) because intent vocabularies are
 * large (many phrase variants → many tokens) which would otherwise
 * over-penalise short user queries via the large union denominator.
 *
 * Thresholds
 * ──────────
 * • MIN_SCORE   = 0.30  (≥30 % of query words must appear in intent vocab)
 * • MIN_INTER_LARGE = 2  (for queries > 3 meaningful words, need 2 matches)
 * • queries with < 2 meaningful words → return null (too ambiguous)
 *
 * Stop words
 * ──────────
 * General English stop words + pharmacy-domain noise words ("medication",
 * "prescription", etc.) that appear in almost every intent and don't
 * discriminate between them.
 */

// ── Product synonym map ─────────────────────────────────────────────────────
// Maps a lowercase token to equivalent tokens (brand↔generic, purpose aliases).
// Values are space-separated strings so multi-word brand names stay readable;
// expandWithSynonyms() splits them before adding to the expanded set.
export const PRODUCT_SYNONYMS: Record<string, string[]> = {
  // ── OTC Pain ──
  "advil":         ["ibuprofen"],
  "motrin":        ["ibuprofen"],
  "ibuprofen":     ["advil", "motrin"],
  "tylenol":       ["acetaminophen"],
  "acetaminophen": ["tylenol"],
  "aleve":         ["naproxen"],
  "naproxen":      ["aleve"],
  "excedrin":      ["acetaminophen", "aspirin", "caffeine"],
  "aspirin":       ["bayer", "bufferin"],
  "bayer":         ["aspirin"],
  "bufferin":      ["aspirin"],
  "painkiller":    ["pain", "reliever", "analgesic"],
  "analgesic":     ["pain", "reliever"],

  // ── OTC Allergy ──
  "claritin":       ["loratadine"],
  "loratadine":     ["claritin"],
  "zyrtec":         ["cetirizine"],
  "cetirizine":     ["zyrtec"],
  "allegra":        ["fexofenadine"],
  "fexofenadine":   ["allegra"],
  "benadryl":       ["diphenhydramine"],
  "diphenhydramine":["benadryl", "unisom", "zzzquil"],
  "flonase":        ["fluticasone"],
  "fluticasone":    ["flonase"],
  "xyzal":          ["levocetirizine"],
  "levocetirizine": ["xyzal"],
  "antihistamine":  ["allergy", "claritin", "zyrtec", "benadryl", "allegra"],

  // ── OTC Cold / Cough / Flu ──
  "nyquil":          ["dextromethorphan", "doxylamine"],
  "dayquil":         ["dextromethorphan", "phenylephrine"],
  "mucinex":         ["guaifenesin"],
  "guaifenesin":     ["mucinex"],
  "robitussin":      ["guaifenesin", "dextromethorphan"],
  "dextromethorphan":["robitussin", "mucinex"],
  "sudafed":         ["pseudoephedrine"],
  "pseudoephedrine": ["sudafed"],
  "afrin":           ["oxymetazoline"],
  "oxymetazoline":   ["afrin"],
  "decongestant":    ["sudafed", "pseudoephedrine", "phenylephrine"],
  "cough syrup":     ["robitussin", "mucinex", "guaifenesin"],
  "expectorant":     ["guaifenesin", "mucinex"],

  // ── OTC Digestive / Heartburn ──
  "tums":              ["calcium", "carbonate", "antacid"],
  "rolaids":           ["calcium", "antacid"],
  "antacid":           ["tums", "rolaids", "calcium"],
  "prilosec":          ["omeprazole"],
  "omeprazole":        ["prilosec"],
  "nexium":            ["esomeprazole"],
  "esomeprazole":      ["nexium"],
  "prevacid":          ["lansoprazole"],
  "lansoprazole":      ["prevacid"],
  "pepcid":            ["famotidine"],
  "famotidine":        ["pepcid"],
  "zantac":            ["ranitidine"],
  "ranitidine":        ["zantac"],
  "pepto":             ["bismuth", "diarrhea"],
  "imodium":           ["loperamide"],
  "loperamide":        ["imodium"],
  "miralax":           ["polyethylene", "glycol", "laxative"],
  "colace":            ["docusate"],
  "docusate":          ["colace"],
  "dulcolax":          ["bisacodyl"],
  "bisacodyl":         ["dulcolax"],
  "laxative":          ["miralax", "dulcolax", "constipation"],
  "probiotic":         ["acidophilus", "lactobacillus", "culturelle", "align"],
  "culturelle":        ["probiotic", "lactobacillus"],
  "align":             ["probiotic"],
  "heartburn":         ["antacid", "omeprazole", "famotidine"],

  // ── OTC Sleep ──
  "unisom":       ["diphenhydramine", "doxylamine"],
  "zzzquil":      ["diphenhydramine"],
  "simply sleep": ["diphenhydramine"],
  "melatonin":    ["sleep", "natrol"],
  "natrol":       ["melatonin"],
  "sleep aid":    ["melatonin", "diphenhydramine", "unisom"],

  // ── OTC Eye Care ──
  "visine":        ["eye", "drops", "redness"],
  "clear eyes":    ["eye", "drops"],
  "rohto":         ["eye", "drops"],
  "eye drops":     ["visine", "artificial", "tears"],
  "artificial tears": ["lubricant", "eye", "drops"],

  // ── OTC Skin / Topical ──
  "neosporin":     ["bacitracin", "antibiotic", "ointment"],
  "bacitracin":    ["neosporin", "antibiotic", "ointment"],
  "hydrocortisone":["cortisone"],
  "cortisone":     ["hydrocortisone"],
  "calamine":      ["itch", "relief"],
  "benadryl cream":["diphenhydramine", "itch"],
  "sunscreen":     ["spf", "sun", "protection"],
  "coppertone":    ["sunscreen", "spf"],
  "neutrogena":    ["sunscreen", "spf"],

  // ── OTC Wound Care ──
  "band-aid":  ["bandage", "adhesive"],
  "bandaid":   ["bandage", "adhesive"],
  "bandage":   ["band-aid", "adhesive", "gauze"],
  "gauze":     ["bandage", "wound"],

  // ── OTC Dental / Oral ──
  "sensodyne":   ["toothpaste", "sensitivity"],
  "colgate":     ["toothpaste"],
  "crest":       ["toothpaste", "whitening"],
  "listerine":   ["mouthwash", "antiseptic"],
  "scope":       ["mouthwash"],
  "mouthwash":   ["listerine", "scope", "antiseptic"],

  // ── OTC Vitamins / Supplements ──
  "centrum":     ["multivitamin"],
  "one a day":   ["multivitamin"],
  "one-a-day":   ["multivitamin"],
  "multivitamin":["centrum", "daily", "vitamin"],
  "vitamin c":   ["ascorbic", "emergen"],
  "emergen-c":   ["vitamin", "immune"],
  "airborne":    ["vitamin", "immune", "supplement"],
  "fish oil":    ["omega", "omega-3", "omega3"],
  "omega-3":     ["fish", "oil"],
  "omega3":      ["fish", "oil"],
  "vitamin d":   ["cholecalciferol", "d3"],
  "vitamin d3":  ["cholecalciferol", "vitamin"],
  "vitamin b12": ["cyanocobalamin", "methylcobalamin"],
  "zinc":        ["immune", "supplement"],
  "magnesium":   ["supplement"],
  "calcium":     ["bone", "supplement"],

  // ── Diabetes / Blood Sugar ──
  "glucometer":    ["glucose", "meter", "monitor"],
  "glucose meter": ["glucometer", "monitor"],
  "onetouch":      ["glucose", "meter", "lancet"],
  "freestyle":     ["glucose", "meter", "strips"],
  "glucose strips":["test", "strips", "monitor"],
  "lancets":       ["glucose", "onetouch"],

  // ── Supplements (split-token aliases) ──
  // "omega-3" splits on hyphen → inputToken becomes "omega"; map it to the product words
  "omega":      ["fish", "oil"],

  // ── Weight Management ──
  "ozempic":    ["semaglutide"],
  "wegovy":     ["semaglutide"],
  "semaglutide":["ozempic", "wegovy"],
  "mounjaro":   ["tirzepatide"],
  "tirzepatide":["mounjaro"],
  "alli":       ["orlistat"],
  "orlistat":   ["alli"],

  // ── General Purpose Aliases ──
  "cold medicine":    ["decongestant", "cough", "nyquil", "dayquil"],
  "flu medicine":     ["decongestant", "cough", "fever", "nyquil"],
  "allergy medicine": ["antihistamine", "claritin", "zyrtec", "allegra"],
  "pain medicine":    ["ibuprofen", "acetaminophen", "aspirin", "naproxen"],
  "pain relief":      ["ibuprofen", "acetaminophen", "aspirin"],
};

/**
 * Safety-critical phrases are kept separate from the general intent vocabulary
 * so a classifier cannot downgrade them to a routine refill, product, or
 * delivery request.
 */
export function isEmergencySafetySignal(text: string): boolean {
  const lower = text.toLowerCase().replace(/[’]/g, "'");
  const benignEmergencyContext =
    /\b(?:emergency contraception|plan\s*b|morning[-\s]+after\s+pill)\b/.test(lower) ||
    /\b(?:emergency|urgent|rush|asap)\b.{0,24}\b(?:delivery|deliver|pickup|pick\s*up|order|refill)\b/.test(lower);

  if (benignEmergencyContext) {
    return false;
  }

  return [
    "poison",
    "veneno",
    "overdose",
    "sobredosis",
    "allergic reaction",
    "anaphylaxis",
    "anafilaxia",
    "can't breathe",
    "cant breathe",
    "cannot breathe",
    "no puedo respirar",
    "chest pain",
    "dolor de pecho",
    "call 911",
    "llame al 911",
    "dying",
    "me estoy muriendo",
    "seizure",
    "convulsion",
    "convulsión",
    "unconscious",
    "inconsciente",
    "passed out",
    "desmayo",
    "bleeding profusely",
    "sangrando mucho",
    "suicide",
    "suicidio",
    "self harm",
    "self-harm",
    "autolesión",
    "double dose",
    "doble dosis",
    "took two by accident",
    "tomé dos por accidente",
    "whole bottle of pills",
  ].some((phrase) => lower.includes(phrase)) ||
    (/\b(?:emergency|emergencia)\b/.test(lower) &&
      !/\b(?:contraception|contraceptivo|delivery|deliver|pickup|pick\s*up|order|refill|rush|urgent|asap)\b/.test(lower));
}

/**
 * Expands an array of query tokens with their synonyms from PRODUCT_SYNONYMS.
 * Multi-word synonym values are split so each token is added independently.
 * The original tokens are always preserved in the returned Set.
 */
export function expandWithSynonyms(tokens: string[]): Set<string> {
  const expanded = new Set<string>(tokens);
  for (const token of tokens) {
    const syns = PRODUCT_SYNONYMS[token];
    if (!syns) continue;
    for (const s of syns) {
      for (const part of s.split(/[\s-]+/)) {
        if (part.length >= 2) expanded.add(part);
      }
    }
  }
  return expanded;
}

// ── Stop words ─────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  // general
  "i","me","my","we","you","your","the","a","an","is","are","was","am","be",
  "been","do","does","did","have","has","had","will","would","can","could",
  "should","may","might","to","of","in","on","at","for","with","from","by",
  "it","this","that","not","no","yes","and","or","but","if","so","just","get",
  "go","want","need","like","know","think","make","take","see","look","help",
  "tell","call","give","use","try","find","ask","work","feel","let","put","say",
  "what","how","when","where","who","why","which","all","some","any","much",
  "more","most","very","too","also","about","out","up","down","here","there",
  "now","then","than","them","they","he","she","his","her","him","our","us",
  "back","only","well","still","even","one","don","ll","ve","re","s","d",
  "got","get","gonna","wanna","gotta",
  // pharmacy-domain noise (appears in almost every intent — not discriminative)
  // NOTE: "rx" intentionally kept OUT of stop-words — it is a highly
  // discriminative signal (means prescription) and must survive tokenisation.
  "medication","medications","prescription","prescriptions","meds","pills",
  "pill","drug","drugs","medicine","pharmacy","pharmacist",
]);

// ── Lightweight suffix stemmer ──────────────────────────────────────────────
function stem(w: string): string {
  if (w.length > 6 && w.endsWith("tion"))  return w.slice(0, -4);
  if (w.length > 5 && w.endsWith("ing"))   return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed"))    return w.slice(0, -2);
  if (w.length > 5 && w.endsWith("ness"))  return w.slice(0, -4);
  if (w.length > 4 && w.endsWith("ly"))    return w.slice(0, -2);
  return w;
}

// ── Tokenizer ───────────────────────────────────────────────────────────────
export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

// ── Query-coverage score ────────────────────────────────────────────────────
export function queryCoverage(queryWords: Set<string>, vocab: Set<string>): { score: number; intersection: number } {
  if (queryWords.size === 0) return { score: 0, intersection: 0 };
  let intersection = 0;
  for (const w of queryWords) {
    if (vocab.has(w)) intersection++;
  }
  return { score: intersection / queryWords.size, intersection };
}

// ── Intent keyword rules ────────────────────────────────────────────────────
// Rules: arrays of PHRASES. Each phrase is tokenised + stemmed into the
// intent's vocabulary at startup. Only use DISTINCTIVE phrases — avoid
// lone pharmacy-noise words that appear in many intents.
export const INTENT_RULES: Record<string, string[]> = {
  refill: [
    "refill prescription", "renew prescription", "running out",
    "running low", "almost out", "last dose", "need refill",
    "early refill", "refill early", "out of refills", "low on",
    "out of my medication", "getting low", "need more refills",
    // Colloquial slang — matched by phrase evaluator (stop-word safe)
    "hook me up", "my usual", "the usual", "the stash", "my script", "hook it up",
  ],
  tracking: [
    "track order", "track delivery", "delivery status", "where is order",
    "where is package", "order arriving", "delivery tracking",
    "order shipped", "delivery driver", "hasnt arrived", "never arrived",
    "still waiting", "when will arrive", "where are meds",
    "shipment status", "delivery location", "package coming",
  ],
  transfer: [
    "switch pharmacy", "change pharmacy", "transfer from cvs",
    "transfer from walgreens", "transfer from rite aid",
    "from old pharmacy", "move my prescriptions", "move my meds",
    "bring prescriptions here", "switch pharmacies",
    "coming from another pharmacy", "joining concordia",
    "transfer prescriptions here", "new pharmacy for meds",
  ],
  transfer_out: [
    "transfer out", "leave concordia", "leaving concordia",
    "switch away", "going to another pharmacy", "transfer to cvs",
    "transfer to walgreens", "move meds out",
    "different pharmacy for prescriptions",
  ],
  delivery_zones: [
    "deliver to bronx", "deliver to brooklyn", "deliver to manhattan",
    "deliver to queens", "deliver to staten island", "delivery area",
    "delivery zone", "do you deliver here", "can you deliver here",
    "deliver near me", "deliver to my address", "where do you deliver",
    "delivery coverage area",
  ],
  delivery_cost: [
    "delivery fee", "delivery cost", "free delivery", "shipping cost",
    "charge for delivery", "cost to deliver", "free shipping",
    "is delivery free", "delivery price", "how much delivery",
    "no delivery charge",
  ],
  hours: [
    "store hours", "opening hours", "closing time", "open today",
    "pharmacy hours", "hours of operation", "business hours",
    "what time open", "what time close", "when open", "still open",
    "are you open right now",
  ],
  after_hours: [
    "after hours pharmacy", "open at night", "weekend hours",
    "open sunday", "open weekends", "open late", "24 hour pharmacy",
    "night time pharmacy", "open on holiday",
  ],
  location: [
    "pharmacy address", "pharmacy location", "where is concordia",
    "find the pharmacy", "directions to pharmacy",
    "how to get there", "concordia address", "pharmacy directions",
    "where located", "how far away pharmacy",
    // Colloquial slang — matched by phrase evaluator (stop-word safe)
    "where you at", "where are you guys", "your spot", "where are you located",
  ],
  parking: [
    "parking near pharmacy", "park near pharmacy",
    "parking available", "where to park pharmacy",
  ],
  flu_shot: [
    "flu shot", "flu vaccine", "get vaccinated", "flu vaccination",
    "immunization appointment", "schedule vaccine",
    "vaccine booster", "shingles vaccine", "pneumonia vaccine",
    "vaccine appointment", "walk in vaccine", "need vaccine",
    "get immunized", "tdap vaccine", "covid vaccine appointment",
    "schedule immunization",
  ],
  vaccine_records: [
    "vaccination record", "immunization record", "proof of vaccination",
    "vaccination card", "vaccine record", "vaccine card", "shot record",
  ],
  new_rx: [
    "new prescription", "fill prescription", "doctor sent prescription",
    "doctor called in", "new rx", "faxed prescription",
    "fill this script", "get prescription filled",
    "doctor gave prescription", "just got prescription",
    "first time prescription", "start new prescription",
    "my doctor wrote script", "doctor ordered prescription",
  ],
  fill_time: [
    "how long to fill", "wait time prescription",
    "when ready prescription", "how fast ready",
    "how long does fill take",
  ],
  same_day: [
    "same day delivery", "today delivery", "urgent delivery",
    "asap delivery", "rush delivery", "emergency delivery",
    "deliver today", "need today", "same day prescription",
  ],
  blister_pack: [
    "blister pack", "pill pack", "pill organizer", "dose pack",
    "organize medications", "sort meds", "forget doses",
    "memory aid medication", "medication organizer",
    "confusing medication schedule", "help remember doses",
    "dose management", "organized medication pouch",
    "cant remember doses", "forgetting doses",
  ],
  blister_explain: [
    "what is blister pack", "explain blister pack",
    "how blister pack works", "tell me about blister packs",
    "blister pack information", "what blister pack does",
  ],
  insurance_accepted: [
    "accept my insurance", "take my insurance",
    "what insurance accepted", "which insurance plans",
    "in network pharmacy", "is my insurance accepted",
    "do you accept my plan", "insurance coverage pharmacy",
    "tricare pharmacy", "workers comp pharmacy",
  ],
  prior_auth: [
    "prior authorization", "prior auth", "not covered insurance",
    "insurance denied", "insurance rejected",
    "formulary exception", "coverage denied",
    "prescription denied", "medication denied", "claim rejected",
    "prescription rejected", "coverage rejected", "claim denied",
  ],
  formulary: [
    "formulary medication", "drug tier list", "formulary coverage",
    "step therapy", "preferred drug list", "non-formulary",
    "covered under formulary", "formulary exception request",
  ],
  cost: [
    "how much cost", "what is price", "price prescription",
    "afford medication", "too expensive", "how much copay",
    "copay amount", "out of pocket cost", "hsa payment",
    "fsa payment", "how much does it cost",
  ],
  no_insurance: [
    "no insurance", "without insurance", "cash price",
    "uninsured", "out of pocket", "cash pay pharmacy",
    "no health insurance", "self pay", "no coverage",
  ],
  update_insurance: [
    "update insurance", "change insurance",
    "insurance changed", "got new insurance", "update my insurance",
    "new insurance plan", "insurance information update",
  ],
  medicare: [
    "medicare pharmacy", "part d coverage", "medicare prescription",
    "medicare part d", "medicare plan pharmacy",
  ],
  medicaid: [
    "medicaid pharmacy", "medicaid coverage", "fidelis pharmacy",
    "healthfirst pharmacy", "metroplus pharmacy",
    "managed care pharmacy",
  ],
  copay_assist: [
    "copay assistance", "copay card", "manufacturer coupon",
    "patient assistance program", "financial help copay",
    "assistance program prescription",
  ],
  goodrx: [
    "goodrx discount", "singlecare discount", "prescription discount card",
    "rx coupon", "savings card prescription", "drug discount program",
  ],
  side_effects: [
    "side effects", "side effect", "reaction to taking",
    "adverse reaction", "vomiting after taking", "headache after taking",
    "rash after taking", "nausea after taking", "dizziness after taking",
    "swelling after taking", "feeling sick after taking",
  ],
  missed_dose: [
    "missed dose", "forgot to take dose", "skipped dose",
    "double dose", "missed my dose", "took two by accident",
    "what to do missed dose",
  ],
  drug_interaction: [
    "drug interaction", "medication interaction",
    "safe to take together", "can mix medications",
    "contraindication", "interact with each other",
    "take both safely", "combination safe",
  ],
  food_alcohol: [
    "food interaction", "alcohol with medication",
    "take with food", "empty stomach", "grapefruit interaction",
    "wine with medication", "beer with medication",
  ],
  medication_storage: [
    "store medication", "how to store", "refrigerate",
    "room temperature storage", "fridge medication",
    "temperature sensitive storage", "keep refrigerated",
  ],
  disposal: [
    "dispose medication", "expired medication disposal",
    "old medication disposal", "throw away medication",
    "get rid of old meds", "medication take back program",
    "unwanted medication disposal",
  ],
  pill_identifier: [
    "identify pill", "what pill is this", "what medication is this",
    "pill identification", "identify medication",
    "what does pill look like",
  ],
  speak_pharmacist: [
    "speak to pharmacist", "speak with pharmacist",
    "talk to pharmacist", "talk to real person",
    "real person help", "call me back",
    "connect with pharmacist", "human representative",
    "need pharmacist", "speak to someone",
  ],
  order_status: [
    "order status", "is it ready", "check my order",
    "when ready", "notify when ready",
    "prescription ready notification", "order ready pickup",
  ],
  cancel_order: [
    "cancel order", "cancel delivery", "cancel refill",
    "stop delivery", "cancel the order", "want to cancel",
    "cancel medication delivery",
  ],
  auto_refill: [
    "auto refill", "automatic refill", "auto-refill",
    "automatic prescription refill", "recurring refill",
    "never run out", "set up auto refill",
  ],
  rx_history: [
    "prescription history", "medication history",
    "list of prescriptions", "medication records",
    "prescription list", "past medications", "previous prescriptions",
  ],
  sms_updates: [
    "text notification", "text alert prescription",
    "sms notification", "text me when ready",
    "sign up text updates", "text reminders pharmacy",
  ],
  diabetes: [
    "diabetes medication", "diabetic prescription",
    "blood sugar medication", "insulin prescription",
    "glucose monitor", "metformin prescription",
    "diabetes management",
  ],
  weight: [
    "weight loss medication", "ozempic", "wegovy",
    "mounjaro", "semaglutide", "tirzepatide",
    "weight management medication",
  ],
  blood_pressure: [
    "blood pressure medication", "hypertension medication",
    "bp monitor", "blood pressure check",
    "high blood pressure medication",
  ],
  lab_work: [
    "lab test", "blood test pharmacy", "lab work results",
    "cholesterol test", "blood draw pharmacy", "diagnostic test",
  ],
  otc_pain: [
    "pain relief", "pain reliever", "headache medicine",
    "migraine relief", "back pain", "ibuprofen",
    "acetaminophen", "advil", "tylenol", "aspirin",
    "naproxen", "aleve", "motrin", "excedrin",
  ],
  otc_cold: [
    "cold medicine", "cough syrup", "cough medicine",
    "sore throat medicine", "decongestant", "nyquil", "dayquil",
    "mucinex", "robitussin", "theraflu", "stuffy nose medicine",
    "congestion medicine", "cold flu medicine",
  ],
  otc_allergy: [
    "allergy medicine", "allergy relief", "antihistamine",
    "seasonal allergies", "benadryl", "claritin",
    "zyrtec", "allegra", "flonase", "sneezing medicine",
  ],
  otc_dental: [
    "toothpaste", "mouthwash", "dental floss",
    "teeth whitening", "dental products",
    "tooth care products", "whitening strips",
    "dental hygiene products", "dental care products",
    "dental cleaning", "oral hygiene", "oral care", "oral health",
  ],
  otc_digestive: [
    "stomach medicine", "heartburn medicine", "acid reflux medicine",
    "antacid", "gas relief", "bloating medicine",
    "constipation medicine", "diarrhea medicine", "tums",
    "pepto bismol", "imodium", "prilosec", "rolaids",
  ],
  otc_wellness: [
    "vitamins", "supplements", "multivitamin",
    "vitamin c", "vitamin d", "zinc supplement",
    "fish oil", "probiotics", "melatonin",
    "sleep supplement", "immune supplement",
  ],
  otc_skin: [
    "skin cream", "sunscreen", "moisturizer",
    "acne treatment", "eczema cream", "hydrocortisone",
    "neosporin", "bug spray", "insect repellent",
    "dry skin cream", "cortisone cream",
  ],
  grocery: [
    "snacks pharmacy", "groceries pharmacy", "chips pharmacy",
    "candy pharmacy", "juice pharmacy", "grocery items",
    "food items pharmacy", "drinks pharmacy",
  ],
  otc_shop: [
    "over counter products", "otc products", "shop pharmacy",
    "buy pharmacy products", "pharmacy store products",
    "how order products",
  ],
  loyalty: [
    "loyalty points", "reward points", "earn points",
    "loyalty program", "rewards balance", "check points balance",
    "loyalty rewards",
  ],
  app: [
    "concordiacare app", "mobile app", "download app",
    "phone app", "app download concordia", "concordia mobile",
  ],
  signup: [
    "sign up", "create account", "become patient",
    "register patient", "new patient registration",
    "join pharmacy", "enroll patient", "how become patient",
  ],
  ltc: [
    "long term care pharmacy", "long-term care",
    "nursing home pharmacy", "assisted living pharmacy",
    "facility partnership", "memory care pharmacy",
    "rehab center pharmacy",
  ],
  specialty: [
    "specialty medication", "specialty pharmacy",
    "oncology medication", "biologic medication",
    "specialty drug",
  ],
  compounding: [
    "compound medication", "custom medication",
    "compounding pharmacy", "custom compound",
  ],
  covid: [
    "covid test", "rapid test", "antigen test",
    "pcr test", "covid vaccine",
  ],
  birth_control: [
    "birth control", "contraception", "contraceptive",
    "plan b", "morning after pill", "emergency contraception",
  ],
  payment_methods: [
    "apple pay", "google pay", "payment method",
    "how pay", "accepted payments", "venmo payment",
    "contactless payment", "pay with card", "accepted payment options",
  ],
  lost_rx: [
    "lost prescription", "lost medication", "lost meds",
    "stolen prescription", "stolen medication",
    "prescription stolen", "medication stolen",
  ],
  pet_meds: [
    "pet medication", "dog medication", "cat medication",
    "pet prescription", "veterinary pharmacy", "animal medication",
    "vet pharmacy",
  ],
  contact_info: [
    "phone number", "contact pharmacy", "how contact",
    "pharmacy email", "reach pharmacy", "contact information",
  ],
  doctor_referral: [
    "find doctor", "need doctor", "primary care doctor",
    "doctor recommendation", "looking for doctor",
    "dont have doctor", "need physician",
  ],
  caregiver_worry: [
    "caring for parent", "managing parent medication",
    "caregiver pharmacy", "taking care elderly",
    "help parent medication", "medication elderly parent",
  ],
  forgot_password: [
    "forgot password", "reset password", "cant log in",
    "cannot sign in", "cant sign in app", "unable to sign in",
    "sign in problem", "login not working", "locked out account", "login problem",
  ],
  hipaa_privacy: [
    "hipaa", "privacy policy", "medical data privacy",
    "share medical information", "medical privacy",
    "patient privacy", "data privacy",
  ],
  return_refund: [
    "refund", "return medication", "money back",
    "return policy", "exchange", "get refund",
  ],
  generic_rx: [
    "generic medication", "generic alternative", "brand name versus generic",
    "generic version", "cheaper alternative",
    "generic equivalent",
  ],
  smoking: [
    "quit smoking", "stop smoking", "nicotine patch",
    "nicotine gum", "nicorette", "smoking cessation", "chantix",
  ],
  med_sync: [
    "medication sync", "synchronize medications",
    "sync refills", "medication synchronization",
    "all refills once", "refill sync program",
  ],
  mtm: [
    "medication therapy management", "mtm session",
    "medication review", "drug review pharmacist",
    "review medications pharmacist",
  ],
  needles: [
    "insulin syringes", "pen needles", "syringes pharmacy",
    "insulin needles", "insulin pen needles",
  ],
  dme: [
    "durable medical equipment", "dme pharmacy",
    "wheelchair pharmacy", "walker pharmacy",
    "nebulizer pharmacy", "cpap pharmacy",
  ],
  accessibility: [
    "wheelchair accessible", "handicap access pharmacy",
    "ada compliant", "disability access", "accessible entrance",
  ],
  weekend_delivery: [
    "weekend delivery", "saturday delivery", "sunday delivery",
    "holiday delivery", "deliver weekends",
  ],
  complaint: [
    "complaint pharmacy", "bad service", "file complaint",
    "report problem pharmacy", "disappointed service",
    "unhappy service",
  ],
  services: [
    "what services", "what do you offer", "what can help with",
    "pharmacy services", "services provided",
  ],
  about: [
    "about concordia", "concordia history",
    "tell me about concordia", "who is concordia",
    "concordia story",
  ],
  update_profile: [
    "update profile", "change phone number", "change address",
    "update information", "moved new address", "new phone number",
  ],
};

// ── Vocabulary cache (computed once per session) ────────────────────────────
let _vocabCache: Map<string, Set<string>> | null = null;

export function getIntentVocabs(): Map<string, Set<string>> {
  if (_vocabCache) return _vocabCache;
  _vocabCache = new Map();
  for (const [intent, phrases] of Object.entries(INTENT_RULES)) {
    const vocab = new Set<string>();
    for (const phrase of phrases) {
      for (const word of tokenize(phrase)) {
        vocab.add(word);
      }
    }
    _vocabCache.set(intent, vocab);
  }
  return _vocabCache;
}

// ── Tier-1 pre-compiled regex rules ─────────────────────────────────────────
/**
 * High-confidence pattern rules executed as Tier 1 inside detectIntentHybrid.
 * Order matters: transfer_out must precede transfer so outbound signals win.
 * Each value is a pre-compiled RegExp (case-insensitive).
 */
export const REGEX_RULES: Record<string, RegExp> = {
  // Outbound (leave Concordia) — must precede inbound transfer
  transfer_out: /(\b(transfer\s+out|transfer\s+to\s+(cvs|walgreens|rite\s+aid|duane\s+reade|another|a\s+different|a\s+new)|switch\s+away|leave\s+concordia|leaving\s+concordia)\b|going\s+somewhere\s+else\s+(for|with)?\s*(my\s+)?(prescription\w*|meds?\b|rx\b|medication\w*))/i,
  // Inbound (join Concordia from another pharmacy)
  transfer: /\b(move|transfer|switch|bring)\b.{0,40}\b(from\s+(cvs|walgreens|rite\s+aid|duane\s+reade|another|old|current|different)\b|to\s+concordia|to\s+you\b|to\s+here\b|your\s+pharmacy|walgreens|cvs|rite\s+aid)\b/i,
  // Refill / renewal
  refill: /\b(re-?fill|renew|running\s+(low|out)|almost\s+out|out\s+of\s+refills|last\s+(pill|dose)|need\s+(a\s+)?refill|my\s+rx\b|my\s+rxs\b|get\s+my\s+rx\b|pick\s+up\s+my\s+rx\b|rx\s+refill|rxs?\s+ready)\b/i,
  // A prescription the prescriber has newly issued or sent
  new_rx: /\b(?:doctor|provider|prescriber|physician)\b.{0,35}\b(?:sent|called\s+in|wrote|submitted|e-?prescribed)\b.{0,20}\b(?:new\s+)?(?:prescription|script|rx)\b|\b(?:new\s+prescription|new\s+script|new\s+rx)\b/i,
  // Flu / vaccine appointments
  flu_shot: /\b(flu\s+(shot|vaccine|vaccination|immunization|booster)|influenza\s+(shot|vaccine|vaccination)|flu\s+immunization)\b/i,
  // Delivery / order tracking
  tracking: /\b(delivery\s+status|shipment\s+status|track(ing)?\s+(my\s+)?(order|delivery|package|prescription|meds|shipment|medication)|where\s+(is\s+)?my\s+(order|package|prescription|meds|delivery|medication|shipment)|hasn'?t\s+arrived|never\s+arrived)\b/i,
  // Store hours / schedule
  hours: /\b(store\s+hours|pharmacy\s+hours|operating\s+hours|business\s+hours|what\s+time\s+(do\s+you|are\s+you|will\s+you)|when\s+do\s+you\s+(open|close)|when\s+(is|are)\s+you\s+open|are\s+you\s+open|still\s+open|closing\s+time|open\s+today|open\s+right\s+now|open\s+on\s+weekends?|schedule\s+timing|timing\s+schedule)\b/i,
  // Prior authorization
  prior_auth: /\b(prior\s+auth(orization)?|pa\s+approval|not\s+covered|insurance\s+(denied|rejected|approval|denial)|coverage\s+(denied|rejected|denial)|(insurance|claim|coverage|prescription|medication)\s+appeal|(prescription|medication|claim)\s+(denied|rejected|denial))\b/i,
  // Order readiness
  order_status: /\b(order\s+status|is\s+it\s+ready|prescription\s+status|when\s+(is\s+it|will\s+it\s+be)\s+ready|notify\s+me\s+when\s+ready|text\s+me\s+when)\b/i,
  // Same-day / urgent
  same_day: /\b(same[- ]day|urgent\s+delivery|asap\s+(delivery|refill)|rush\s+(delivery|order)|deliver\s+today|need\s+it\s+today)\b/i,
  // Contact details
  contact_info: /\b(phone\s+number|contact\s+(number|info)|how\s+(do\s+i|to)\s+(reach|contact)|your\s+(email|fax))\b/i,
};

// ── Negation guard constants ─────────────────────────────────────────────────
/**
 * Carves out interrogative contractions from the negation guard so that
 * questions ("can't I get a refill?", "won't you transfer my script?") are
 * never misclassified as cancellation intents.
 */
export const INTERROGATIVE_NEGATION_RX =
  /\b(can't|cant|won't|wont|don't|dont)\s+(i|you|we)\b/i;

/**
 * Raw-text negation pattern. Applied to the lowercased original string BEFORE
 * tokenization because the tokenizer's /[^a-z0-9\s]/g → " " replacement
 * destroys "don't" into ["don","t"] (both filtered), while STOP_WORDS removes
 * "not" and "no", leaving them invisible to any token-set scan.
 *
 * "not" and "no" are intentionally omitted here: they are already caught by
 * the Tier-1 REGEX_RULES (e.g. "not covered" → prior_auth) and are too
 * context-free to suppress an entire intent safely as standalone words.
 */
const NEGATION_RX =
  /\b(never|stop|cancel|refuse|without|avoid|prevent|halt|don't|dont|won't|wont|can't|cant|didn't|didnt|cannot|couldn't|couldnt|shouldn't|shouldnt|wouldn't|wouldnt)\b/i;

// ── Levenshtein + Overlap Coefficient primitives ──────────────────────────────

/**
 * Wagner-Fischer Levenshtein distance using two-row Int32Array allocation
 * and an early-exit when the minimum value in a row already exceeds maxEdits.
 *
 * The shorter string is always used as the row dimension to minimise
 * memory allocations.
 */
export function levenshteinDistance(a: string, b: string, maxEdits?: number): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep shorter string as row dimension
  if (a.length > b.length) [a, b] = [b, a];

  const m = a.length;
  const n = b.length;

  // Fast-reject: length delta alone exceeds the allowed edit budget
  if (maxEdits !== undefined && n - m > maxEdits) return maxEdits + 1;

  let prevRow = new Int32Array(m + 1);
  let currRow = new Int32Array(m + 1);

  for (let i = 0; i <= m; i++) prevRow[i] = i;

  for (let j = 1; j <= n; j++) {
    currRow[0] = j;
    let minInRow = currRow[0];

    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,        // deletion
        currRow[i - 1] + 1,    // insertion
        prevRow[i - 1] + cost  // substitution
      );
      if (currRow[i] < minInRow) minInRow = currRow[i];
    }

    // Early exit: every path through remaining rows exceeds the budget
    if (maxEdits !== undefined && minInRow > maxEdits) return maxEdits + 1;

    // Swap rows in-place (reuse allocations)
    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }

  return prevRow[m];
}

/**
 * Length-scaled maximum permissible Levenshtein edit distance:
 *   < 4 chars  → 0  (no edits — prevents "not" ↔ "note" false matches)
 *   4–7 chars  → 1  (one insertion / deletion / substitution)
 *   ≥ 8 chars  → 2  (two edits for long words like "atorvastatin")
 */
export function getAllowedEdits(word: string): number {
  if (word.length < 4) return 0;
  if (word.length <= 7) return 1;
  return 2;
}

const NON_NAME_SELF_DESCRIPTIONS = new Set([
  "good", "fine", "well", "okay", "ok", "sick", "here", "ready", "looking",
  "trying", "interested", "having", "feeling", "not", "just", "calling",
]);

/**
 * Extracts a single first name only when the user explicitly volunteers it.
 * This is conversational context, never verified identity.
 */
export function extractVoluntaryFirstName(text: string): string | null {
  const match = text.match(
    /\b(?:my name is|call me|i am|i'm|im|me llamo|puedes llamarme|soy)\s+([\p{L}][\p{L}'-]{1,29})(?=\s|[.,!?]|$)/iu,
  );
  if (!match) return null;

  const candidate = match[1].toLocaleLowerCase();
  if (NON_NAME_SELF_DESCRIPTIONS.has(candidate)) return null;

  return candidate
    .split(/(['-])/)
    .map((part) => /^[a-záéíóúüñ]/i.test(part)
      ? part.charAt(0).toLocaleUpperCase() + part.slice(1)
      : part)
    .join("");
}

/**
 * Counts how many query tokens fuzzy-match at least one vocab token within
 * the length-scaled Levenshtein budget.  Used in Tier-2 scoring in place of
 * the exact vocab.has(w) inner loop to handle typos and phonetic variants
 * ("transfur" → "transfer", "prier" → "prior").
 */
export function fuzzyIntersectionSize(
  queryTokens: Set<string>,
  vocab: Set<string>
): number {
  let count = 0;
  for (const qToken of queryTokens) {
    const maxEdits = getAllowedEdits(qToken);
    let matched = false;
    for (const vToken of vocab) {
      if (levenshteinDistance(qToken, vToken, maxEdits) <= maxEdits) {
        matched = true;
        break;
      }
    }
    if (matched) count++;
  }
  return count;
}

/**
 * Overlap Coefficient: |A ∩ B| / min(|A|, |B|).
 *
 * Better than Jaccard for short queries against large vocabularies because
 * a fully-matched short query scores 1.0 rather than being penalised by the
 * large vocab size in the union denominator.
 */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const token of a) {
    if (b.has(token)) matches++;
  }
  return matches / Math.min(a.size, b.size);
}

// ── Jaccard similarity (pure set metric, exported for testing) ───────────────
/**
 * Classic Jaccard score: |A ∩ B| / |A ∪ B|.
 * Useful for unit tests; detectIntentHybrid uses query-coverage internally.
 */
export function jaccardScore(querySet: Set<string>, keywordSet: Set<string>): number {
  if (querySet.size === 0 || keywordSet.size === 0) return 0;
  let intersection = 0;
  for (const token of querySet) {
    if (keywordSet.has(token)) intersection++;
  }
  const unionSize = querySet.size + keywordSet.size - intersection;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

/**
 * Detects a compound request that combines a prescription transfer with
 * browsing or buying nonprescription/store items. This deliberately uses
 * operational phrases only: medication names, dates, and identifiers are
 * never needed to route this handoff.
 */
export function detectCompoundIntent(text: string): "transfer_and_shop" | null {
  const raw = (text ?? "").toLowerCase();
  if (!raw.trim()) return null;
  const transfer = /\b(?:transfer|switch|move|bring)\b[\s\S]{0,80}\b(?:prescription|prescriptions|rx|meds?|medications?)\b|\b(?:prescription|prescriptions|rx|meds?|medications?)\b[\s\S]{0,80}\b(?:transfer|switch|move|bring)\b|\b(?:from|at)\s+(?:another|old|current|different)\s+pharmacy\b/.test(raw);
  const shop = /\b(?:otc|over[\s-]?the[\s-]?counter|nonprescription|store|shop|browse|buy|purchase|store\s+items?|products?|supplements?|vitamins?)\b/.test(raw);
  return transfer && shop ? "transfer_and_shop" : null;
}

// ── Hybrid intent engine ─────────────────────────────────────────────────────
/**
 * Two-tier intent detection:
 *   Tier 1 – pre-compiled REGEX_RULES (O(n) fast short-circuit)
 *   Tier 2 – query-coverage scoring across INTENT_RULES vocabularies
 *
 * Returns an intent string. Falls back to "general" when nothing scores
 * above the threshold or has fewer than 2 matching tokens.
 *
 * Replaces the sequential lower.includes() chain in chat-widget.tsx.
 */
export function detectIntentHybrid(text: string): string {
  if (!text?.trim()) return "general";

  const rawLower = text.toLowerCase();

  // Explicit refusal/cancellation of an intent must win before any positive
  // command rule. These phrases should prompt clarification, never launch an
  // action the user just declined.
  if (/\b(?:do not|don't|dont|no)\s+(?:want|need|ask(?:ing)? for)?\s*(?:a\s+)?(?:store\s+)?(?:refill|pickup|delivery|transfer|signup|sign(?:\s+me)?\s+up|tracking)\b/.test(rawLower) ||
      /\b(?:stop|cancel)\s+(?:the\s+)?(?:automatic|auto)?\s*refill\b/.test(rawLower) ||
      /\b(?:never asked for|not asking to)\b/.test(rawLower)) return "general";

  // Spanish has its own conservative rule set. Run it before the
  // English tokenizer (which intentionally removes many short function
  // words), while preserving the English-facing intent names.
  if (isSupportedSpanishMessage(text)) {
    const spanishIntent = detectSpanishIntent(text);
    if (spanishIntent === "emergency") return "general";
    if (spanishIntent !== "spanish" && spanishIntent !== "unreadable") return spanishIntent;
  }

  // A symptom plus an explicit request for nonprescription help can route to
  // the OTC category without offering diagnosis or treatment advice.
  if (/\b(?:headache|migraines?|migranes?|pain|ache|aches|sore|soreness|joint|knee|back|muscle)\b/.test(rawLower) && isExplicitOtcRequest(text)) {
    return "otc_pain";
  }

  // High-confidence conversation controls must outrank overlap scoring and
  // generic negation handling.
  if (/\bflu[\s-]*shot\b/.test(rawLower)) return "flu_shot";
  if (/\b(?:can(?:not|'t)|cant|unable to|trouble|problem|issues?)\b.*\b(?:sign in|log in|login)\b/.test(rawLower) ||
      /\b(?:sign in|log in|login)\b.*\b(?:problem|trouble|issue|not working|failed)\b/.test(rawLower)) return "forgot_password";
  if (/\b(?:without|no)\s+(?:health\s+)?insurance\b/.test(rawLower)) return "no_insurance";
  if (/\b(?:update|change)\s+my\s+(?:phone|email|address|profile|contact)\b/.test(rawLower)) return "update_profile";
  if (/\b(?:speak|talk)\s+to\s+(?:a\s+)?pharmacist\b/.test(rawLower)) return "speak_pharmacist";
  if (/\b(?:auto|automatic)\s*refill\b/.test(rawLower)) return "auto_refill";
  if (/\b(?:text|sms)\s+me\b.*\b(?:ready|update|status|delivery)\b/.test(rawLower)) return "sms_updates";
  if (/\b(?:nicotine\s+(?:patch(?:es)?|gum|lozenges?)|quit smoking|stop smoking)\b/.test(rawLower)) return "smoking";
  if (/\b(?:store|curbside|in[\s-]?person|drive[\s-]?thr(?:u|ough))\s+pickup\b|\bpickup instead of delivery\b|\bpick\s+it\s+up\b|\bcollect\s+my\s+order\b|\b(?:come in|come into the pharmacy|stop by|swing by)\s*(?:for\s+it)?\b|\bget it in person\b/.test(rawLower)) return "pickup";
  if (/\b(?:show|see|display|open|view|take me to)\b.{0,35}\b(?:my\s+)?(?:current\s+)?(?:medications?|prescriptions?|rx details?|patient account|private profile|patient records?|account)\b|\bmy medication list\b|\bopen concordiacare\b|\bmy patient records\b/.test(rawLower)) return "app";
  if (/\b(?:hipaa|medical data|health information|patient information|health records?|prescriptions?|my information).{0,30}\b(?:privacy|private|protected|confidential|secure|compliant)\b|\b(?:privacy|protect|secure).{0,30}\b(?:medical|health|patient|prescription|information|data|records?)\b/.test(rawLower)) return "hipaa_privacy";
  if (/\b(?:accept|take|work with|bill|use).{0,25}\b(?:insurance|aetna|bluecross|health plan|coverage)\b|\b(?:insurance|plans?)\s+(?:accepted|do you take)\b|\bin[\s-]?network\b|\bi have coverage\b/.test(rawLower)) return "insurance_accepted";
  if (/\b(?:over[\s-]the[\s-]counter|nonprescription|otc)\b.{0,30}\b(?:products?|items?|shop|buy|browse)\b|\b(?:open|browse|find something in)\s+(?:the\s+)?(?:online\s+)?(?:shop|pharmacy store)\b|\b(?:products?|items?)\s+for\s+sale\b|\bbuy vitamins\b|\bcarry sunscreen\b/.test(rawLower)) return "otc_shop";
  if (/\bpharmacy schedule\b/.test(rawLower)) return "hours";
  if (/\b(?:where is|where's)\s+(?:the\s+)?(?:your\s+)?(?:store|pharmacy|location|address)\b|\b(?:what is|what's)\s+(?:the\s+)?(?:your\s+)?(?:location|address)\b|\b(?:pharmcy|pharmacy)\s+adress\b|\bexact address\b|\bnear east tremont\b|\bhow do i get there\b|\byour location\b/.test(rawLower)) return "location";
  if (/\b(?:send|deliver)\s+(?:it|meds?|medications?)\s+to\s+(?:my\s+)?(?:home|house|address)\b|\bhome delivery\b|\bdelivery (?:coverage|zone|area)\b|\bdeliver (?:in|to|near)\b/.test(rawLower)) return "delivery_zones";
  if (/\b(?:move|send|transfer)\b.{0,35}\b(?:prescriptions?|meds?|rx)\b.{0,25}\b(?:out|to\s+(?:cvs|walgreens|rite aid|another|a different))\b|\b(?:leave|leaving)\s+concordia\b|\bswitch away\b|\bgoing somewhere else\b|\banother pharmacy to fill my meds\b/.test(rawLower)) return "transfer_out";
  if (isInboundTransferRequest(text)) return "transfer";
  if (/\b(?:real person|human help|representative)\b|\b(?:connect|talk)\s+(?:me\s+)?(?:to|with)\s+(?:(?:your|a)\s+)?(?:someone|pharmacist)\b|\bpharmacist (?:asap|call)\b|\bside effect question\b|\bmedicine safety question\b/.test(rawLower)) return "speak_pharmacist";
  if (/\b(?:forgot (?:my )?password|reset (?:my )?password|locked out|can't access my account|cant access my account)\b/.test(rawLower)) return "forgot_password";
  if (/\b(?:what are your hours|r u open rn|opening hrs|pharmacy schedule)\b/.test(rawLower)) return "hours";
  if (/\b(?:refil my prescripshun|get my medication again)\b/.test(rawLower)) return "refill";
  if (/\b(?:when will my medicine arrive|where are my meds|trackin my perscription delivery)\b/.test(rawLower)) return "tracking";
  if (/\bconcordia request my scripts\b/.test(rawLower)) return "transfer";
  if (/\b(?:appeal the denial|rx needs insurance approval)\b/.test(rawLower)) return "prior_auth";
  if (/\bsign me up\b/.test(rawLower)) return "signup";

  // Common Spanish operational variants that are safe to resolve without
  // falling back to broad Spanish-language help.
  if (/\b(?:resurtir|resurtido|rellenar|relleno|renovar|renovaci[oó]n)\b.{0,35}\b(?:receta|medicamento)|\breceta\b.{0,25}\b(?:resurtir|renovar|renovaci[oó]n)\b|\bya casi no tengo\b.{0,20}\bpastillas\b|\bm[aá]s medicina de mi receta\b/.test(rawLower)) return "refill";
  if (/\b(?:d[oó]nde est[aá]|rastrear|estado de|esperando|ya enviaron)\b.{0,30}\b(?:pedido|entrega|paquete)|\b(?:pedido|entrega|paquete)\b.{0,30}\b(?:no ha llegado|tarde|llega)\b|\bcu[aá]ndo llega mi medicina\b/.test(rawLower)) return "tracking";

  // ── Phone-transfer context guard ─────────────────────────────────────────
  // When "transfer" co-occurs with phone-routing vocabulary the user almost
  // certainly wants a telephone transfer, not a prescription transfer.
  // Setting this flag suppresses the transfer intent in both Tier-1 and
  // Tier-2 so the query falls through to "general" instead of routing the
  // patient into the prescription-intake workflow.
  const hasPhoneContext =
    /\b(phone|call|voicemail|line)\b/i.test(rawLower) &&
    /\btransfer\b/i.test(rawLower);

  // ── Negation Guard (raw-text scan, before tokenisation) ─────────────────
  // Must run on the original string: the tokeniser's /[^a-z0-9\s]/g → " "
  // replacement destroys "don't" → ["don","t"] (both filtered out), and
  // STOP_WORDS removes "not"/"no", so a token-set scan would silently miss
  // all three of the most common English negation forms.
  //
  // Interrogative carve-out fires first so that questions like
  // "can't I get a refill?" are NOT suppressed.
  const negationDetected =
    !INTERROGATIVE_NEGATION_RX.test(rawLower) &&
    NEGATION_RX.test(rawLower);
  if (negationDetected) return "general";

  if (!/\b(?:flu|vaccine|vaccination|shot|booster|gripe|vacuna)\b/.test(rawLower) &&
      (/\b(?:book|schedule|make|set up|need|want)\b.{0,24}\b(?:an?\s+)?appointment\b|\bappointment\b.{0,24}\b(?:book|schedule|available|availability)\b|\b(?:programar|hacer|necesito|quiero)\b.{0,24}\b(?:una\s+)?cita\b|\bcita\b.{0,24}\b(?:disponible|programar|reservar)\b/.test(rawLower))) {
    return "appointment";
  }
  if (/\b(?:confirm|check|verify)\b.{0,20}\b(?:my\s+)?order\b|\b(?:is|was)\s+my\s+order\s+(?:confirmed|accepted|received)\b|\b(?:confirmar|revisar|verificar)\b.{0,20}\bmi\s+pedido\b/.test(rawLower)) {
    return "tracking";
  }

  // Narrow, high-confidence typo recovery for core fulfillment actions runs
  // only after cancellation, workflow-specific, and negation controls.
  if (/\b(?:auto|automatic)\s*refil+\b/.test(rawLower)) return "auto_refill";
  if (/\brefil+\b/.test(rawLower)) return "refill";
  if (/\bdeliv(?:ary|erry|ry)\b/.test(rawLower)) return "delivery";
  if (/\bpickkup\b/.test(rawLower)) return "pickup";

  // ── Tier 1: regex ──────────────────────────────────────────────────────
  for (const [intent, regex] of Object.entries(REGEX_RULES)) {
    if (regex.test(text)) {
      // Phone-context guard: if the transfer regex fired but the message
      // contains phone/call/voicemail/line, the user wants a telephone
      // transfer — fall through rather than misrouting them.
      if (intent === "transfer" && hasPhoneContext) continue;
      return intent;
    }
  }

  // ── Slang phrase evaluator ────────────────────────────────────────────────
  // Runs on the raw lowercased string BEFORE tokenisation so that stop-word
  // stripping cannot destroy multi-word colloquial phrases like "hook me up"
  // or "where you at".  Only multi-word INTENT_RULES entries are tested here;
  // single-token slang falls through to Tier-2 as usual.
  for (const [intent, keywords] of Object.entries(INTENT_RULES)) {
    if (intent === "transfer" && hasPhoneContext) continue;
    for (const kw of keywords) {
      if (!kw.includes(" ")) continue; // single-token handled by Tier-2
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(rawLower)) {
        return intent;
      }
    }
  }

  // ── Tier 2: Overlap Coefficient scoring with fuzzy intersection ─────────
  const queryWords = tokenize(text);
  // Too short to reliably clear the minIntersection=2 guard below
  if (queryWords.size < 2) return "general";

  const vocabs = getIntentVocabs();
  let bestIntent = "general";
  let bestScore = 0;
  let bestIntersection = 0;

  for (const [intent, vocab] of vocabs) {
    if (intent === "transfer" && hasPhoneContext) continue; // phone-context guard
    const fIntersection = fuzzyIntersectionSize(queryWords, vocab);
    if (fIntersection === 0) continue;

    // Overlap Coefficient computed from the fuzzy intersection count
    const score = fIntersection / Math.min(queryWords.size, vocab.size);

    if (score > bestScore || (score === bestScore && fIntersection > bestIntersection)) {
      bestScore = score;
      bestIntersection = fIntersection;
      bestIntent = intent;
    }
  }

  // Require ≥ 2 matching tokens AND score ≥ 0.35 to prevent lucky
  // single-word hits (e.g. "running late" should not fire "refill").
  if (bestScore >= 0.35 && bestIntersection >= 2 && bestIntent !== "general") {
    return bestIntent;
  }
  return "general";
}

// ── Legacy single-intent export ──────────────────────────────────────────────
/**
 * Returns the best-matching intent string, or null if no intent scores
 * above the threshold.  Designed to be called as a fallback when the
 * exact-match Tier-1 chain in detectIntent() returns "general".
 */
export function detectIntentByJaccard(text: string): string | null {
  const queryWords = tokenize(text);
  // Too short to score reliably — let the caller fall through to "general"
  if (queryWords.size < 2) return null;

  const vocabs = getIntentVocabs();

  let bestIntent: string | null = null;
  let bestScore = 0;
  let bestIntersection = 0;

  for (const [intent, vocab] of vocabs) {
    let intersection = 0;
    for (const w of queryWords) {
      if (vocab.has(w)) intersection++;
    }
    if (intersection === 0) continue;

    const score = intersection / queryWords.size;

    if (score > bestScore || (score === bestScore && intersection > bestIntersection)) {
      bestScore = score;
      bestIntent = intent;
      bestIntersection = intersection;
    }
  }

  const MIN_SCORE = 0.35;
  // Require 2 matching words for longer queries (prevents lucky single-word hits)
  const minIntersection = queryWords.size > 3 ? 2 : 1;

  if (bestScore >= MIN_SCORE && bestIntersection >= minIntersection && bestIntent) {
    return bestIntent;
  }
  return null;
}

/** Detects an explicit request to keep the conversation in English. */
export function isEnglishLanguagePreference(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:just |only )?english(?: only)?(?: please)?$/.test(normalized) ||
    /\b(?:speak|continue|reply|respond|talk|keep it|use)\s+(?:in\s+)?english\b/.test(normalized) ||
    /\b(?:no|not|don t use|do not use)\s+spanish\b/.test(normalized);
}

/** Detects an explicit request to continue the conversation in Spanish. */
export function isSpanishLanguagePreference(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:solo |solamente )?(?:español|spanish)(?: por favor)?$/.test(normalized) ||
    /\b(?:habla|continua|continúe|responde|contestame|contéstame|speak|continue|reply|respond|talk|use)\s+(?:in\s+|en\s+)?(?:spanish|español)\b/.test(normalized);
}

export type ConversationLanguage = "en" | "es" | "mixed";

/** Detects each turn independently while preserving the prior language for neutral replies. */
export function detectConversationLanguage(
  text: string,
  previous: ConversationLanguage = "en",
): ConversationLanguage {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (isEnglishLanguagePreference(text)) return "en";
  if (isSpanishLanguagePreference(text)) return "es";

  const words = normalized.split(/\s+/).filter(Boolean);
  const spanishSignals = new Set([
    "necesito", "quiero", "puedo", "puede", "ayuda", "receta", "recetas",
    "medicina", "medicamento", "medicamentos", "pastilla", "pastillas", "seguro",
    "entrega", "domicilio", "resurtido", "relleno", "farmacia", "gracias",
    "hola", "por", "favor", "cuando", "donde", "cuanto", "cuánto", "español",
    "ayudar", "mi", "mis",
  ]);
  const englishSignals = new Set([
    "need", "want", "help", "prescription", "prescriptions", "medication",
    "medications", "medicine", "refill", "refills", "delivery", "pickup",
    "insurance", "pharmacy", "thanks", "hello", "when", "where", "how",
    "please", "english", "can",
  ]);
  const spanishCount = words.filter((word) => spanishSignals.has(word)).length;
  const englishCount = words.filter((word) => englishSignals.has(word)).length;

  if (spanishCount > 0 && englishCount > 0) return "mixed";
  if (spanishCount > 0 || /[áéíóúüñ¿¡]/i.test(text)) return "es";
  if (englishCount > 0) return "en";
  return previous;
}

/** Detects account creation, including common short typed abbreviations. */
export function isSignupRequest(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\b(?:sign\s*up|signup|register|enroll|become (?:a )?patient|join (?:the )?pharmacy)\b/.test(normalized) ||
    /\b(?:create|make|open|start|need|want)(?:\s+\w+){0,4}\s+(?:an?\s+)?(?:account|acct|acc|accout)\b/.test(normalized);
}

/** Flags very short numeric/noise input without rejecting ordinary greetings. */
export function isUnreadableShortMessage(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (/^\d{1,8}$/.test(normalized)) return true;
  const words = normalized.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 2 && !["hi", "ok", "no", "yo"].includes(words[0])) {
    return true;
  }
  if (words.length >= 2 && words.length <= 4 && words.every((word) => word.length <= 3)) {
    const recognizedShortWords = new Set(["i", "me", "my", "we", "you", "u", "hi", "hey", "ok", "yes", "no", "do", "to", "a", "an", "is", "it", "of", "in", "on", "for", "can", "not"]);
    return words.some((word) => !recognizedShortWords.has(word));
  }
  return false;
}

/** Detects short medication fragments that need a focused clarification. */
export function isMedicationContextFragment(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:med|meds|medicine|medicines|medication|medications|prescription|prescriptions|rx|medicina|medicinas|medicamento|medicamentos|receta|recetas|pastilla|pastillas)$/.test(normalized);
}

/** Detects a short, generic request for prescription medication help. */
export function isMedicationHelpRequest(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bneds\b/g, "meds")
    .replace(/\bmedecina\b/g, "medicina")
    .replace(/\bperscriptions?\b/g, (word) => word.endsWith("s") ? "prescriptions" : "prescription");
  const medicationNoun = "(?:meds?|medicine|medications?|prescriptions?|rx|medicinas?|medicamentos?|recetas?|pastillas?)";
  return isMedicationContextFragment(normalized) ||
    new RegExp(`^(?:my|the|mi|mis|la|las|el|los)\\s+${medicationNoun}$`).test(normalized) ||
    new RegExp(`^(?:i\\s+)?(?:want|need|get|give\\s+me|help\\s+me\\s+with|(?:want|need)\\s+help\\s+with)(?:\\s+my|\\s+some|\\s+the)?\\s+${medicationNoun}$`).test(normalized) ||
    new RegExp(`^(?:(?:yo\\s+)?(?:quiero|necesito)|dame|ayudame\\s+con|ayúdame\\s+con)(?:\\s+mi|\\s+mis|\\s+una?|\\s+algo\\s+de)?\\s+${medicationNoun}$`).test(normalized) ||
    new RegExp(`^(?:una?|algo)(?:\\s+de)?\\s+${medicationNoun}$`).test(normalized);
}

/** Handles ordinary check-ins without treating them as an unknown request. */
export function isSmallTalkCheckIn(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return /^(?:so\s+)?how\s+(?:are|r)\s+(?:you|u)(?:\s+doing)?(?:\s+today)?$/.test(normalized) ||
    /^(?:what\s+s|what\s+is|whats)\s+up$/.test(normalized);
}

/** True when a short follow-up supplies an appointment day/date without restating the service. */
export function isAppointmentDateFragment(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return /^(?:(?:for|on)\s+)?(?:(?:(?:this|next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:this|next)\s+week)?|today|tomorrow)(?:\s+(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|morning|afternoon|evening))?$/.test(lower) ||
    /^(?:(?:for|on)\s+)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(lower);
}

/** True when a user with an active flu-shot task says they cannot use the scheduler. */
export function isFluSchedulingAssistanceFollowUp(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const asksBotToDoIt = /\b(?:do it for me|book it for me|schedule it for me|make (?:the|my) appointment|you do it)\b/.test(normalized);
  const cannotComplete = /\b(?:i can(?:not|'t)|i cant|unable to|won't work|doesn't work|doesnt work|need help)\b/.test(normalized);
  return asksBotToDoIt || cannotComplete;
}

/** True only when the user explicitly asks for an OTC product or symptom relief. */
export function isExplicitOtcRequest(text: string): boolean {
  const normalized = text.toLowerCase();
  const asksForPhysicalPainRelief =
    /\b(?:something|anything)\b[\s\S]{0,80}\b(?:help(?:s)?|ease(?:s)?|relieve(?:s)?|reduce(?:s)?|make(?:s)?)\b[\s\S]{0,80}\b(?:pain|ache|aches|sore|soreness|joint|knee|back|muscle)\b/.test(normalized) ||
    /\b(?:something|anything)\s+(?:to\s+)?(?:help(?:s)?|ease(?:s)?|relieve(?:s)?|reduce(?:s)?)\b[\s\S]{0,80}\b(?:pain|ache|aches|sore|soreness|joint|knee|back|muscle)\b/.test(normalized);
  return /\b(?:otc|over[\s-]the[\s-]counter|nonprescription|what can i (?:take|use|buy)|what should i (?:take|use|buy)|recommend|suggest|medicine for|medication for|remedy for|relief for|something for|do\s+(?:you|u)\s+(?:have|carry|sell)|looking for|need (?:a |some )?(?:medicine|medication|relief|product)|busco|qué puedo (?:tomar|usar|comprar)|que puedo (?:tomar|usar|comprar)|recomienda|sugiere|medicina para|algo para|necesito (?:jarabe|medicina|medicamento|algo|producto)|tienen?|tienen algo|tiene algo)\b/.test(normalized) ||
    /\b(?:headache|migraines?|migranes?|cough|cold|allerg(?:y|ies)|heartburn|constipation|pain)\s+(?:meds?|medicine|medication|remedy|relief)\b/.test(normalized) ||
    asksForPhysicalPainRelief;
}

/** Extracts a safe, non-diagnostic symptom label for an OTC response. */
export function extractOtcPainSymptom(text: string): string | null {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const phrase = normalized.match(/\b(?:knee|back|joint|muscle|neck|tooth)\s+(?:pain|ache|aches)\b/);
  if (phrase) return phrase[0];
  if (/\bheadaches?\b/.test(normalized)) return "headache";
  if (/\bmigraines?\b/.test(normalized)) return "migraine";
  return null;
}

/**
 * Recognizes an inbound prescription transfer even when the user describes
 * the destination conversationally ("get my meds from here, not my old
 * pharmacy"). This is routing only; the secure transfer form still collects
 * the request and staff confirms it.
 */
export function isInboundTransferRequest(text: string): boolean {
  const lower = text.toLowerCase();
  const hasMedication = /\b(?:prescriptions?|scripts?|rx|meds?|medications?|medicine)\b/.test(lower);
  const hasConcordiaDestination = /\b(?:here|concordia|this pharmacy|your pharmacy)\b/.test(lower);
  const hasPreviousPharmacy = /\b(?:old|current|former|previous|another|different)\s+pharmacy\b/.test(lower) ||
    /\bfrom\s+(?:cvs|walgreens|rite aid|duane reade|walmart|costco)\b/.test(lower) ||
    /\b(?:not|instead of|rather than)\b.{0,24}\b(?:old|current|former|previous)\s+pharmacy\b/.test(lower);
  const hasInboundAction = /\b(?:get|fill|move|bring|transfer|switch|start)\b/.test(lower) ||
    /\bfrom\s+here\b/.test(lower);
  return hasMedication && hasConcordiaDestination && hasPreviousPharmacy && hasInboundAction;
}

/** Controlled-substance requests must never reach product matching or availability claims. */
export function isControlledSubstanceRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(?:controlled substances?|controlled medications?|narcotics?|opioids?|oxycodone|hydrocodone|adderall|ritalin|xanax|klonopin|ativan|valium|ambien|alprazolam|clonazepam|lorazepam|diazepam|zolpidem|sustancias? controladas?|medicamentos? controlados?|narc[oó]ticos?|opioides?)\b/.test(lower);
}

/** Recognizes common clinical language without attempting diagnosis. */
export function hasClinicalTermOrDiagnosis(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(?:diagnos(?:is|ed|es|tic)|condition|symptom|icd(?:-?10)?|a1c|hba1c|systolic|diastolic|hyperglyc(?:emia|emic)|hypoglyc(?:emia|emic)|neuropathy|edema|gerd|uri|uti|copd|diabetes|diabetic|hypertension|high blood pressure|blood pressure is high|hypotension|low blood pressure|asthma|arthritis|migraine|headache|fever|cough|sore throat|congestion|runny nose|allerg(?:y|ies)|heartburn|acid reflux|constipation|diarrhea|nausea|rash|eczema|back pain|joint pain|gout|high cholesterol|thyroid disease|kidney disease|renal disease|liver disease|hepatic disease|depression|anxiety|infection|diagnóstico|diagnosticado|síntoma|sintoma|diabetes|hipertensión|hipertension|presión alta|presion alta|presión baja|presion baja|asma|artritis|migraña|migrana|dolor de cabeza|fiebre|tos|dolor de garganta|congestión|congestion|alergia|acidez|reflujo|estreñimiento|estrenimiento|diarrea|náusea|nausea|sarpullido|eczema|dolor de espalda|dolor articular|gota|colesterol alto|tiroides|enfermedad renal|enfermedad hepática|depresión|depresion|ansiedad|infección|infeccion)\b/.test(normalized);
}

/** Topic-level Spanish routing used before the English hybrid engine. */
export function detectSpanishIntent(text: string): string {
  const lower = text.toLowerCase();
  if (isUnreadableShortMessage(text)) return "unreadable";
  if (/\b(?:emergencia(?: m[eé]dica)?|sobredosis|no puedo respirar|dolor (?:en el )?pecho|reacci[oó]n al[eé]rgica|convulsi[oó]n|inconsciente)\b/.test(lower) ||
      /(?:cara|labios|lengua|garganta).*(?:hinchando|hinchada|hinchado)/.test(lower)) return "emergency";
  if (/\bno (?:quiero|deseo).*\bcancelar\b/.test(lower)) return "general";
  if (/\b(?:crear una cuenta|registrarme|ser paciente)\b/.test(lower)) return "signup";
  if (/\b(?:renovar|resurtir|relleno).*\breceta\b|\breceta.*\b(?:renovar|resurtir|relleno)\b/.test(lower)) return "refill";
  if (/\breceta nueva\b|\bm[eé]dico envi[oó] una receta\b/.test(lower)) return "new_rx";
  if (/\btransferir\b.*\breceta/.test(lower)) return "transfer";
  if (/\bcancelar\b.*\b(?:entrega|pedido|receta)\b/.test(lower)) return "cancel_order";
  if (/d[oó]nde est[aá] mi pedido|estado de (?:mi |la )?(?:pedido|entrega)|(?:pedido|entrega).*(?:no ha llegado|rastrear)|(?:no ha llegado|rastrear).*(?:pedido|entrega)/.test(lower)) return "tracking";
  if (/\b(?:listo|lista) para recoger\b/.test(lower)) return "order_status";
  if (/\bentrega (?:es )?gratis\b|\bcosto de (?:la )?entrega\b/.test(lower)) return "delivery_cost";
  if (/\b(?:necesito|quiero|solicitar|programar|hacer).{0,20}\b(?:una )?entrega\b|\bentrega a domicilio\b/.test(lower)) return "delivery_zones";
  if (/\b(?:horario|a qu[eé] hora|cu[aá]ndo (?:abre|cierra))\b/.test(lower)) return "hours";
  if (/\b(?:d[oó]nde (?:est[aá]n|queda|quedan|se ubica)|ubicaci[oó]n|direcci[oó]n)\b/.test(lower)) return "location";
  if (/\b(?:cambiar|actualizar).*(?:tel[eé]fono|correo|direcci[oó]n|perfil)/.test(lower)) return "update_profile";
  if (/\b(?:n[uú]mero de tel[eé]fono|tel[eé]fono|contactar|llamar)\b/.test(lower)) return "contact_info";
  if (/\b(?:aceptan?|acepta).*\bseguro\b/.test(lower)) return "insurance_accepted";
  if (/\bseguro\b.*(?:rechaz[oó]|deneg[oó]|no cubre)|autorizaci[oó]n previa/.test(lower)) return "prior_auth";
  if (/\b(?:sin seguro|no tengo seguro)\b/.test(lower)) return "no_insurance";
  if (/\b(?:ibuprofeno|dolor|migraña|migrana)\b/.test(lower) && isExplicitOtcRequest(text)) return "otc_pain";
  if (/\b(?:tos|resfriado|descongestionante|jarabe)\b/.test(lower) && isExplicitOtcRequest(text)) return "otc_cold";
  if (/\b(?:alergias?|antihistam[ií]nico)\b/.test(lower) && isExplicitOtcRequest(text)) return "otc_allergy";
  if (/\b(?:comprobante|registro|historial).*\bvacunaci[oó]n\b/.test(lower)) return "vaccine_records";
  if (/\b(?:vacuna|vacunaci[oó]n|gripe)\b/.test(lower)) return "flu_shot";
  if (/\b(?:paquetes? de pastillas|organizar.*(?:pastillas|medicinas)|bl[ií]ster)\b/.test(lower)) return "blister_pack";
  if (/\b(?:cuido|cuidador|cuidadora|mi madre|mi padre)\b.*\b(?:medicinas?|medicamentos?|pastillas?)\b/.test(lower)) return "caregiver_worry";
  if (/\b(?:residencia|cuidados a largo plazo|centro de cuidados)\b/.test(lower)) return "ltc";
  if (/\b(?:privacidad|datos m[eé]dicos|informaci[oó]n personal|proteger.*(?:datos|informaci[oó]n)|no (?:quiero|deseo) compartir (?:mis )?(?:datos|informaci[oó]n))\b/.test(lower)) return "hipaa_privacy";
  if (/\b(?:hablar|comunicarme).*\bfarmac[eé]utico\b/.test(lower)) return "speak_pharmacist";
  if (/\b(?:c[oó]mo funcionan|explicar).*\b(?:paquetes|bl[ií]ster)\b/.test(lower)) return "blister_explain";
  if (/\b(?:olvid[eé]|perd[ií]) una dosis\b/.test(lower)) return "missed_dose";
  if (/\b(?:seguro tomar|interacci[oó]n).*\bmedicamentos?\b|\bmedicamentos?\b.*\bjuntos\b/.test(lower)) return "drug_interaction";
  if (/\b(?:vitaminas|suplementos)\b/.test(lower) && isExplicitOtcRequest(text)) return "otc_wellness";
  if (/\b(?:servicios ofrecen|qu[eé] servicios)\b/.test(lower)) return "services";
  if (/\bgracias\b/.test(lower)) return "thanks";
  return "spanish";
}

/** Detects supported Spanish conversation before English-only screening. */
export function isSupportedSpanishMessage(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[áéíóúüñ¿¡]/i.test(text)) return true;
  const spanishWords = new Set(["yo", "mi", "mis", "me", "nos", "usted", "ustedes", "el", "la", "los", "las", "un", "una", "es", "son", "esta", "estoy", "tengo", "tiene", "quiero", "necesito", "puedo", "puede", "como", "cuando", "donde", "que", "cual", "por", "para", "con", "sin", "de", "del", "en", "y", "o", "pero", "si", "no", "más", "muy", "aqui", "aquí", "ayuda", "favor", "gracias", "hola", "buenos", "buenas", "farmacia", "receta", "recetas", "medicina", "medicamento", "medicamentos", "pastilla", "pastillas", "seguro", "entrega", "domicilio", "relleno", "resurtido", "dolor", "precio", "cuanto", "cuánto", "habla", "hablo", "español"]);
  const words = lower.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean);
  const matches = words.filter((word) => spanishWords.has(word)).length;
  return matches >= 2 ||
    /\b(?:habla español|en español|no hablo inglés|necesito ayuda|por favor|entrega a domicilio|seguro m[eé]dico)\b/.test(lower);
}
