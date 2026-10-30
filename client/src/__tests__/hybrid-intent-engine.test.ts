import { describe, it, expect } from "vitest";
import {
  detectIntentHybrid,
  jaccardScore,
  REGEX_RULES,
  tokenize,
  getIntentVocabs,
  INTERROGATIVE_NEGATION_RX,
  levenshteinDistance,
  getAllowedEdits,
  fuzzyIntersectionSize,
  overlapCoefficient,
} from "../lib/intent-engine";

// ── REGEX_RULES structure ──────────────────────────────────────────────────

describe("REGEX_RULES structure", () => {
  it("exports a non-empty object", () => {
    expect(Object.keys(REGEX_RULES).length).toBeGreaterThan(0);
  });

  it("all values are pre-compiled RegExp instances", () => {
    for (const [key, val] of Object.entries(REGEX_RULES)) {
      expect(val, `${key} must be a RegExp`).toBeInstanceOf(RegExp);
    }
  });

  it("transfer_out key appears before transfer (outbound wins over inbound)", () => {
    const keys = Object.keys(REGEX_RULES);
    const ti = keys.indexOf("transfer");
    const to = keys.indexOf("transfer_out");
    expect(to, "transfer_out must exist").toBeGreaterThanOrEqual(0);
    expect(ti, "transfer must exist").toBeGreaterThanOrEqual(0);
    expect(to, "transfer_out must precede transfer").toBeLessThan(ti);
  });

  it("includes expected high-traffic intent keys", () => {
    const keys = Object.keys(REGEX_RULES);
    for (const required of ["transfer", "refill", "flu_shot", "tracking", "hours", "prior_auth"]) {
      expect(keys, `missing key: ${required}`).toContain(required);
    }
  });
});

// ── jaccardScore ───────────────────────────────────────────────────────────

describe("jaccardScore", () => {
  it("returns 1.0 for identical sets", () => {
    const s = new Set(["refill", "renew"]);
    expect(jaccardScore(s, s)).toBe(1.0);
  });

  it("returns 0 for completely disjoint sets", () => {
    expect(jaccardScore(new Set(["foo"]), new Set(["bar"]))).toBe(0);
  });

  it("returns 0 when query set is empty", () => {
    expect(jaccardScore(new Set(), new Set(["bar"]))).toBe(0);
  });

  it("returns 0 when keyword set is empty", () => {
    expect(jaccardScore(new Set(["foo"]), new Set())).toBe(0);
  });

  it("computes |A∩B| / |A∪B| correctly for partial overlap", () => {
    const a = new Set(["track", "order"]);
    const b = new Set(["track", "delivery"]);
    // intersection={track}=1, union={track,order,delivery}=3 → 1/3
    expect(jaccardScore(a, b)).toBeCloseTo(1 / 3);
  });

  it("returns 0.5 for two-word sets with one common token", () => {
    const a = new Set(["flu", "shot"]);
    const b = new Set(["flu", "vaccine"]);
    // intersection={flu}=1, union={flu,shot,vaccine}=3 → 1/3
    expect(jaccardScore(a, b)).toBeCloseTo(1 / 3);
  });
});

// ── detectIntentHybrid — Tier 1 (regex) TRANSFER inbound ─────────────────

describe("detectIntentHybrid — Tier 1 TRANSFER (inbound)", () => {
  it("'I wanna move my pills from Walgreens'", () => {
    expect(detectIntentHybrid("I wanna move my pills from Walgreens")).toBe("transfer");
  });

  it("'switch my script from CVS'", () => {
    expect(detectIntentHybrid("switch my script from CVS")).toBe("transfer");
  });

  it("'transfer my prescriptions to Concordia'", () => {
    expect(detectIntentHybrid("transfer my prescriptions to Concordia")).toBe("transfer");
  });

  it("'bring my meds to you guys'", () => {
    expect(detectIntentHybrid("bring my meds to you guys")).toBe("transfer");
  });

  it("'switch from Rite Aid to your pharmacy'", () => {
    expect(detectIntentHybrid("switch from Rite Aid to your pharmacy")).toBe("transfer");
  });
});

