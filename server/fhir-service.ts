/**
 * EHR Data Bridge — FHIR R4 Patient Bundle
 * Exports a patient's complete pharmacy record as a FHIR R4 Bundle
 * so external EHR systems (Epic, Cerner, Athena, etc.) can consume
 * structured patient data without custom integrations.
 *
 * Resources included:
 *   Patient | MedicationStatement[] | Condition[] | AllergyIntolerance[]
 *   Observation[] (journal vitals) | DocumentReference[] (clinical notes)
 *
 * Spec: HL7 FHIR R4 — https://hl7.org/fhir/R4/
 */

import type { User, Prescription, PatientCondition, HealthJournalEntry, ClinicalNote } from "@shared/schema";

const FHIR_VERSION = "4.0.1";
const SYSTEM_SNOMED = "http://snomed.info/sct";
const SYSTEM_ICD10 = "http://hl7.org/fhir/sid/icd-10-cm";
const SYSTEM_NDC = "http://hl7.org/fhir/sid/ndc";
const SYSTEM_RX_NORM = "http://www.nlm.nih.gov/research/umls/rxnorm";
const SYSTEM_LOINC = "http://loinc.org";

type FhirResource = Record<string, unknown>;
type FhirBundle = {
  resourceType: "Bundle";
  id: string;
  meta: { versionId: string; lastUpdated: string; profile: string[] };
  type: "collection";
  timestamp: string;
  total: number;
  entry: { fullUrl: string; resource: FhirResource }[];
};

function uid(base: string, id: string | number): string {
  return `urn:uuid:${base}-${String(id).replace(/[^a-zA-Z0-9]/g, "-")}`;
}

function fhirDate(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return new Date(d).toISOString().split("T")[0];
}

function fhirDateTime(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return new Date(d).toISOString();
}

// ── Patient resource ──────────────────────────────────────────────────────────
function buildPatientResource(user: User): FhirResource {
  const name: Record<string, unknown>[] = [];
  if (user.firstName || user.lastName) {
    name.push({
      use: "official",
      family: user.lastName ?? undefined,
      given: user.firstName ? [user.firstName] : undefined,
    });
  }

  const telecom: { system: string; value: string; use?: string }[] = [];
  if (user.phoneNumber) telecom.push({ system: "phone", value: user.phoneNumber, use: "mobile" });
  if (user.email) telecom.push({ system: "email", value: user.email });

  const identifier: { system: string; value: string }[] = [];
  if (user.concordiaId) identifier.push({ system: "urn:concordia:patient-id", value: user.concordiaId });
  if (user.mrn) identifier.push({ system: "urn:concordia:mrn", value: user.mrn });
  if (user.primeRxPatientId) identifier.push({ system: "urn:primerx:patient-id", value: String(user.primeRxPatientId) });

  return {
    resourceType: "Patient",
    id: `patient-${user.id}`,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
    identifier: identifier.length ? identifier : undefined,
    active: true,
    name: name.length ? name : undefined,
    telecom: telecom.length ? telecom : undefined,
    gender: user.gender === "Male" ? "male" : user.gender === "Female" ? "female" : "unknown",
    birthDate: fhirDate(user.dateOfBirth),
    address: user.address
      ? [{ use: "home", text: user.address }]
      : undefined,
    extension: user.insuranceProvider
      ? [{ url: "urn:concordia:insurance-plan", valueString: user.insuranceProvider }]
      : undefined,
  };
}

