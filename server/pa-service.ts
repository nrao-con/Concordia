/**
 * Prior Authorization (PA) Generation Engine
 * Generates structured PA request letters using patient demographics,
 * diagnosis (ICD-10), medication (NDC + drug info), and insurance data.
 *
 * Output: plain-text letter body + HTML version suitable for PDF export.
 * Admin staff review, edit, and track submissions through the PA workflow.
 */

import { z } from "zod";
import { generateStructuredResponse } from "./ai-client";
import { storage } from "./storage";
import { getDrugInfoByNdc } from "./ndc-service";
import type { User, Prescription, PatientCondition } from "@shared/schema";

// ── AI output schema ──────────────────────────────────────────────────────────
const paLetterSchema = z.object({
  letterText: z.string().min(100),
  clinicalJustification: z.string().min(50),
  keyPoints: z.array(z.string()).min(2),
  urgencyLevel: z.enum(["routine", "urgent", "expedited"]).default("routine"),
  suggestedSupportingDocs: z.array(z.string()).default([]),
});

export type PaLetterOutput = z.infer<typeof paLetterSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildPatientDemographics(user: User): string {
  const parts: string[] = [];
  if (user.firstName || user.lastName)
    parts.push(`Patient: ${[user.firstName, user.lastName].filter(Boolean).join(" ")}`);
  if (user.dateOfBirth) parts.push(`DOB: ${user.dateOfBirth}`);
  if (user.phoneNumber) parts.push(`Phone: ${user.phoneNumber}`);
  if (user.email) parts.push(`Email: ${user.email}`);
  if (user.insurancePolicyNumber) parts.push(`Policy #: ${user.insurancePolicyNumber}`);
  if (user.insuranceProvider) parts.push(`Insurance: ${user.insuranceProvider}`);
  if (user.insuranceGroupNumber) parts.push(`Group #: ${user.insuranceGroupNumber}`);
  return parts.join("\n") || "Demographics unavailable.";
}

function buildMedicationContext(
  prescription: Prescription,
  drugInfo: Awaited<ReturnType<typeof getDrugInfoByNdc>>
): string {
  const parts: string[] = [
    `Medication: ${prescription.medicationName}`,
    `Dosage: ${prescription.dosage}`,
  ];
  if (prescription.strength) parts.push(`Strength: ${prescription.strength}`);
  if (prescription.ndc) parts.push(`NDC: ${prescription.ndc}`);
  if (prescription.daysSupply) parts.push(`Days Supply: ${prescription.daysSupply}`);
  if (prescription.sig) parts.push(`SIG: ${prescription.sig}`);
  if (prescription.prescribedBy) parts.push(`Prescriber: ${prescription.prescribedBy}`);
  if (prescription.drugClass) parts.push(`Drug Class: ${prescription.drugClass}`);

  if (drugInfo) {
    if (drugInfo.pharmClass) parts.push(`Pharmacological Class: ${drugInfo.pharmClass}`);
    if (drugInfo.substanceName) parts.push(`Active Ingredient: ${drugInfo.substanceName}`);
    if (drugInfo.productType) parts.push(`Product Type: ${drugInfo.productType}`);
  }
  return parts.join("\n");
}