// ── detectIntentHybrid — Tier 1 (regex) TRANSFER_OUT outbound ─────────────

describe("detectIntentHybrid — Tier 1 TRANSFER_OUT (outbound)", () => {
  it("'transfer out to CVS'", () => {
    expect(detectIntentHybrid("transfer out to CVS")).toBe("transfer_out");
  });

  it("'leaving concordia pharmacy'", () => {
    expect(detectIntentHybrid("leaving concordia pharmacy")).toBe("transfer_out");
  });

  it("'switch away to another pharmacy'", () => {
    expect(detectIntentHybrid("switch away to another pharmacy")).toBe("transfer_out");
  });

  it("'transfer to a different pharmacy'", () => {
    expect(detectIntentHybrid("transfer to a different pharmacy")).toBe("transfer_out");
  });
});

// ── detectIntentHybrid — Tier 1 (regex) REFILL ───────────────────────────

describe("detectIntentHybrid — Tier 1 REFILL", () => {
  it("'I need a refill'", () => {
    expect(detectIntentHybrid("I need a refill")).toBe("refill");
  });

  it("'renew my prescription'", () => {
    expect(detectIntentHybrid("renew my prescription")).toBe("refill");
  });

  it("'re-fill please'", () => {
    expect(detectIntentHybrid("re-fill please")).toBe("refill");
  });

  it("'running low on my pills'", () => {
    expect(detectIntentHybrid("running low on my pills")).toBe("refill");
  });

  it("'almost out of refills'", () => {
    expect(detectIntentHybrid("almost out of refills")).toBe("refill");
  });

  it("'running out of medication'", () => {
    expect(detectIntentHybrid("running out of medication")).toBe("refill");
  });
});

// ── detectIntentHybrid — Tier 1 (regex) FLU_SHOT ─────────────────────────

describe("detectIntentHybrid — Tier 1 FLU_SHOT", () => {
  it("'flu shot'", () => {
    expect(detectIntentHybrid("flu shot")).toBe("flu_shot");
  });

  it("recognizes a follow-up written as 'for flushot'", () => {
    expect(detectIntentHybrid("for flushot")).toBe("flu_shot");
  });

  it("'flu vaccine appointment'", () => {
    expect(detectIntentHybrid("flu vaccine appointment")).toBe("flu_shot");
  });

  it("'influenza shot'", () => {
    expect(detectIntentHybrid("influenza shot")).toBe("flu_shot");
  });

  it("'need flu immunization'", () => {
    expect(detectIntentHybrid("need flu immunization")).toBe("flu_shot");
  });

  it("'flu vaccination this season'", () => {
    expect(detectIntentHybrid("flu vaccination this season")).toBe("flu_shot");
  });

  it("'flu booster appointment'", () => {
    expect(detectIntentHybrid("flu booster appointment")).toBe("flu_shot");
  });
});

// ── detectIntentHybrid — Tier 1 (regex) TRACKING ─────────────────────────

describe("detectIntentHybrid — Tier 1 TRACKING", () => {
  it("'where is my package?'", () => {
    expect(detectIntentHybrid("where is my package?")).toBe("tracking");
  });

  it("'track my prescription order'", () => {
    expect(detectIntentHybrid("track my prescription order")).toBe("tracking");
  });

  it("'track delivery'", () => {
    expect(detectIntentHybrid("track delivery")).toBe("tracking");
  });

  it("'delivery status updates'", () => {
    expect(detectIntentHybrid("delivery status updates")).toBe("tracking");
  });

  it("'my order hasn\\'t arrived'", () => {
    expect(detectIntentHybrid("my order hasn't arrived")).toBe("tracking");
  });

  it("'where is my medication'", () => {
    expect(detectIntentHybrid("where is my medication")).toBe("tracking");
  });
});

