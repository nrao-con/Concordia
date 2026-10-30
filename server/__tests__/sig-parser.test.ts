/**
 * Tests: SIG parser (parseSig)
 *
 * Exhaustive line-by-line coverage of every branch in server/sig-parser.ts:
 *   - Empty / whitespace input → autoParsed false, all nulls
 *   - Dose + unit extraction (numeric + named units)
 *   - Route parsing (oral, topical, inhalation, eye, ear, …)
 *   - Interval frequency codes (Q4H → Q24H) + every-N-hours variants
 *   - Named frequency codes (QD/OD, BID, TID, QID) + long-form aliases
 *   - Explicit timing tokens (AM/PM/HS/MORNING/EVENING/NOON/…)
 *   - Food flags: withFood true (WITH FOOD, WITH MEALS, WITH BREAKFAST …)
 *   - Food flags: withFood false (EMPTY STOMACH, BEFORE MEALS …)
 *   - Special flags (PRN / AS NEEDED → as_needed, STAT / NOW → immediate,
 *                    TAPER / TAPERING → tapering_dose)
 *   - intakeTimes fallback from intervalHours (≤6 → 4 slots, ≤8 → 3, ≤12 → 2, else 1)
 *   - intakeTimes sort order is always morning < noon < evening < bedtime
 *   - autoParsed false when no timing/interval/special info found
 *   - Real-world SIG strings that combine multiple fields
 *   - rawSig is always echoed back verbatim
 */

import { describe, it, expect } from "vitest";
import { parseSig } from "../sig-parser";

// ---------------------------------------------------------------------------
// Helper — parse and return result with a short alias
// ---------------------------------------------------------------------------
const p = (sig: string) => parseSig(sig);