/** Escape a string for safe interpolation into HTML attributes and text nodes. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPaHtml(letterText: string, patientName: string, medicationName: string, date: string): string {
  const escapedPatient = escapeHtml(patientName);
  const escapedMed = escapeHtml(medicationName);
  const escapedDate = escapeHtml(date);

  const escaped = letterText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n\n")
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Prior Authorization Request — ${escapedMed}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 0 20px; }
  .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 24px; }
  .header h1 { font-size: 16pt; margin: 0 0 4px; }
  .header p { margin: 2px 0; font-size: 10pt; color: #333; }
  .section { margin-bottom: 16px; }
  .section h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
  p { margin: 0 0 8px; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 10pt; color: #555; }
</style>
</head>
<body>
<div class="header">
  <h1>Prior Authorization Request</h1>
  <p>Concordia Pharmacy &nbsp;|&nbsp; Date: ${escapedDate}</p>
  <p>Patient: ${escapedPatient} &nbsp;|&nbsp; Medication: ${escapedMed}</p>
</div>
<div class="section">
${escaped}
</div>
<div class="footer">
  <p>This document was prepared by Concordia Pharmacy staff. AI assistance was used to draft this letter; it has been reviewed for clinical accuracy.</p>
  <p>Concordia Pharmacy &nbsp;|&nbsp; 96-01 63rd Dr, Rego Park, NY 11374 &nbsp;|&nbsp; (718) 830-8833</p>
</div>
</body>
</html>`;
}

// ── Core PA Letter Generator ──────────────────────────────────────────────────
export async function generatePaLetter(params: {
  user: User;
  prescription: Prescription;
  conditions: PatientCondition[];
  overrideInsurance?: {
    planName?: string;
    memberId?: string;
    bin?: string;
    pcn?: string;
  };
  additionalClinicalContext?: string; // RFI/resubmission extra context
}): Promise<PaLetterOutput> {
  const { user, prescription, conditions, overrideInsurance, additionalClinicalContext } = params;

  // Enrich with OpenFDA drug data
  const drugInfo = prescription.ndc
    ? await getDrugInfoByNdc(prescription.ndc)
    : null;

  const demographics = buildPatientDemographics(user);
  const medContext = buildMedicationContext(prescription, drugInfo);

  const diagnosisList = conditions.length
    ? conditions
        .map((c) => `- ${c.conditionName}${c.icd10Code ? ` (ICD-10: ${c.icd10Code})` : ""}`)
        .join("\n")
    : "Diagnosis information not documented.";

  const insurancePlan =
    overrideInsurance?.planName ??
    user.insuranceProvider ??
    "[Insurance Plan Name]";

  const systemPrompt = `You are a pharmacy prior authorization specialist writing a PA request letter to a health insurance payer.
Write in clear, professional medical/insurance language. Structure the letter for maximum approval likelihood.
Be factual and base the clinical justification strictly on the information provided — do not fabricate clinical data.
Respond with valid JSON exactly matching:
{
  "letterText": "<Full formal letter text, 300-600 words. Include: date, addressee (insurance plan), patient info, medication details, diagnosis/ICD-10, clinical justification, request statement, contact info, signature block>",
  "clinicalJustification": "<Concise 100-150 word clinical justification paragraph suitable for appeals or re-use>",
  "keyPoints": ["<key argument 1>", "<key argument 2>", ...],
  "urgencyLevel": "routine|urgent|expedited",
  "suggestedSupportingDocs": ["<document type that would strengthen the PA>"]
}`;

  const prompt = `Generate a prior authorization request letter for:

PATIENT DEMOGRAPHICS:
${demographics}

MEDICATION REQUESTED:
${medContext}

DIAGNOSES / INDICATIONS:
${diagnosisList}

INSURANCE PLAN: ${insurancePlan}
${overrideInsurance?.memberId ? `MEMBER ID: ${overrideInsurance.memberId}` : ""}
${additionalClinicalContext ? `\nADDITIONAL CLINICAL CONTEXT (RFI RESPONSE — incorporate into letter):\n${additionalClinicalContext}` : ""}
TODAY'S DATE: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

PHARMACY:
Concordia Pharmacy
96-01 63rd Dr, Rego Park, NY 11374
Phone: (718) 830-8833
NPI: [Pharmacy NPI]`;

  const raw = await generateStructuredResponse<unknown>(prompt, systemPrompt);
  return paLetterSchema.parse({ ...( typeof raw === "object" && raw !== null ? raw : {} ), urgencyLevel: (raw as { urgencyLevel?: string })?.urgencyLevel ?? "routine" });
}

// ── Appeal Letter Schema ───────────────────────────────────────────────────────
const appealLetterSchema = z.object({
  letterText: z.string().min(100),
  peerToPeerPrepNote: z.string().min(50),
  keyArguments: z.array(z.string()).min(2),
  citedGuidelines: z.array(z.string()).default([]),
  recommendedSupportingDocs: z.array(z.string()).default([]),
});

export type AppealLetterOutput = z.infer<typeof appealLetterSchema>;

export function buildAppealHtml(
  letterText: string,
  patientName: string,
  medicationName: string,
  date: string
): string {
  const escapedPatient = escapeHtml(patientName);
  const escapedMed = escapeHtml(medicationName);
  const escapedDate = escapeHtml(date);

  const escaped = letterText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n\n")
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Prior Authorization Appeal — ${escapedMed}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 800px; margin: 40px auto; padding: 0 20px; }
  .header { border-bottom: 2px solid #8B0000; padding-bottom: 12px; margin-bottom: 24px; }
  .header h1 { font-size: 16pt; margin: 0 0 4px; color: #8B0000; }
  .header p { margin: 2px 0; font-size: 10pt; color: #333; }
  .section { margin-bottom: 16px; }
  .section h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
  p { margin: 0 0 8px; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 12px; font-size: 10pt; color: #555; }
</style>
</head>
<body>
<div class="header">
  <h1>Prior Authorization Appeal Letter</h1>
  <p>Concordia Pharmacy &nbsp;|&nbsp; Date: ${escapedDate}</p>
  <p>Patient: ${escapedPatient} &nbsp;|&nbsp; Medication: ${escapedMed}</p>
</div>
<div class="section">
${escaped}
</div>
<div class="footer">
  <p>This appeal was prepared by Concordia Pharmacy clinical staff. AI assistance was used to draft this letter; it has been reviewed for clinical accuracy.</p>
  <p>Concordia Pharmacy &nbsp;|&nbsp; 96-01 63rd Dr, Rego Park, NY 11374 &nbsp;|&nbsp; (718) 830-8833</p>
</div>
</body>
</html>`;
}

// ── Appeal Letter Generator ───────────────────────────────────────────────────
export async function generateAppealLetter(params: {
  pa: import("@shared/schema").PriorAuthorizationRequest;
  drugInfo?: Awaited<ReturnType<typeof getDrugInfoByNdc>>;
}): Promise<AppealLetterOutput> {
  const { pa, drugInfo } = params;

  const systemPrompt = `You are a clinical pharmacist and prior authorization specialist writing a formal appeal letter to overturn an insurance denial.
Your goal is to construct the strongest possible medical necessity argument using:
- FDA-approved indications for the requested medication
- Clinical practice guidelines (ACC, AHA, ADA, ASCO, etc.)
- Step therapy and formulary exception arguments
- Peer-reviewed medical literature citations (use well-known journals: NEJM, JAMA, Lancet, etc.)
Write authoritatively. The letter should be compelling, evidence-based, and professionally formatted.
Be factual — do not fabricate specific patient lab values or dates not provided to you.

Respond with valid JSON exactly matching:
{
  "letterText": "<Full formal appeal letter, 400-700 words. Include: date, re: line with patient name + medication, clear statement of appeal, clinical necessity argument, FDA indication language, step therapy failure statement if applicable, literature citations, peer-to-peer review request, contact info, signature block>",
  "peerToPeerPrepNote": "<100-150 word prep note for the prescribing physician for a peer-to-peer review call. Bullet-point key arguments to make verbally.>",
  "keyArguments": ["<strongest argument 1>", "<strongest argument 2>", ...],
  "citedGuidelines": ["<guideline or citation 1>", ...],
  "recommendedSupportingDocs": ["<document that would strengthen the appeal>"]
}`;

  const diagnosisText = [
    pa.diagnosisDescription,
    pa.icd10Code ? `(ICD-10: ${pa.icd10Code})` : "",
  ].filter(Boolean).join(" ") || "Not documented";

  const drugContext = drugInfo
    ? [
        drugInfo.pharmClass ? `Pharmacological Class: ${drugInfo.pharmClass}` : "",
        drugInfo.substanceName ? `Active Ingredient: ${drugInfo.substanceName}` : "",
        drugInfo.deaSchedule ? `DEA Schedule: ${drugInfo.deaSchedule}` : "",
        drugInfo.warnings?.length ? `Key Warnings: ${drugInfo.warnings[0]?.slice(0, 300)}` : "",
      ].filter(Boolean).join("\n")
    : "FDA drug data not available.";

  const prompt = `Generate a prior authorization appeal letter for a DENIED PA request:

MEDICATION: ${pa.medicationName}
${pa.strength ? `STRENGTH: ${pa.strength}` : ""}
${pa.ndc ? `NDC: ${pa.ndc}` : ""}
${pa.daysSupply ? `DAYS SUPPLY: ${pa.daysSupply}` : ""}

DIAGNOSIS: ${diagnosisText}

INSURANCE PLAN: ${pa.insurancePlanName ?? "[Insurance Plan]"}
${pa.insuranceMemberId ? `MEMBER ID: ${pa.insuranceMemberId}` : ""}
${pa.referenceNumber ? `ORIGINAL PA REFERENCE #: ${pa.referenceNumber}` : ""}

DENIAL REASON: ${pa.denialReason ?? "Not specified — write a broad medical necessity appeal."}

CLINICAL JUSTIFICATION FROM ORIGINAL PA:
${pa.clinicalNotes ?? "Not available."}

PRESCRIBER: ${pa.prescriberName ?? "Treating Physician"}

FDA DRUG INFORMATION:
${drugContext}

TODAY'S DATE: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

PHARMACY:
Concordia Pharmacy
96-01 63rd Dr, Rego Park, NY 11374
Phone: (718) 830-8833`;

  const raw = await generateStructuredResponse<unknown>(prompt, systemPrompt);
  return appealLetterSchema.parse(
    typeof raw === "object" && raw !== null ? raw : {}
  );
}

// ── Prescriber e-signature helpers ────────────────────────────────────────────

/**
 * Embed a base64-encoded signature image (PNG data URL) and signer info
 * into an existing PA letter HTML document, inserting a signature block
 * just before </body>.
 */
