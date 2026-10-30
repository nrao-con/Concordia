export interface ParsedSig {
  dose: number | null;
  unit: string | null;
  route: string | null;
  frequencyCode: string | null;
  intakeTimes: string[];
  intervalHours: number | null;
  withFood: boolean | null;
  specialFlag: string | null;
  rawSig: string;
  autoParsed: boolean;
}

const FREQUENCY_TO_TIMES: Record<string, string[]> = {
  "QD": ["morning"],
  "OD": ["morning"],
  "DAILY": ["morning"],
  "ONCE DAILY": ["morning"],
  "ONCE A DAY": ["morning"],
  "BID": ["morning", "evening"],
  "TWICE DAILY": ["morning", "evening"],
  "TWICE A DAY": ["morning", "evening"],
  "TID": ["morning", "noon", "evening"],
  "THREE TIMES DAILY": ["morning", "noon", "evening"],
  "THREE TIMES A DAY": ["morning", "noon", "evening"],
  "QID": ["morning", "noon", "evening", "bedtime"],
  "FOUR TIMES DAILY": ["morning", "noon", "evening", "bedtime"],
  "FOUR TIMES A DAY": ["morning", "noon", "evening", "bedtime"],
};

const INTERVAL_FREQUENCIES: Record<string, number> = {
  "Q4H": 4,
  "Q6H": 6,
  "Q8H": 8,
  "Q12H": 12,
  "Q24H": 24,
};

const TIMING_MAP: Record<string, string> = {
  "AM": "morning",
  "MORNING": "morning",
  "IN THE MORNING": "morning",
  "EVERY MORNING": "morning",
  "NOON": "noon",
  "MIDDAY": "noon",
  "PM": "evening",
  "EVENING": "evening",
  "IN THE EVENING": "evening",
  "EVERY EVENING": "evening",
  "HS": "bedtime",
  "BEDTIME": "bedtime",
  "AT BEDTIME": "bedtime",
  "BEFORE BED": "bedtime",
  "AT NIGHT": "bedtime",
  "BEFORE BREAKFAST": "morning",
  "AFTER BREAKFAST": "morning",
  "WITH BREAKFAST": "morning",
  "BEFORE LUNCH": "noon",
  "AFTER LUNCH": "noon",
  "WITH LUNCH": "noon",
  "BEFORE DINNER": "evening",
  "AFTER DINNER": "evening",
  "WITH DINNER": "evening",
  "BEFORE SUPPER": "evening",
  "AFTER SUPPER": "evening",
};

const FOOD_POSITIVE: string[] = [
  "WITH FOOD", "AFTER MEALS", "WITH MEALS", "AFTER EATING",
  "WITH BREAKFAST", "WITH LUNCH", "WITH DINNER", "WITH SUPPER",
];

const FOOD_NEGATIVE: string[] = [
  "EMPTY STOMACH", "BEFORE MEALS", "BEFORE EATING",
  "ON AN EMPTY STOMACH",
];

const SPECIAL_FLAGS: Record<string, string> = {
  "PRN": "as_needed",
  "AS NEEDED": "as_needed",
  "STAT": "immediate",
  "NOW": "immediate",
  "TAPER": "tapering_dose",
  "TAPERING": "tapering_dose",
};

const UNITS: string[] = [
  "tablet", "tab", "tablets", "tabs",
  "capsule", "cap", "capsules", "caps",
  "ml", "milliliter", "milliliters",
  "teaspoon", "teaspoons", "tsp",
  "tablespoon", "tablespoons", "tbsp",
  "puff", "puffs",
  "drop", "drops",
  "patch", "patches",
  "unit", "units",
  "spray", "sprays",
  "suppository", "suppositories",
  "lozenge", "lozenges",
];

const ROUTE_MAP: Record<string, string> = {
  "PO": "oral",
  "BY MOUTH": "oral",
  "ORALLY": "oral",
  "ORAL": "oral",
  "TOPICAL": "topical",
  "TOPICALLY": "topical",
  "APPLY": "topical",
  "INHALE": "inhalation",
  "INHALATION": "inhalation",
  "PUFF": "inhalation",
  "SUBCUT": "subcutaneous",
  "SUBCUTANEOUS": "subcutaneous",
  "SC": "subcutaneous",
  "SQ": "subcutaneous",
  "IM": "intramuscular",
  "INTRAMUSCULAR": "intramuscular",
  "OPHTHALMIC": "eye",
  "EYE DROPS": "eye",
  "EYE DROP": "eye",
  "OTIC": "ear",
  "EAR DROPS": "ear",
  "EAR DROP": "ear",
  "RECTAL": "rectal",
  "RECTALLY": "rectal",
  "VAGINAL": "vaginal",
  "VAGINALLY": "vaginal",
  "NASAL": "nasal",
  "NASALLY": "nasal",
  "SUBLINGUAL": "sublingual",
  "SL": "sublingual",
  "TRANSDERMAL": "transdermal",
};

