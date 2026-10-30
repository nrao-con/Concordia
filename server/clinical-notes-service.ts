/**
 * Clinical Notes Engine
 * Generates AI SOAP notes (Subjective / Objective / Assessment / Plan)
 * from a patient's conditions, medications, and health journal entries.
 *
 * Notes are stored in the clinical_notes table and can be reviewed /
 * finalized by a pharmacist before being shared externally.
 */

import { z } from "zod";
import { generateStructuredResponse } from "./ai-client";
import { storage } from "./storage";
import type { PatientCondition, Prescription, HealthJournalEntry } from "@shared/schema";

// ── Output schema for AI-generated SOAP note ─────────────────────────────────
const soapNoteSchema = z.object({
  subjective: z.string().min(10),
  objective: z.string().min(10),
  assessment: z.string().min(10),
  plan: z.string().min(10),
  tags: z.array(z.string()).default([]),
});

export type SoapNoteOutput = z.infer<typeof soapNoteSchema>;

// ── Progress note schema ──────────────────────────────────────────────────────
const progressNoteSchema = z.object({
  summary: z.string().min(10),
  medicationChanges: z.array(z.string()).default([]),
  adherenceAssessment: z.string(),
  followUpItems: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type ProgressNoteOutput = z.infer<typeof progressNoteSchema>;

// ── Medication review schema ──────────────────────────────────────────────────
const medicationReviewSchema = z.object({
  overallAssessment: z.string().min(10),
  medicationList: z.array(z.object({
    name: z.string(),
    indication: z.string(),
    adherenceRisk: z.enum(["low", "medium", "high"]),
    notes: z.string(),
  })).default([]),
  potentialInteractions: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type MedicationReviewOutput = z.infer<typeof medicationReviewSchema>;

// ── Build context string from patient data ─────────────────────────────────────
function buildPatientContext(
  conditions: PatientCondition[],
  prescriptions: Prescription[],
  journalEntries: HealthJournalEntry[]
): string {
  const conditionList = conditions.length
    ? conditions
        .map((c) => `- ${c.conditionName}${c.icd10Code ? ` (ICD-10: ${c.icd10Code})` : ""}${c.notes ? `: ${c.notes}` : ""}`)
        .join("\n")
    : "No documented conditions.";

  const medList = prescriptions.length
    ? prescriptions
        .filter((rx) => rx.status === "active")
        .map((rx) => `- ${rx.medicationName} ${rx.dosage}${rx.sig ? ` — SIG: ${rx.sig}` : ""}${rx.instructions ? ` — Notes: ${rx.instructions}` : ""}`)
        .join("\n")
    : "No active prescriptions.";

  const recentJournal = journalEntries.slice(0, 5);
  const journalSummary = recentJournal.length
    ? recentJournal
        .map((j) => {
          const parts = [];
          if (j.symptomSeverity) parts.push(`symptom severity ${j.symptomSeverity}/10`);
          if (j.mood) parts.push(`mood: ${j.mood}`);
          if (j.energyLevel) parts.push(`energy: ${j.energyLevel}`);
          if (j.sideEffectsText) parts.push(`side effects: ${j.sideEffectsText}`);
          if (j.notes) parts.push(j.notes);
          return `- ${new Date(j.entryDate).toLocaleDateString()}: ${parts.join("; ")}`;
        })
        .join("\n")
    : "No recent journal entries.";

  return `MEDICAL CONDITIONS:\n${conditionList}\n\nACTIVE MEDICATIONS:\n${medList}\n\nRECENT HEALTH JOURNAL (last 5 entries):\n${journalSummary}`;
}

// ── Generate SOAP Note ─────────────────────────────────────────────────────────
export async function generateSoapNote(
  userId: string,
  conditions: PatientCondition[],
  prescriptions: Prescription[],
  journalEntries: HealthJournalEntry[]
): Promise<SoapNoteOutput> {
  const context = buildPatientContext(conditions, prescriptions, journalEntries);

  const systemPrompt = `You are a clinical pharmacist generating a structured SOAP note for a pharmacy patient record.
Write in clear, professional clinical language. Be concise and factual. Do not invent data not present in the context.
Respond with valid JSON exactly matching this schema:
{
  "subjective": "<Patient-reported symptoms, concerns, and history as described in their journal and conditions>",
  "objective": "<Observable/documented data: active medications, condition diagnoses, adherence indicators from journal>",
  "assessment": "<Clinical assessment synthesizing the subjective and objective data, note any drug-condition interactions, adherence risks, or clinical concerns>",
  "plan": "<Recommended plan: medication adjustments to discuss with prescriber, counseling points, monitoring parameters, follow-up timing>",
  "tags": ["<relevant clinical tag>", ...]
}
Important: This note is for pharmacy records only. Do not make diagnosis changes. Flag concerns for prescriber review.`;

  const prompt = `Generate a pharmacy SOAP note for this patient:\n\n${context}`;

  const raw = await generateStructuredResponse<unknown>(prompt, systemPrompt);
  return soapNoteSchema.parse(raw);
}

// ── Generate Progress Note ─────────────────────────────────────────────────────
export async function generateProgressNote(
  userId: string,
  conditions: PatientCondition[],
  prescriptions: Prescription[],
  journalEntries: HealthJournalEntry[]
): Promise<ProgressNoteOutput> {
  const context = buildPatientContext(conditions, prescriptions, journalEntries);

  const systemPrompt = `You are a clinical pharmacist writing a pharmacy progress note.
Focus on medication adherence, therapy changes, and patient wellbeing trends.
Respond with valid JSON exactly matching:
{
  "summary": "<Brief narrative of the patient's current status and recent progress>",
  "medicationChanges": ["<any changes or concerns about current medications>"],
  "adherenceAssessment": "<Assessment of medication adherence based on journal and refill history>",
  "followUpItems": ["<item requiring follow-up or monitoring>"],
  "tags": ["<tag>"]
}`;

  const prompt = `Write a progress note for this patient:\n\n${context}`;
  const raw = await generateStructuredResponse<unknown>(prompt, systemPrompt);
  return progressNoteSchema.parse(raw);
}

// ── Generate Medication Review ─────────────────────────────────────────────────
export async function generateMedicationReview(
  userId: string,
  prescriptions: Prescription[],
  conditions: PatientCondition[]
): Promise<MedicationReviewOutput> {
  const medList = prescriptions
    .filter((rx) => rx.status === "active")
    .map((rx) => `${rx.medicationName} ${rx.dosage}${rx.drugClass ? ` [${rx.drugClass}]` : ""}${rx.genericName ? ` (generic: ${rx.genericName})` : ""}`)
    .join(", ");

  const conditionList = conditions
    .map((c) => `${c.conditionName}${c.icd10Code ? ` (${c.icd10Code})` : ""}`)
    .join(", ");

  const systemPrompt = `You are a clinical pharmacist performing a comprehensive medication review.
Identify potential drug interactions, duplicate therapies, and adherence risks.
Respond with valid JSON matching exactly:
{
  "overallAssessment": "<Overall assessment of the patient's medication regimen>",
  "medicationList": [
    {"name": "<med name>", "indication": "<likely indication>", "adherenceRisk": "low|medium|high", "notes": "<clinical notes>"}
  ],
  "potentialInteractions": ["<describe any potential drug-drug or drug-disease interactions>"],
  "recommendations": ["<actionable recommendation for pharmacist or prescriber>"],
  "tags": ["<tag>"]
}
Do not recommend specific dose changes without prescriber involvement. Flag concerns clearly.`;

  const prompt = `Perform a medication review.\nActive medications: ${medList || "None"}\nDiagnoses: ${conditionList || "None documented"}`;
  const raw = await generateStructuredResponse<unknown>(prompt, systemPrompt);
  return medicationReviewSchema.parse(raw);
}

// ── Orchestrator: create and persist a clinical note ──────────────────────────
export async function createClinicalNote(params: {
  userId: string;
  noteType: "soap" | "progress" | "medication_review";
  conditionId?: string;
  authorId?: string;
}): Promise<import("@shared/schema").ClinicalNote> {
  const { userId, noteType, conditionId, authorId } = params;

  // Load patient data
  const [conditions, prescriptions, journalEntries] = await Promise.all([
    storage.getPatientConditions(userId),
    storage.getPrescriptionsByUserId(userId),
    storage.getHealthJournalEntries(userId, { limit: 10 }),
  ]);

  // Snapshot active medications at time of note
  const medicationsAtTime = prescriptions
    .filter((rx) => rx.status === "active")
    .map((rx) => ({
      rxNumber: rx.rxNumber,
      medicationName: rx.medicationName,
      dosage: rx.dosage,
    }));

  let noteData: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    tags: string[];
  };

  if (noteType === "soap") {
    const soap = await generateSoapNote(userId, conditions, prescriptions, journalEntries);
    noteData = soap;
  } else if (noteType === "progress") {
    const progress = await generateProgressNote(userId, conditions, prescriptions, journalEntries);
    noteData = {
      subjective: progress.summary,
      objective: `Adherence: ${progress.adherenceAssessment}`,
      assessment: progress.medicationChanges.join("; ") || "No changes noted.",
      plan: progress.followUpItems.join("; ") || "Continue current regimen.",
      tags: progress.tags,
    };
  } else {
    const review = await generateMedicationReview(userId, prescriptions, conditions);
    noteData = {
      subjective: "Medication review requested.",
      objective: review.overallAssessment,
      assessment: review.potentialInteractions.join("; ") || "No significant interactions identified.",
      plan: review.recommendations.join("; ") || "Continue current medications.",
      tags: review.tags,
    };
  }

  return storage.createClinicalNote({
    userId,
    noteType,
    conditionId: conditionId ?? null,
    subjective: noteData.subjective ?? null,
    objective: noteData.objective ?? null,
    assessment: noteData.assessment ?? null,
    plan: noteData.plan ?? null,
    aiGenerated: true,
    authorId: authorId ?? null,
    status: "draft",
    tags: noteData.tags,
    medicationsAtTime,
    noteDate: new Date(),
  });
}