/**
 * Strict allow-list for signature data URLs.
 * Accepts ONLY `data:image/png;base64,` followed by standard base64 characters.
 * Rejects anything that could break out of an HTML attribute (quotes, angle
 * brackets, event handlers, javascript: URIs, etc.).
 */
const SAFE_PNG_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

export function validateSignatureDataUrl(dataUrl: string): void {
  if (!SAFE_PNG_DATA_URL_RE.test(dataUrl)) {
    throw new Error(
      "signatureDataUrl must be a valid PNG base64 data URL (data:image/png;base64,...)"
    );
  }
  // Reject suspiciously large payloads (>300 KB of base64 ≈ >225 KB raw)
  if (dataUrl.length > 400_000) {
    throw new Error("Signature image exceeds maximum allowed size");
  }
}

export function embedSignatureInHtml(
  letterHtml: string,
  signatureDataUrl: string,
  signerName: string,
  signedAt: string
): string {
  // Defensive validation — the route validates first, but a belt-and-suspenders
  // check here ensures no code path bypasses the allow-list.
  validateSignatureDataUrl(signatureDataUrl);

  // escapeHtml encodes quotes → &quot; so the src attribute cannot be broken out of.
  const safeSrc = escapeHtml(signatureDataUrl);

  const block = `
<div style="margin-top:48px;border-top:2px solid #000;padding-top:16px;font-family:Arial,sans-serif;">
  <p style="font-size:10pt;font-weight:bold;margin:0 0 8px;color:#000;">Prescriber Electronic Signature</p>
  <img src="${safeSrc}" alt="Prescriber signature"
    style="max-width:320px;max-height:100px;height:auto;border:1px solid #ccc;display:block;margin-bottom:8px;" />
  <p style="font-size:11pt;margin:0 0 4px;color:#000;">${escapeHtml(signerName)}</p>
  <p style="font-size:9pt;color:#555;margin:0;">Signed electronically on ${escapeHtml(signedAt)}</p>
  <p style="font-size:8pt;color:#888;margin:4px 0 0;">
    This e-signature is provided for workflow purposes. It was applied via a secure one-time link
    sent to the prescriber&apos;s email on file. Concordia Pharmacy — ${escapeHtml(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))}
  </p>
</div>`;
  // Insert before </body> — fall back to appending if tag not found
  if (letterHtml.includes("</body>")) {
    return letterHtml.replace("</body>", block + "\n</body>");
  }
  return letterHtml + block;
}

