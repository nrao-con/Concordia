import { z } from "zod";
import { generateStructuredResponse } from "./ai-client";
import { storage } from "./storage";
import type { Prescription } from "@shared/schema";

// Zod schema for AI explainer output — used to validate model response before caching
const conditionExplainerSchema = z.object({
  summary: z.string().min(1),
  treatments: z.array(z.string()).min(1),
  lifestyleTips: z.array(z.string()).min(1),
  doctorQuestions: z.array(z.string()).min(1),
  aiGenerated: z.literal(true).default(true),
});

export type ConditionExplainerResponse = z.infer<typeof conditionExplainerSchema>;

export interface NextStep {
  label: string;
  url: string;
  description: string;
}

export interface LinkedPrescription {
  id: string;
  rxNumber: string;
  medicationName: string;
  dosage: string;
  instructions: string | null;
  status: string;
  refillsRemaining: number;
  nextRefillDate: Date | null;
  matchReason: string;
}

// 30-day TTL for cached explainer responses
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function buildConditionKey(conditionName: string, icd10Code?: string | null): string {
  const base = conditionName.trim().toLowerCase().replace(/\s+/g, "_");
  return icd10Code ? `${base}__${icd10Code.toUpperCase()}` : base;
}

export async function getConditionExplainer(
  conditionName: string,
  icd10Code?: string | null
): Promise<ConditionExplainerResponse> {
  const key = buildConditionKey(conditionName, icd10Code);

  // Check cache via storage method
  const cached = await storage.getConditionExplainerCache(key);
  if (cached) {
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return cached.responseJson as ConditionExplainerResponse;
    }
  }

  const icd10Clause = icd10Code ? ` (ICD-10: ${icd10Code})` : "";
  const prompt = `Explain the medical condition "${conditionName}"${icd10Clause} in plain language for a patient.`;

  const systemPrompt = `You are a patient education assistant at a pharmacy. Explain medical conditions in clear, compassionate plain language that a non-medical person can understand. Always respond with valid JSON matching exactly this schema:
{
  "summary": "<2-3 sentence plain-language overview of the condition>",
  "treatments": ["<treatment 1>", "<treatment 2>", ...],
  "lifestyleTips": ["<tip 1>", "<tip 2>", ...],
  "doctorQuestions": ["<question 1>", "<question 2>", ...],
  "aiGenerated": true
}
Provide 3-5 items for each array. Keep each item concise (one sentence). Do NOT provide specific dosage or prescription recommendations. This content is for educational purposes only.`;

  const raw = await generateStructuredResponse<unknown>(prompt, systemPrompt);

  // Validate AI output against schema before trusting or caching it
  const response = conditionExplainerSchema.parse({
    ...( typeof raw === "object" && raw !== null ? raw : {} ),
    aiGenerated: true,
  });

  // Upsert via storage method (handles conflict/stale replacement)
  await storage.upsertConditionExplainerCache(key, response);

  return response;
}

// ============================================================
// PRESCRIPTION — CONDITION MATCHING
// Maps condition category keywords → drug/medication keywords
// that are typically prescribed for those conditions.
// ============================================================

interface ConditionMedMap {
  conditionPattern: RegExp;
  icd10Prefixes: string[];
  medKeywords: RegExp;
  label: string;
}