// ── MedicationStatement resources ─────────────────────────────────────────────
function buildMedicationStatement(rx: Prescription, patientRef: string): FhirResource {
  const coding: { system: string; code: string; display: string }[] = [];
  if (rx.ndc) coding.push({ system: SYSTEM_NDC, code: rx.ndc, display: rx.medicationName });
  coding.push({ system: SYSTEM_RX_NORM, code: "unknown", display: rx.genericName ?? rx.medicationName });

  const statusMap: Record<string, string> = {
    active: "active",
    pending_refill: "active",
    expired: "stopped",
    cancelled: "stopped",
    discontinued: "stopped",
  };

  return {
    resourceType: "MedicationStatement",
    id: `medstmt-${rx.id}`,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationstatement"] },
    identifier: [{ system: "urn:concordia:rx-number", value: rx.rxNumber }],
    status: statusMap[rx.status] ?? "unknown",
    medicationCodeableConcept: {
      coding,
      text: rx.medicationName,
    },
    subject: { reference: patientRef },
    effectivePeriod: {
      start: fhirDateTime(rx.dateFilled ?? rx.createdAt),
      end: fhirDateTime(rx.expirationDate),
    },
    dateAsserted: fhirDateTime(rx.createdAt),
    dosage: rx.sig
      ? [{ text: rx.sig, patientInstruction: rx.instructions ?? undefined }]
      : undefined,
    note: rx.instructions ? [{ text: rx.instructions }] : undefined,
    extension: [
      rx.prescribedBy ? { url: "urn:concordia:prescribed-by", valueString: rx.prescribedBy } : null,
      rx.daysSupply ? { url: "urn:concordia:days-supply", valueInteger: rx.daysSupply } : null,
      rx.refillsRemaining != null ? { url: "urn:concordia:refills-remaining", valueInteger: rx.refillsRemaining } : null,
    ].filter(Boolean),
  };
}

// ── Condition resources ───────────────────────────────────────────────────────
function buildConditionResource(condition: PatientCondition, patientRef: string): FhirResource {
  const coding: { system: string; code: string; display: string }[] = [];
  if (condition.icd10Code) {
    coding.push({ system: SYSTEM_ICD10, code: condition.icd10Code, display: condition.conditionName });
  }
  coding.push({ system: SYSTEM_SNOMED, code: "unknown", display: condition.conditionName });

  const clinStatusMap: Record<string, string> = {
    active: "active",
    resolved: "resolved",
    inactive: "inactive",
    chronic: "active",
  };

  return {
    resourceType: "Condition",
    id: `condition-${condition.id}`,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition"] },
    clinicalStatus: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
        code: clinStatusMap[condition.status ?? "active"] ?? "active",
      }],
    },
    verificationStatus: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
        code: "confirmed",
      }],
    },
    code: { coding, text: condition.conditionName },
    subject: { reference: patientRef },
    onsetDateTime: fhirDateTime(condition.diagnosedAt),
    note: condition.notes ? [{ text: condition.notes }] : undefined,
  };
}

// ── Observation resources (from health journal) ───────────────────────────────
function buildObservations(entry: HealthJournalEntry, patientRef: string): FhirResource[] {
  const obs: FhirResource[] = [];
  const base = `obs-journal-${entry.id}`;
  const effectiveDate = fhirDateTime(entry.entryDate);

  if (entry.symptomSeverity != null) {
    obs.push({
      resourceType: "Observation",
      id: `${base}-symptom`,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
      code: { coding: [{ system: SYSTEM_LOINC, code: "72514-3", display: "Pain severity - 0-10 numeric rating" }], text: "Symptom Severity" },
      subject: { reference: patientRef },
      effectiveDateTime: effectiveDate,
      valueInteger: entry.symptomSeverity,
    });
  }

  if (entry.mood) {
    obs.push({
      resourceType: "Observation",
      id: `${base}-mood`,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
      code: { coding: [{ system: SYSTEM_LOINC, code: "72166-2", display: "Tobacco smoking status" }], text: "Mood" },
      subject: { reference: patientRef },
      effectiveDateTime: effectiveDate,
      valueString: entry.mood,
    });
  }

  if (entry.sideEffectsText) {
    obs.push({
      resourceType: "Observation",
      id: `${base}-sideeffects`,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
      code: { coding: [{ system: SYSTEM_LOINC, code: "89188-2", display: "Adverse drug event" }], text: "Side Effects" },
      subject: { reference: patientRef },
      effectiveDateTime: effectiveDate,
      valueString: entry.sideEffectsText,
    });
  }

  return obs;
}