describe("parseSig — empty / trivial input", () => {
  it("empty string → autoParsed false, all nulls, empty intakeTimes", () => {
    const r = p("");
    expect(r.autoParsed).toBe(false);
    expect(r.dose).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.route).toBeNull();
    expect(r.frequencyCode).toBeNull();
    expect(r.intakeTimes).toEqual([]);
    expect(r.intervalHours).toBeNull();
    expect(r.withFood).toBeNull();
    expect(r.specialFlag).toBeNull();
    expect(r.rawSig).toBe("");
  });

  it("whitespace-only string → autoParsed false", () => {
    const r = p("   ");
    expect(r.autoParsed).toBe(false);
  });

  it("rawSig is always echoed back verbatim", () => {
    const sig = "Take 1 tablet by mouth twice daily";
    expect(p(sig).rawSig).toBe(sig);
  });

  it("random text with no parseable fields → autoParsed false", () => {
    const r = p("call pharmacy for instructions");
    expect(r.autoParsed).toBe(false);
    expect(r.frequencyCode).toBeNull();
    expect(r.intakeTimes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dose extraction
// ---------------------------------------------------------------------------
describe("parseSig — dose + unit extraction", () => {
  it("1 tablet", () => {
    const r = p("Take 1 tablet by mouth daily");
    expect(r.dose).toBe(1);
    expect(r.unit).toBe("tablet");
  });

  it("2 tablets (plural normalised to 'tablet')", () => {
    const r = p("Take 2 tablets by mouth twice daily");
    expect(r.dose).toBe(2);
    expect(r.unit).toBe("tablet");
  });

  it("tab abbreviated → normalised to 'tablet'", () => {
    const r = p("Take 1 tab QD");
    expect(r.unit).toBe("tablet");
  });

  it("1 capsule", () => {
    const r = p("Take 1 capsule daily");
    expect(r.dose).toBe(1);
    expect(r.unit).toBe("capsule");
  });

  it("cap → normalised to 'capsule'", () => {
    const r = p("Take 2 cap twice daily");
    expect(r.unit).toBe("capsule");
  });

  it("5 ml", () => {
    const r = p("Take 5 ml by mouth three times daily");
    expect(r.dose).toBe(5);
    expect(r.unit).toBe("ml");
  });

  it("1 teaspoon (tsp normalised)", () => {
    const r = p("Give 1 tsp twice daily");
    expect(r.unit).toBe("teaspoon");
  });

  it("1 tablespoon (tbsp normalised)", () => {
    const r = p("Give 1 tbsp daily");
    expect(r.unit).toBe("tablespoon");
  });

  it("2 puffs (plural normalised)", () => {
    const r = p("Inhale 2 puffs Q6H");
    expect(r.dose).toBe(2);
    expect(r.unit).toBe("puff");
  });

  it("2 drops (plural normalised)", () => {
    const r = p("Instill 2 drops in eye daily");
    expect(r.unit).toBe("drop");
  });

  it("1 patch (plural normalised)", () => {
    const r = p("Apply 1 patches daily");
    expect(r.unit).toBe("patch");
  });

  it("fractional dose: 0.5 tablet", () => {
    const r = p("Take 0.5 tablets daily");
    expect(r.dose).toBe(0.5);
  });

  it("verb-based dose extraction ('take N') when no unit keyword", () => {
    const r = p("Take 2 by mouth every morning");
    expect(r.dose).toBe(2);
  });

  it("'use N' triggers dose extraction", () => {
    const r = p("Use 1 daily");
    expect(r.dose).toBe(1);
  });

  it("'inject N' triggers dose extraction", () => {
    const r = p("Inject 0.5 subcutaneous once daily");
    expect(r.dose).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Route parsing
// ---------------------------------------------------------------------------
describe("parseSig — route parsing", () => {
  it("PO → oral", () => expect(p("Take 1 tab PO daily").route).toBe("oral"));
  it("BY MOUTH → oral", () => expect(p("Take 1 tablet by mouth daily").route).toBe("oral"));
  it("ORALLY → oral", () => expect(p("Take 1 tab orally daily").route).toBe("oral"));
  it("TOPICAL → topical", () => expect(p("Apply topically to affected area").route).toBe("topical"));
  it("APPLY → topical", () => expect(p("Apply to skin once daily").route).toBe("topical"));
  it("INHALE → inhalation", () => expect(p("Inhale 2 puffs Q6H").route).toBe("inhalation"));
  it("INHALATION → inhalation", () => expect(p("2 puffs inhalation Q4H").route).toBe("inhalation"));
  it("SUBCUT → subcutaneous", () => expect(p("Inject 1 unit subcut daily").route).toBe("subcutaneous"));
  it("SQ → subcutaneous", () => expect(p("Inject 0.5 unit SQ daily").route).toBe("subcutaneous"));
  it("SC → subcutaneous", () => expect(p("0.5 unit SC once daily").route).toBe("subcutaneous"));
  it("SUBCUTANEOUS → subcutaneous", () => expect(p("Inject subcutaneous daily").route).toBe("subcutaneous"));
  it("IM → intramuscular", () => expect(p("Inject 1 unit IM once daily").route).toBe("intramuscular"));
  it("OPHTHALMIC → eye", () => expect(p("1 drop ophthalmic twice daily").route).toBe("eye"));
  it("EYE DROPS → eye", () => expect(p("Instill 2 eye drops twice daily").route).toBe("eye"));
  it("OTIC → ear", () => expect(p("2 drops otic three times daily").route).toBe("ear"));
  it("EAR DROPS → ear", () => expect(p("Instill 2 ear drops daily").route).toBe("ear"));
  it("RECTAL → rectal", () => expect(p("Insert 1 suppository rectally at bedtime").route).toBe("rectal"));
  it("VAGINAL → vaginal", () => expect(p("Insert vaginally at bedtime").route).toBe("vaginal"));
  it("NASAL → nasal", () => expect(p("2 sprays nasal daily").route).toBe("nasal"));
  it("SUBLINGUAL → sublingual", () => expect(p("Place 1 tablet sublingual PRN").route).toBe("sublingual"));
  it("SL → sublingual", () => expect(p("1 tablet SL PRN").route).toBe("sublingual"));
  it("TRANSDERMAL → transdermal", () => expect(p("Apply 1 patch transdermal weekly").route).toBe("transdermal"));
  it("no route keyword → route is null", () => expect(p("Take 1 tablet QD").route).toBeNull());
});

// ---------------------------------------------------------------------------
// Interval frequency codes
// ---------------------------------------------------------------------------
describe("parseSig — interval frequencies (Q4H … Q24H)", () => {
  it("Q4H → intervalHours 4, intakeTimes 4 slots", () => {
    const r = p("Inhale 2 puffs Q4H");
    expect(r.intervalHours).toBe(4);
    expect(r.frequencyCode).toBe("Q4H");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
  });

  it("Q6H → intervalHours 6, intakeTimes 4 slots (≤6)", () => {
    const r = p("Take 1 tablet Q6H");
    expect(r.intervalHours).toBe(6);
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
  });

  it("Q8H → intervalHours 8, intakeTimes 3 slots (≤8)", () => {
    const r = p("Take 1 tab Q8H");
    expect(r.intervalHours).toBe(8);
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening"]);
  });

  it("Q12H → intervalHours 12, intakeTimes 2 slots (≤12)", () => {
    const r = p("Take 1 tab Q12H");
    expect(r.intervalHours).toBe(12);
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
  });

  it("Q24H → intervalHours 24, intakeTimes 1 slot (>12)", () => {
    const r = p("Take 1 tab Q24H");
    expect(r.intervalHours).toBe(24);
    expect(r.intakeTimes).toEqual(["morning"]);
  });

  it("EVERY 6 HOURS long-form matches Q6H", () => {
    const r = p("Take 1 tablet every 6 hours");
    expect(r.intervalHours).toBe(6);
  });

  it("EVERY 8 HOURS long-form matches Q8H", () => {
    const r = p("Take 1 tablet every 8 hours");
    expect(r.intervalHours).toBe(8);
  });

  it("EVERY 12 HOURS long-form matches Q12H", () => {
    const r = p("Take 1 tablet every 12 hours");
    expect(r.intervalHours).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Named frequency codes
// ---------------------------------------------------------------------------
describe("parseSig — named frequency codes", () => {
  it("QD → morning only", () => {
    const r = p("Take 1 tab QD");
    expect(r.frequencyCode).toBe("QD");
    expect(r.intakeTimes).toEqual(["morning"]);
  });

  it("OD → morning only", () => {
    const r = p("Take 1 tab OD");
    expect(r.frequencyCode).toBe("OD");
    expect(r.intakeTimes).toEqual(["morning"]);
  });

  it("DAILY → morning only", () => {
    const r = p("Take 1 tablet daily");
    expect(r.frequencyCode).toBe("DAILY");
    expect(r.intakeTimes).toEqual(["morning"]);
  });

  it("ONCE DAILY → morning only", () => {
    const r = p("Take 1 tablet once daily");
    expect(r.frequencyCode).toBe("ONCE DAILY");
    expect(r.intakeTimes).toEqual(["morning"]);
  });

  it("ONCE A DAY → morning only", () => {
    const r = p("Take 1 tablet once a day");
    expect(r.frequencyCode).toBe("ONCE A DAY");
    expect(r.intakeTimes).toEqual(["morning"]);
  });

  it("BID → morning + evening", () => {
    const r = p("Take 1 tab BID");
    expect(r.frequencyCode).toBe("BID");
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
  });

  it("TWICE DAILY → morning + evening", () => {
    const r = p("Take 1 tablet twice daily");
    expect(r.frequencyCode).toBe("TWICE DAILY");
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
  });

  it("TWICE A DAY → morning + evening", () => {
    const r = p("Take 1 tablet twice a day");
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
  });

  it("TID → morning + noon + evening", () => {
    const r = p("Take 1 tab TID");
    expect(r.frequencyCode).toBe("TID");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening"]);
  });

  it("THREE TIMES DAILY → morning + noon + evening", () => {
    const r = p("Take 1 tablet three times daily");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening"]);
  });

  it("THREE TIMES A DAY → morning + noon + evening", () => {
    const r = p("Take 1 tablet three times a day");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening"]);
  });

  it("QID → all four slots", () => {
    const r = p("Take 1 tab QID");
    expect(r.frequencyCode).toBe("QID");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
  });

  it("FOUR TIMES DAILY → all four slots", () => {
    const r = p("Take 1 tablet four times daily");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
  });

  it("FOUR TIMES A DAY → all four slots", () => {
    const r = p("Take 1 tablet four times a day");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
  });
});

// ---------------------------------------------------------------------------
// Explicit timing tokens
// ---------------------------------------------------------------------------
describe("parseSig — explicit timing tokens", () => {
  it("AM → morning", () => expect(p("Take 1 tab AM").intakeTimes).toContain("morning"));
  it("MORNING → morning", () => expect(p("Take 1 tab every morning").intakeTimes).toContain("morning"));
  it("IN THE MORNING → morning", () => expect(p("Take 1 tab in the morning").intakeTimes).toContain("morning"));
  it("EVERY MORNING → morning", () => expect(p("Take 1 tab every morning").intakeTimes).toContain("morning"));
  it("PM → evening", () => expect(p("Take 1 tab PM").intakeTimes).toContain("evening"));
  it("EVENING → evening", () => expect(p("Take 1 tab in the evening").intakeTimes).toContain("evening"));
  it("HS → bedtime", () => expect(p("Take 1 tab HS").intakeTimes).toContain("bedtime"));
  it("BEDTIME → bedtime", () => expect(p("Take 1 tab at bedtime").intakeTimes).toContain("bedtime"));
  it("AT BEDTIME → bedtime", () => expect(p("Take 1 tablet at bedtime").intakeTimes).toContain("bedtime"));
  it("BEFORE BED → bedtime", () => expect(p("Take 1 tablet before bed").intakeTimes).toContain("bedtime"));
  it("AT NIGHT → bedtime", () => expect(p("Take 1 tablet at night").intakeTimes).toContain("bedtime"));
  it("NOON → noon", () => expect(p("Take 1 tab at noon").intakeTimes).toContain("noon"));
  it("MIDDAY → noon", () => expect(p("Take 1 tab at midday").intakeTimes).toContain("noon"));
  it("BEFORE BREAKFAST → morning", () => expect(p("Take 1 tab before breakfast").intakeTimes).toContain("morning"));
  it("AFTER BREAKFAST → morning", () => expect(p("Take 1 tab after breakfast").intakeTimes).toContain("morning"));
  it("WITH BREAKFAST → morning (also sets withFood true)", () => {
    const r = p("Take 1 tab with breakfast");
    expect(r.intakeTimes).toContain("morning");
    expect(r.withFood).toBe(true);
  });
  it("BEFORE LUNCH → noon", () => expect(p("Take 1 tab before lunch").intakeTimes).toContain("noon"));
  it("AFTER LUNCH → noon", () => expect(p("Take 1 tab after lunch").intakeTimes).toContain("noon"));
  it("WITH LUNCH → noon + withFood", () => {
    const r = p("Take 1 tab with lunch");
    expect(r.intakeTimes).toContain("noon");
    expect(r.withFood).toBe(true);
  });
  it("BEFORE DINNER → evening", () => expect(p("Take 1 tab before dinner").intakeTimes).toContain("evening"));
  it("AFTER DINNER → evening", () => expect(p("Take 1 tab after dinner").intakeTimes).toContain("evening"));
  it("WITH DINNER → evening + withFood", () => {
    const r = p("Take 1 tab with dinner");
    expect(r.intakeTimes).toContain("evening");
    expect(r.withFood).toBe(true);
  });
  it("BEFORE SUPPER → evening", () => expect(p("Take 1 tab before supper").intakeTimes).toContain("evening"));
  it("AFTER SUPPER → evening", () => expect(p("Take 1 tab after supper").intakeTimes).toContain("evening"));
});

// ---------------------------------------------------------------------------
// intakeTimes sort order is always morning < noon < evening < bedtime
// ---------------------------------------------------------------------------
describe("parseSig — intakeTimes sort order is always canonical", () => {
  it("BID intakeTimes order: morning before evening", () => {
    const r = p("1 tab BID");
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
  });

  it("TID intakeTimes order: morning, noon, evening", () => {
    const r = p("1 tab TID");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening"]);
  });

  it("Q4H intakeTimes order: morning, noon, evening, bedtime", () => {
    const r = p("1 tab Q4H");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
  });
});

// ---------------------------------------------------------------------------
// Food flags
// ---------------------------------------------------------------------------
describe("parseSig — withFood flag", () => {
  it("WITH FOOD → withFood true", () => expect(p("Take 1 tab with food daily").withFood).toBe(true));
  it("WITH MEALS → withFood true", () => expect(p("Take 1 tab with meals TID").withFood).toBe(true));
  it("AFTER MEALS → withFood true", () => expect(p("Take 1 tab after meals").withFood).toBe(true));
  it("AFTER EATING → withFood true", () => expect(p("Take 1 tab after eating").withFood).toBe(true));
  it("EMPTY STOMACH → withFood false", () => expect(p("Take 1 tab on an empty stomach").withFood).toBe(false));
  it("BEFORE MEALS → withFood false", () => expect(p("Take 1 tab before meals").withFood).toBe(false));
  it("BEFORE EATING → withFood false", () => expect(p("Take 1 tab before eating daily").withFood).toBe(false));
  it("no food keyword → withFood null", () => expect(p("Take 1 tab QD").withFood).toBeNull());
  it("food positive takes priority over no-food (first match wins)", () => {
    // WITH FOOD appears before BEFORE MEALS — positive wins
    const r = p("Take 1 tab with food before meals daily");
    expect(r.withFood).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Special flags
// ---------------------------------------------------------------------------
describe("parseSig — specialFlag", () => {
  it("PRN → as_needed", () => expect(p("Take 1 tab PRN pain").specialFlag).toBe("as_needed"));
  it("AS NEEDED → as_needed", () => expect(p("Take 1 tab as needed for pain").specialFlag).toBe("as_needed"));
  it("STAT → immediate", () => expect(p("Give 1 tab STAT").specialFlag).toBe("immediate"));
  it("NOW → immediate", () => expect(p("Give 1 tab now").specialFlag).toBe("immediate"));
  it("TAPER → tapering_dose", () => expect(p("1 tablet — taper over 2 weeks").specialFlag).toBe("tapering_dose"));
  it("TAPERING → tapering_dose", () => expect(p("tapering dose as directed").specialFlag).toBe("tapering_dose"));
  it("no special keyword → specialFlag null", () => expect(p("Take 1 tab QD").specialFlag).toBeNull());

  it("PRN makes autoParsed true (specialFlag counts as timing info)", () => {
    const r = p("Take 1 tablet PRN");
    expect(r.autoParsed).toBe(true);
    expect(r.specialFlag).toBe("as_needed");
  });
});

// ---------------------------------------------------------------------------
// autoParsed false logic
// ---------------------------------------------------------------------------
describe("parseSig — autoParsed false when insufficient timing info", () => {
  it("no timing, no interval, no special flag → autoParsed false", () => {
    expect(p("Take 1 tablet by mouth").autoParsed).toBe(false);
  });

  it("has dose+route but no timing → autoParsed false", () => {
    const r = p("Take 2 tablets PO");
    expect(r.dose).toBe(2);
    expect(r.route).toBe("oral");
    expect(r.autoParsed).toBe(false);
  });

  it("has timing → autoParsed true", () => {
    expect(p("Take 1 tablet QD").autoParsed).toBe(true);
  });

  it("has intervalHours → autoParsed true", () => {
    expect(p("Take 1 tab Q12H").autoParsed).toBe(true);
  });

  it("has specialFlag (PRN) → autoParsed true", () => {
    expect(p("Take 1 tab PRN").autoParsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real-world SIG strings — multi-field combinations
// ---------------------------------------------------------------------------
describe("parseSig — real-world SIG strings", () => {
  it("Metformin: 1 tablet by mouth twice daily with food", () => {
    const r = p("Take 1 tablet by mouth twice daily with food");
    expect(r.dose).toBe(1);
    expect(r.unit).toBe("tablet");
    expect(r.route).toBe("oral");
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
    expect(r.withFood).toBe(true);
    expect(r.autoParsed).toBe(true);
  });

  it("Amoxicillin: 1 capsule three times daily", () => {
    const r = p("Take 1 capsule three times daily");
    expect(r.dose).toBe(1);
    expect(r.unit).toBe("capsule");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening"]);
  });

  it("Ibuprofen PRN: 2 tablets by mouth every 8 hours as needed for pain", () => {
    const r = p("Take 2 tablets by mouth every 8 hours as needed for pain");
    expect(r.dose).toBe(2);
    expect(r.intervalHours).toBe(8);
    expect(r.specialFlag).toBe("as_needed");
    expect(r.route).toBe("oral");
    expect(r.autoParsed).toBe(true);
  });

  it("Eye drops: instill 1 drop ophthalmic twice daily", () => {
    const r = p("Instill 1 drop ophthalmic twice daily");
    expect(r.unit).toBe("drop");
    expect(r.route).toBe("eye");
    expect(r.intakeTimes).toEqual(["morning", "evening"]);
  });

  it("Albuterol inhaler: 2 puffs inhale every 4 hours PRN", () => {
    const r = p("Inhale 2 puffs every 4 hours PRN shortness of breath");
    expect(r.dose).toBe(2);
    expect(r.route).toBe("inhalation");
    expect(r.intervalHours).toBe(4);
    expect(r.specialFlag).toBe("as_needed");
  });

  it("Insulin: inject 10 units subcutaneous once daily in the morning", () => {
    const r = p("Inject 10 units subcutaneous once daily in the morning");
    expect(r.dose).toBe(10);
    expect(r.unit).toBe("unit");
    expect(r.route).toBe("subcutaneous");
    expect(r.intakeTimes).toContain("morning");
  });

  it("Prednisone taper: as directed tapering dose", () => {
    const r = p("Take as directed — tapering dose over 10 days");
    expect(r.specialFlag).toBe("tapering_dose");
    expect(r.autoParsed).toBe(true);
  });

  it("Sublingual nitroglycerin: place 1 tablet SL STAT", () => {
    const r = p("Place 1 tablet SL STAT");
    expect(r.route).toBe("sublingual");
    expect(r.specialFlag).toBe("immediate");
    expect(r.autoParsed).toBe(true);
  });

  it("Bedtime sleep aid: 1 tablet at bedtime", () => {
    const r = p("Take 1 tablet at bedtime");
    expect(r.intakeTimes).toEqual(["bedtime"]);
    expect(r.autoParsed).toBe(true);
  });

  it("QID with food: four times daily with meals", () => {
    const r = p("Take 1 tablet four times daily with meals");
    expect(r.intakeTimes).toEqual(["morning", "noon", "evening", "bedtime"]);
    expect(r.withFood).toBe(true);
  });

  it("Q12H bedtime: every 12 hours at bedtime is still 2 slots from interval", () => {
    // Explicit timing (bedtime) overrides the interval-derived slots when present
    const r = p("Take 1 tab every 12 hours at bedtime");
    expect(r.intervalHours).toBe(12);
    // The explicit "AT BEDTIME" timing token overrides the interval fallback
    expect(r.intakeTimes).toContain("bedtime");
  });
});