const CONDITION_MED_MAPS: ConditionMedMap[] = [
  {
    label: "Diabetes / glycemic control",
    conditionPattern: /diabet|insulin.resist|hyperglycemi|glucose|glycemic|a1c|type\s*[12]/i,
    icd10Prefixes: ["E10", "E11", "E12", "E13", "E14"],
    medKeywords: /metformin|insulin|glipizide|glyburide|glimepiride|sitagliptin|saxagliptin|alogliptin|linagliptin|empagliflozin|dapagliflozin|canagliflozin|liraglutide|semaglutide|dulaglutide|exenatide|pioglitazone|rosiglitazone|acarbose|miglitol|pramlintide/i,
  },
  {
    label: "Hypertension / blood pressure",
    conditionPattern: /hypertension|high.blood.pressure|blood.pressure|htn|essential.hypertension/i,
    icd10Prefixes: ["I10", "I11", "I12", "I13", "I15"],
    medKeywords: /lisinopril|enalapril|ramipril|benazepril|captopril|losartan|valsartan|irbesartan|olmesartan|telmisartan|amlodipine|nifedipine|diltiazem|verapamil|metoprolol|atenolol|carvedilol|bisoprolol|hydrochlorothiazide|chlorthalidone|furosemide|spironolactone|clonidine|hydralazine|amlodipine/i,
  },
  {
    label: "Hyperlipidemia / cholesterol",
    conditionPattern: /hyperlipi|hypercholesterol|cholesterol|dyslipide|triglycer|ldl|hdl/i,
    icd10Prefixes: ["E78"],
    medKeywords: /statin|atorvastatin|rosuvastatin|simvastatin|pravastatin|lovastatin|fluvastatin|pitavastatin|ezetimibe|fenofibrate|gemfibrozil|niacin|evolocumab|alirocumab|inclisiran|omega.3|fish.oil/i,
  },
  {
    label: "Asthma / COPD / respiratory",
    conditionPattern: /asthma|copd|bronchitis|emphysema|respiratory|pulmonary|lung.disease|bronchospasm/i,
    icd10Prefixes: ["J18", "J40", "J41", "J42", "J43", "J44", "J45", "J46", "J47"],
    medKeywords: /albuterol|salbutamol|salmeterol|formoterol|budesonide|fluticasone|beclomethasone|ciclesonide|mometasone|montelukast|zafirlukast|theophylline|ipratropium|tiotropium|umeclidinium|indacaterol|roflumilast|dupilumab|mepolizumab|benralizumab/i,
  },
  {
    label: "Depression / anxiety / mental health",
    conditionPattern: /depress|anxiety|bipolar|schizophrenia|adhd|attention.deficit|ocd|ptsd|panic|psychiatric/i,
    icd10Prefixes: ["F20", "F25", "F30", "F31", "F32", "F33", "F34", "F40", "F41", "F42", "F43", "F90"],
    medKeywords: /sertraline|fluoxetine|escitalopram|citalopram|paroxetine|fluvoxamine|venlafaxine|duloxetine|desvenlafaxine|bupropion|mirtazapine|amitriptyline|nortriptyline|imipramine|clomipramine|trazodone|buspirone|alprazolam|lorazepam|clonazepam|diazepam|aripiprazole|quetiapine|olanzapine|risperidone|ziprasidone|lurasidone|methylphenidate|amphetamine|atomoxetine|lithium|valproate|lamotrigine/i,
  },
  {
    label: "Rheumatoid arthritis / autoimmune",
    conditionPattern: /rheumatoid|autoimmune|lupus|crohn|ulcerative.colitis|psoriasis|multiple.sclerosis|ankylosing/i,
    icd10Prefixes: ["M05", "M06", "K50", "K51", "L40", "G35", "M45"],
    medKeywords: /methotrexate|hydroxychloroquine|sulfasalazine|leflunomide|adalimumab|etanercept|infliximab|certolizumab|golimumab|tocilizumab|abatacept|rituximab|ustekinumab|secukinumab|ixekizumab|vedolizumab|natalizumab|dimethyl.fumarate|glatiramer|interferon/i,
  },
  {
    label: "Thyroid conditions",
    conditionPattern: /hypothyroid|hyperthyroid|thyroid|graves|hashimoto/i,
    icd10Prefixes: ["E00", "E01", "E02", "E03", "E04", "E05", "E06", "E07"],
    medKeywords: /levothyroxine|liothyronine|methimazole|propylthiouracil|armour.thyroid|synthroid/i,
  },
  {
    label: "Osteoporosis / bone density",
    conditionPattern: /osteoporosis|osteopenia|bone.density|fracture.risk/i,
    icd10Prefixes: ["M80", "M81"],
    medKeywords: /alendronate|risedronate|ibandronate|zoledronic|denosumab|teriparatide|abaloparatide|romosozumab|raloxifene|calcium|vitamin.d/i,
  },
  {
    label: "GERD / acid reflux",
    conditionPattern: /gerd|acid.reflux|heartburn|gastroesophageal|peptic.ulcer|stomach.acid/i,
    icd10Prefixes: ["K21", "K25", "K26", "K27"],
    medKeywords: /omeprazole|esomeprazole|pantoprazole|lansoprazole|rabeprazole|famotidine|ranitidine|cimetidine|antacid|sucralfate|metoclopramide/i,
  },
  {
    label: "Heart failure / cardiac",
    conditionPattern: /heart.failure|cardiomyopathy|cardiac|atrial.fibril|arrhythmia|angina/i,
    icd10Prefixes: ["I20", "I21", "I25", "I42", "I48", "I50"],
    medKeywords: /digoxin|amiodarone|dronedarone|flecainide|propafenone|warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|clopidogrel|aspirin|nitroglycerin|isosorbide|sacubitril|ivabradine/i,
  },
];

/**
 * Match a patient's active prescriptions to a given condition using
 * deterministic keyword rules derived from pharmacy records data.
 *
 * Matching is based on:
 *  1. Condition name pattern → medication name / generic name / brand name / drug class
 *  2. ICD-10 code prefix matching (when provided)
 *
 * Returns linked prescriptions with a `matchReason` field, plus any
 * unmatched active prescriptions in a separate array.
 */