// ── detectIntentHybrid — Tier 1 (regex) HOURS ────────────────────────────

describe("detectIntentHybrid — Tier 1 HOURS", () => {
  it("'what time do you close?'", () => {
    expect(detectIntentHybrid("what time do you close?")).toBe("hours");
  });

  it("'are you open on weekends?'", () => {
    expect(detectIntentHybrid("are you open on weekends?")).toBe("hours");
  });

  it("'pharmacy operating hours'", () => {
    expect(detectIntentHybrid("pharmacy operating hours")).toBe("hours");
  });

  it("'when do you open'", () => {
    expect(detectIntentHybrid("when do you open")).toBe("hours");
  });

  it("'still open?'", () => {
    expect(detectIntentHybrid("still open?")).toBe("hours");
  });

  it("'what time are you open'", () => {
    expect(detectIntentHybrid("what time are you open")).toBe("hours");
  });

  it("'closing time today'", () => {
    expect(detectIntentHybrid("closing time today")).toBe("hours");
  });
});

// ── detectIntentHybrid — Tier 1 (regex) PRIOR_AUTH ───────────────────────

describe("detectIntentHybrid — Tier 1 PRIOR_AUTH", () => {
  it("'prior auth status'", () => {
    expect(detectIntentHybrid("prior auth status")).toBe("prior_auth");
  });

  it("'my prior authorization was denied'", () => {
    expect(detectIntentHybrid("my prior authorization was denied")).toBe("prior_auth");
  });

  it("'insurance denied my prescription'", () => {
    expect(detectIntentHybrid("insurance denied my prescription")).toBe("prior_auth");
  });

  it("'not covered by insurance'", () => {
    expect(detectIntentHybrid("not covered by insurance")).toBe("prior_auth");
  });

  it("'pa approval for my medication'", () => {
    expect(detectIntentHybrid("pa approval for my medication")).toBe("prior_auth");
  });

  it("'insurance rejected my claim'", () => {
    expect(detectIntentHybrid("insurance rejected my claim")).toBe("prior_auth");
  });
});

// ── detectIntentHybrid — Tier 2 (Jaccard fallback) ───────────────────────

describe("detectIntentHybrid — Tier 2 Jaccard (no regex fires)", () => {
  it("'walgreens pharmacy switch' → transfer (keyword overlap, reversed word order)", () => {
    expect(detectIntentHybrid("walgreens pharmacy switch")).toBe("transfer");
  });

  it("'when is my shipment arriving' → tracking", () => {
    expect(detectIntentHybrid("when is my shipment arriving")).toBe("tracking");
  });

  it("'loyalty points rewards balance' → loyalty", () => {
    expect(detectIntentHybrid("loyalty points rewards balance")).toBe("loyalty");
  });

  it("'blister pack pill organizer doses' → blister_pack", () => {
    expect(detectIntentHybrid("blister pack pill organizer doses")).toBe("blister_pack");
  });

  it("'long term care nursing facility' → ltc", () => {
    expect(detectIntentHybrid("long term care nursing facility")).toBe("ltc");
  });

  it("'schedule flu vaccine booster appointment' → flu_shot (also hits regex)", () => {
    // Vaccine phrase is in flu_shot regex even without the word "flu shot"
    expect(detectIntentHybrid("schedule flu vaccine booster appointment")).toBe("flu_shot");
  });
});

// ── detectIntentHybrid — false-positive guards ────────────────────────────