// ── Orchestrator: create and persist a PA request ─────────────────────────────
export async function createPriorAuthRequest(params: {
  userId: string;
  prescriptionId: string;
  conditionIds?: string[];
  overrideInsurance?: {
    planName?: string;
    memberId?: string;
    bin?: string;
    pcn?: string;
  };
  createdByAdmin?: string;
}): Promise<import("@shared/schema").PriorAuthorizationRequest> {
  const { userId, prescriptionId, conditionIds, overrideInsurance, createdByAdmin } = params;

  // Load required data
  const [user, prescription, allConditions] = await Promise.all([
    storage.getUser(userId),
    storage.getPrescription(prescriptionId),
    storage.getPatientConditions(userId),
  ]);

  if (!user) throw new Error(`Patient not found: ${userId}`);
  if (!prescription) throw new Error(`Prescription not found: ${prescriptionId}`);

  // Filter to specified conditions or use all
  const conditions = conditionIds?.length
    ? allConditions.filter((c) => conditionIds.includes(c.id))
    : allConditions;

  const paLetter = await generatePaLetter({ user, prescription, conditions, overrideInsurance });

  const patientName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Patient";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const letterHtml = buildPaHtml(paLetter.letterText, patientName, prescription.medicationName, date);

  return storage.createPriorAuthRequest({
    userId,
    prescriptionId,
    medicationName: prescription.medicationName,
    ndc: prescription.ndc ?? null,
    strength: prescription.strength ?? null,
    daysSupply: prescription.daysSupply ?? null,
    quantityRequested: prescription.qtyOrdered ?? null,
    icd10Code: conditions[0]?.icd10Code ?? null,
    diagnosisDescription: conditions.map((c) => c.conditionName).join("; ") || null,
    insurancePlanName: overrideInsurance?.planName ?? user.insuranceProvider ?? null,
    insuranceMemberId: overrideInsurance?.memberId ?? user.insurancePolicyNumber ?? null,
    insuranceBinNumber: overrideInsurance?.bin ?? null,
    insurancePcnNumber: overrideInsurance?.pcn ?? null,
    payerId: null,
    prescriberName: prescription.prescribedBy ?? null,
    prescriberNpi: null,
    prescriberPhone: null,
    prescriberFax: null,
    prescriberAddress: null,
    letterText: paLetter.letterText,
    letterHtml,
    clinicalNotes: paLetter.clinicalJustification,
    supportingDocuments: paLetter.suggestedSupportingDocs.map((label) => ({ label, url: "" })),
    status: "draft",
    aiGenerated: true,
    assignedTo: createdByAdmin ?? null,
    adminNotes: null,
    referenceNumber: null,
    denialReason: null,
  });
}