export function parseSig(rawSig: string): ParsedSig {
  const result: ParsedSig = {
    dose: null,
    unit: null,
    route: null,
    frequencyCode: null,
    intakeTimes: [],
    intervalHours: null,
    withFood: null,
    specialFlag: null,
    rawSig,
    autoParsed: true,
  };

  if (!rawSig || rawSig.trim().length === 0) {
    result.autoParsed = false;
    return result;
  }

  const upper = rawSig.toUpperCase().trim();

  const doseMatch = rawSig.match(/(\d+(?:\.\d+)?)\s*(tablet|tab|capsule|cap|ml|teaspoon|tsp|tablespoon|tbsp|puff|drop|patch|unit|spray|suppository|lozenge)s?/i);
  if (doseMatch) {
    result.dose = parseFloat(doseMatch[1]);
    result.unit = normalizeUnit(doseMatch[2].toLowerCase());
  } else {
    const numericDose = rawSig.match(/(?:take|use|apply|give|administer|inject|inhale|instill)\s+(\d+(?:\.\d+)?)/i);
    if (numericDose) {
      result.dose = parseFloat(numericDose[1]);
    }
  }

  // Sort longest patterns first so "TRANSDERMAL" wins over "APPLY", etc.
  // Use word-boundary regex so "PO" does not match inside "suppository",
  // "IM" does not match inside "TIMES"/"BEDTIME", etc.
  const sortedRoutes = Object.entries(ROUTE_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, route] of sortedRoutes) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(upper)) {
      result.route = route;
      break;
    }
  }

  for (const [code, hours] of Object.entries(INTERVAL_FREQUENCIES)) {
    if (upper.includes(code) || upper.includes(`EVERY ${hours} HOURS`) || upper.includes(`Q ${hours}H`) || upper.includes(`Q${hours} H`)) {
      result.frequencyCode = code;
      result.intervalHours = hours;
      break;
    }
  }

  if (!result.frequencyCode) {
    const sortedFreqs = Object.keys(FREQUENCY_TO_TIMES).sort((a, b) => b.length - a.length);
    for (const freq of sortedFreqs) {
      if (upper.includes(freq)) {
        result.frequencyCode = freq;
        result.intakeTimes = [...FREQUENCY_TO_TIMES[freq]];
        break;
      }
    }
  }

  const explicitTimings: string[] = [];
  const sortedTimings = Object.keys(TIMING_MAP).sort((a, b) => b.length - a.length);
  for (const pattern of sortedTimings) {
    if (upper.includes(pattern)) {
      const slot = TIMING_MAP[pattern];
      if (!explicitTimings.includes(slot)) {
        explicitTimings.push(slot);
      }
    }
  }

  if (explicitTimings.length > 0) {
    result.intakeTimes = explicitTimings;
  }

  if (result.intakeTimes.length === 0 && result.intervalHours) {
    if (result.intervalHours <= 6) {
      result.intakeTimes = ["morning", "noon", "evening", "bedtime"];
    } else if (result.intervalHours <= 8) {
      result.intakeTimes = ["morning", "noon", "evening"];
    } else if (result.intervalHours <= 12) {
      result.intakeTimes = ["morning", "evening"];
    } else {
      result.intakeTimes = ["morning"];
    }
  }

  for (const flag of FOOD_POSITIVE) {
    if (upper.includes(flag)) {
      result.withFood = true;
      break;
    }
  }
  if (result.withFood === null) {
    for (const flag of FOOD_NEGATIVE) {
      if (upper.includes(flag)) {
        result.withFood = false;
        break;
      }
    }
  }

  for (const [pattern, flag] of Object.entries(SPECIAL_FLAGS)) {
    if (upper.includes(pattern)) {
      result.specialFlag = flag;
      break;
    }
  }

  const slotOrder = ["morning", "noon", "evening", "bedtime"];
  result.intakeTimes.sort((a, b) => slotOrder.indexOf(a) - slotOrder.indexOf(b));

  result.intakeTimes = result.intakeTimes.filter(t => slotOrder.includes(t));

  if (result.intakeTimes.length === 0 && !result.intervalHours && !result.specialFlag) {
    result.autoParsed = false;
  }

  return result;
}

function normalizeUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    "tab": "tablet", "tabs": "tablet", "tablets": "tablet",
    "cap": "capsule", "caps": "capsule", "capsules": "capsule",
    "ml": "ml", "milliliter": "ml", "milliliters": "ml",
    "tsp": "teaspoon", "teaspoons": "teaspoon",
    "tbsp": "tablespoon", "tablespoons": "tablespoon",
    "puffs": "puff",
    "drops": "drop",
    "patches": "patch",
    "units": "unit",
    "sprays": "spray",
    "suppositories": "suppository",
    "lozenges": "lozenge",
  };
  return unitMap[unit] || unit;
}