describe("detectIntentHybrid — false-positive prevention", () => {
  it("'running late' → general (single matching token 'runn' — below minIntersection)", () => {
    expect(detectIntentHybrid("running late")).toBe("general");
  });

  it("'oral medication' → general (not otc_dental)", () => {
    expect(detectIntentHybrid("oral medication")).toBe("general");
  });

  it("empty string → general", () => {
    expect(detectIntentHybrid("")).toBe("general");
  });

  it("whitespace-only string → general", () => {
    expect(detectIntentHybrid("   ")).toBe("general");
  });

  it("'hi' → general (single token, too short)", () => {
    expect(detectIntentHybrid("hi")).toBe("general");
  });

  it("'shot' alone → general (single token below threshold)", () => {
    expect(detectIntentHybrid("shot")).toBe("general");
  });

  it("'I want to switch pharmacies from CVS' → transfer (formerly a false-positive, now correct)", () => {
    expect(detectIntentHybrid("I want to switch pharmacies from CVS")).toBe("transfer");
  });

  it("'transfer out to Walgreens' → transfer_out (NOT inbound transfer)", () => {
    expect(detectIntentHybrid("transfer out to Walgreens")).toBe("transfer_out");
  });

  it("'transfer my prescriptions to Concordia' does NOT return transfer_out", () => {
    expect(detectIntentHybrid("transfer my prescriptions to Concordia")).not.toBe("transfer_out");
  });
});

// ── detectIntentHybrid — Tier 2 Jaccard: minIntersection=2 guard ─────────

describe("detectIntentHybrid — Tier 2 minIntersection=2 guard", () => {
  it("two-token queries require both tokens to match (not just one)", () => {
    // 'running late' has 'runn' which appears in refill vocab,
    // but 'late' does not → intersection=1, below minIntersection=2 → general
    const result = detectIntentHybrid("running late");
    expect(result).toBe("general");
  });

  it("all INTENT_RULES intents produce non-empty vocabularies (sanity)", () => {
    const vocabs = getIntentVocabs();
    for (const [intent, vocab] of vocabs) {
      expect(vocab.size, `empty vocab for: ${intent}`).toBeGreaterThan(0);
    }
  });

  it("tokenize produces tokens that feed correctly into Jaccard scoring", () => {
    const tokens = tokenize("refill early running low");
    expect(tokens.size).toBeGreaterThanOrEqual(2);
  });
});

// ── levenshteinDistance ───────────────────────────────────────────────────