// ── DocumentReference (clinical notes) ───────────────────────────────────────
function buildDocumentReference(note: ClinicalNote, patientRef: string): FhirResource {
  const typeMap: Record<string, { code: string; display: string }> = {
    soap: { code: "11506-3", display: "Progress note" },
    progress: { code: "11506-3", display: "Progress note" },
    medication_review: { code: "56445-0", display: "Medication summary" },
    counseling: { code: "11488-4", display: "Consultation note" },
    discharge_summary: { code: "18842-5", display: "Discharge summary" },
  };

  const noteType = typeMap[note.noteType] ?? typeMap.soap;
  const content = [note.subjective, note.objective, note.assessment, note.plan]
    .filter(Boolean)
    .join("\n\n");

  return {
    resourceType: "DocumentReference",
    id: `docref-${note.id}`,
    status: note.status === "finalized" ? "current" : "preliminary",
    type: {
      coding: [{ system: SYSTEM_LOINC, code: noteType.code, display: noteType.display }],
      text: `${note.noteType.replace("_", " ")} note`,
    },
    subject: { reference: patientRef },
    date: fhirDateTime(note.noteDate ?? note.createdAt),
    author: note.authorId ? [{ reference: `Practitioner/${note.authorId}` }] : undefined,
    content: [{
      attachment: {
        contentType: "text/plain",
        data: Buffer.from(content).toString("base64"),
        title: `${note.noteType.toUpperCase()} Note — ${new Date(note.noteDate ?? note.createdAt).toLocaleDateString()}`,
      },
    }],
    extension: note.aiGenerated
      ? [{ url: "urn:concordia:ai-generated", valueBoolean: true }]
      : undefined,
  };
}

// ── Bundle Builder ────────────────────────────────────────────────────────────
export interface FhirBundleInput {
  user: User;
  prescriptions: Prescription[];
  conditions: PatientCondition[];
  journalEntries: HealthJournalEntry[];
  clinicalNotes: ClinicalNote[];
}

export function buildFhirBundle(input: FhirBundleInput): FhirBundle {
  const { user, prescriptions, conditions, journalEntries, clinicalNotes } = input;
  const now = new Date().toISOString();
  const patientId = `patient-${user.id}`;
  const patientRef = `Patient/${patientId}`;

  const entries: { fullUrl: string; resource: FhirResource }[] = [];

  // Patient resource
  const patientResource = buildPatientResource(user);
  entries.push({ fullUrl: uid("patient", user.id), resource: patientResource });

  // MedicationStatements
  for (const rx of prescriptions) {
    entries.push({
      fullUrl: uid("medstmt", rx.id),
      resource: buildMedicationStatement(rx, patientRef),
    });
  }

  // Conditions
  for (const cond of conditions) {
    entries.push({
      fullUrl: uid("condition", cond.id),
      resource: buildConditionResource(cond, patientRef),
    });
  }

  // Observations from journal
  for (const entry of journalEntries) {
    const obs = buildObservations(entry, patientRef);
    for (const o of obs) {
      entries.push({ fullUrl: uid("obs", (o as { id: string }).id), resource: o });
    }
  }

  // Clinical notes as DocumentReferences
  for (const note of clinicalNotes.filter((n) => n.status !== "archived")) {
    entries.push({
      fullUrl: uid("docref", note.id),
      resource: buildDocumentReference(note, patientRef),
    });
  }

  return {
    resourceType: "Bundle",
    id: `bundle-${user.id}-${Date.now()}`,
    meta: {
      versionId: "1",
      lastUpdated: now,
      profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference"],
    },
    type: "collection",
    timestamp: now,
    total: entries.length,
    entry: entries,
  };
}