export function matchPrescriptionsToCondition(
  conditionName: string,
  icd10Code: string | null | undefined,
  prescriptions: Prescription[]
): { linked: LinkedPrescription[]; unlinked: LinkedPrescription[] } {
  const active = prescriptions.filter(rx => rx.status === "active");

  // Find which condition category applies
  const matchedCategory = CONDITION_MED_MAPS.find(cat => {
    if (cat.conditionPattern.test(conditionName)) return true;
    if (icd10Code) {
      return cat.icd10Prefixes.some(prefix => icd10Code.toUpperCase().startsWith(prefix));
    }
    return false;
  });

  const linked: LinkedPrescription[] = [];
  const unlinked: LinkedPrescription[] = [];

  for (const rx of active) {
    const toCheck = [
      rx.medicationName,
      rx.genericName,
      rx.brandName,
      rx.drugClass,
      rx.instructions,
    ]
      .filter(Boolean)
      .join(" ");

    let matchReason: string | null = null;

    if (matchedCategory && matchedCategory.medKeywords.test(toCheck)) {
      matchReason = `Commonly prescribed for ${matchedCategory.label}`;
    }

    const rxEntry: LinkedPrescription = {
      id: rx.id,
      rxNumber: rx.rxNumber,
      medicationName: rx.medicationName,
      dosage: rx.dosage,
      instructions: rx.instructions ?? null,
      status: rx.status,
      refillsRemaining: rx.refillsRemaining,
      nextRefillDate: rx.nextRefillDate ?? null,
      matchReason: matchReason ?? "No automatic match — confirm with your doctor",
    };

    if (matchReason) {
      linked.push(rxEntry);
    } else {
      unlinked.push(rxEntry);
    }
  }

  return { linked, unlinked };
}

// ============================================================
// NEXT STEPS — condition category → platform CTA mapping
// ============================================================

const CONDITION_NEXT_STEPS: { pattern: RegExp; steps: NextStep[] }[] = [
  {
    pattern: /asthma|copd|pneumonia|bronchitis|emphysema|respiratory|lung|pulmonary/i,
    steps: [
      {
        label: "Explore Specialty Medications",
        url: "/specialty",
        description: "Browse specialty respiratory medications available through Concordia.",
      },
      {
        label: "Schedule Your Flu Shot",
        url: "/schedule-flu-shot",
        description: "Respiratory patients are at higher risk — protect yourself with a flu vaccine.",
      },
    ],
  },
  {
    pattern: /diabetes|diabetic|insulin|glucose|glycemic|metabolic|obesity|hypertension|blood pressure|cholesterol|hyperlipidemia/i,
    steps: [
      {
        label: "Transfer Your Prescription",
        url: "/",
        description: "Transfer your maintenance medications to Concordia for convenient refills.",
      },
      {
        label: "Ask About the Blister Pack Program",
        url: "/",
        description: "Our blister pack program simplifies daily dose management for chronic conditions.",
      },
      {
        label: "Explore Specialty Medications",
        url: "/specialty",
        description: "Check specialty metabolic and cardiovascular medications we carry.",
      },
    ],
  },
  {
    pattern: /cancer|oncology|autoimmune|rheumatoid|crohn|ulcerative|multiple sclerosis|ms|psoriasis|lupus/i,
    steps: [
      {
        label: "Explore Specialty Medications",
        url: "/specialty",
        description: "We carry a wide range of specialty medications for complex conditions.",
      },
      {
        label: "Transfer Your Prescription",
        url: "/",
        description: "Transfer specialty prescriptions to Concordia for personalized care.",
      },
    ],
  },
  {
    pattern: /arthritis|joint|orthopedic|back pain|spine|osteoporosis|bone/i,
    steps: [
      {
        label: "Transfer Your Prescription",
        url: "/",
        description: "Consolidate your pain management prescriptions with us for easy refills.",
      },
      {
        label: "Explore OTC Pain Relief",
        url: "/shop",
        description: "Browse our OTC pain relief products for everyday comfort.",
      },
    ],
  },
  {
    pattern: /anxiety|depression|mental health|psychiatric|bipolar|schizophrenia|adhd|ocd|ptsd/i,
    steps: [
      {
        label: "Transfer Your Prescription",
        url: "/",
        description: "Discreet, fast refills for your mental health medications.",
      },
      {
        label: "Explore Specialty Medications",
        url: "/specialty",
        description: "We carry specialty psychiatric medications with personalized support.",
      },
    ],
  },
];

const DEFAULT_NEXT_STEPS: NextStep[] = [
  {
    label: "Schedule Your Flu Shot",
    url: "/schedule-flu-shot",
    description: "Stay protected — schedule your annual flu vaccination.",
  },
  {
    label: "Explore Our Loyalty Program",
    url: "/",
    description: "Earn points on every purchase and redeem them for rewards.",
  },
  {
    label: "Contact the Pharmacy",
    url: "/contact",
    description: "Speak directly with our pharmacists for personalized guidance.",
  },
];

export function getNextSteps(conditionName: string): NextStep[] {
  for (const { pattern, steps } of CONDITION_NEXT_STEPS) {
    if (pattern.test(conditionName)) {
      return steps;
    }
  }
  return DEFAULT_NEXT_STEPS;
}