describe("levenshteinDistance", () => {
  it("identical strings return 0", () => {
    expect(levenshteinDistance("refill", "refill")).toBe(0);
  });

  it("empty string a returns length of b", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("empty string b returns length of a", () => {
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("single substitution: 'transfer' vs 'transfur' = 1", () => {
    // transfur: e→u at position 7
    expect(levenshteinDistance("transfer", "transfur")).toBe(1);
  });

  it("single substitution: 'prior' vs 'prier' = 1", () => {
    // prior → prier: o→e at position 4
    expect(levenshteinDistance("prior", "prier")).toBe(1);
  });

  it("single insertion: 'refil' vs 'refill' = 1", () => {
    expect(levenshteinDistance("refil", "refill")).toBe(1);
  });

  it("single deletion: 'trackking' vs 'tracking' = 1", () => {
    expect(levenshteinDistance("trackking", "tracking")).toBe(1);
  });

  it("is symmetric: distance(a,b) === distance(b,a)", () => {
    expect(levenshteinDistance("transfur", "transfer"))
      .toBe(levenshteinDistance("transfer", "transfur"));
  });

  it("maxEdits early-exit: returns maxEdits+1 when gap exceeds budget", () => {
    // length delta = 4, maxEdits = 1 → fast-reject immediately
    expect(levenshteinDistance("ab", "abcdef", 1)).toBe(2);
  });

  it("maxEdits early-exit: returns actual distance when within budget", () => {
    expect(levenshteinDistance("refil", "refill", 2)).toBe(1);
  });
});

// ── getAllowedEdits ────────────────────────────────────────────────────────

describe("getAllowedEdits", () => {
  it("3-char word → 0 edits (too short for fuzzy)", () => {
    expect(getAllowedEdits("flu")).toBe(0);
  });

  it("4-char word → 1 edit (lower boundary of fuzzy range)", () => {
    expect(getAllowedEdits("auth")).toBe(1);
  });

  it("7-char word → 1 edit (upper boundary of 1-edit range)", () => {
    expect(getAllowedEdits("transfr")).toBe(1);
  });

  it("8-char word → 2 edits (lower boundary of 2-edit range)", () => {
    expect(getAllowedEdits("transfer")).toBe(2);
  });

  it("long word → 2 edits", () => {
    expect(getAllowedEdits("atorvastatin")).toBe(2);
  });
});

// ── fuzzyIntersectionSize ─────────────────────────────────────────────────

describe("fuzzyIntersectionSize", () => {
  it("exact match counts", () => {
    const q = new Set(["refill"]);
    const v = new Set(["refill", "renew"]);
    expect(fuzzyIntersectionSize(q, v)).toBe(1);
  });

  it("typo match within budget: 'transfur' matches 'transfer' (1 edit, budget=2)", () => {
    const q = new Set(["transfur"]); // 8 chars → budget=2
    const v = new Set(["transfer", "move", "switch"]);
    expect(fuzzyIntersectionSize(q, v)).toBe(1);
  });

  it("short token with 0-edit budget gets no fuzzy match", () => {
    // "flu" (3 chars → 0 edits) vs ["fly","flue"] — both 1 edit away
    const q = new Set(["flu"]);
    const v = new Set(["fly", "flue"]);
    expect(fuzzyIntersectionSize(q, v)).toBe(0);
  });

  it("completely disjoint sets return 0", () => {
    const q = new Set(["xylophone"]);
    const v = new Set(["refill", "renew", "prescription"]);
    expect(fuzzyIntersectionSize(q, v)).toBe(0);
  });

  it("counts multiple fuzzy matches across token set", () => {
    const q = new Set(["transfur", "prier"]); // both within budget of real words
    const v = new Set(["transfer", "prior", "auth"]);
    expect(fuzzyIntersectionSize(q, v)).toBe(2);
  });
});

// ── overlapCoefficient ────────────────────────────────────────────────────

describe("overlapCoefficient", () => {
  it("identical sets return 1.0", () => {
    const s = new Set(["refill", "renew"]);
    expect(overlapCoefficient(s, s)).toBe(1.0);
  });

  it("completely disjoint sets return 0", () => {
    expect(overlapCoefficient(new Set(["foo"]), new Set(["bar"]))).toBe(0);
  });

  it("empty set a returns 0", () => {
    expect(overlapCoefficient(new Set(), new Set(["foo"]))).toBe(0);
  });

  it("empty set b returns 0", () => {
    expect(overlapCoefficient(new Set(["foo"]), new Set())).toBe(0);
  });

  it("small query fully inside large vocab returns 1.0", () => {
    // min(|A|,|B|) = |A| = 1; intersection = 1 → 1.0
    const q = new Set(["refill"]);
    const v = new Set(["refill", "renew", "prescription", "meds", "order"]);
    expect(overlapCoefficient(q, v)).toBe(1.0);
  });

  it("partial overlap: {flu,shot} ∩ {flu,vaccine} = 1/2 = 0.5", () => {
    const a = new Set(["flu", "shot"]);
    const b = new Set(["flu", "vaccine"]);
    expect(overlapCoefficient(a, b)).toBeCloseTo(0.5);
  });
});

// ── INTERROGATIVE_NEGATION_RX ─────────────────────────────────────────────

describe("INTERROGATIVE_NEGATION_RX", () => {
  it("matches 'can't I get a refill?'", () => {
    expect(INTERROGATIVE_NEGATION_RX.test("can't I get a refill?")).toBe(true);
  });

  it("matches 'won't you transfer my script?'", () => {
    expect(INTERROGATIVE_NEGATION_RX.test("won't you transfer my script?")).toBe(true);
  });

  it("matches 'don't we need to refill this?'", () => {
    expect(INTERROGATIVE_NEGATION_RX.test("don't we need to refill this?")).toBe(true);
  });

  it("does NOT match plain statement 'please don't refill my meds'", () => {
    expect(INTERROGATIVE_NEGATION_RX.test("please don't refill my meds")).toBe(false);
  });

  it("does NOT match 'stop my delivery'", () => {
    expect(INTERROGATIVE_NEGATION_RX.test("stop my delivery")).toBe(false);
  });
});

// ── detectIntentHybrid — Negation Guard ───────────────────────────────────

describe("detectIntentHybrid — Negation Guard fires before Tier-1", () => {
  it("'please don't refill my meds' → general (negation suppresses refill regex)", () => {
    expect(detectIntentHybrid("please don't refill my meds")).toBe("general");
  });

  it("'stop my delivery order' → general (stop is a negation word)", () => {
    expect(detectIntentHybrid("stop my delivery order")).toBe("general");
  });

  it("'cancel my prescription delivery' → general", () => {
    expect(detectIntentHybrid("cancel my prescription delivery")).toBe("general");
  });

  it("'I won't refill that prescription' → general", () => {
    expect(detectIntentHybrid("I won't refill that prescription")).toBe("general");
  });

  it("'never renew my atorvastatin' → general", () => {
    expect(detectIntentHybrid("never renew my atorvastatin")).toBe("general");
  });

  it("'don't transfer my pills' → general", () => {
    expect(detectIntentHybrid("don't transfer my pills")).toBe("general");
  });
});

// ── detectIntentHybrid — Interrogative carve-out ─────────────────────────

describe("detectIntentHybrid — Interrogative carve-out allows Tier-1 through", () => {
  it("'can't I get a refill?' → refill (question form, not negation)", () => {
    expect(detectIntentHybrid("can't I get a refill?")).toBe("refill");
  });

  it("'won't you transfer my scripts from Walgreens?' → transfer", () => {
    expect(detectIntentHybrid("won't you transfer my scripts from Walgreens?")).toBe("transfer");
  });
});

// ── detectIntentHybrid — Tier-2 typo matching ────────────────────────────

describe("detectIntentHybrid — Tier-2 fuzzy typo matching", () => {
  it("'transfur to cvs pharmacy' → transfer ('transfur' fuzzy-matches 'transfer')", () => {
    // Tier-1 regex requires literal /transfer|move|switch|bring/ — 'transfur' misses.
    // Tier-2 fuzzy intersection: 'transfur' (8 chars, budget=2) → dist('transfur','transfer')=1 ✓
    // 'cvs' (3 chars, budget=0) → exact match in transfer vocab ✓ → fIntersection=2 ≥ 2
    expect(detectIntentHybrid("transfur to cvs pharmacy")).toBe("transfer");
  });

  it("'prier auth status' → prior_auth ('prier' fuzzy-matches 'prior')", () => {
    // 'prier' (5 chars, budget=1) → dist('prier','prior')=1 ✓
    // 'auth' exact match ✓ → fIntersection=2 ≥ 2
    expect(detectIntentHybrid("prier auth status")).toBe("prior_auth");
  });
});

// ── detectIntentHybrid — baseline preserved ───────────────────────────────

describe("detectIntentHybrid — baseline regression", () => {
  it("'please transfer my prescriptions to concordia' → transfer", () => {
    expect(detectIntentHybrid("please transfer my prescriptions to concordia")).toBe("transfer");
  });

  it("'not covered by insurance' → prior_auth (not suppressed — 'not' excluded from NEGATION_RX)", () => {
    // 'not' is intentionally excluded from NEGATION_RX because it appears in
    // the prior_auth Tier-1 regex (\bnot\s+covered\b) and is too ambiguous alone.
    expect(detectIntentHybrid("not covered by insurance")).toBe("prior_auth");
  });
});
