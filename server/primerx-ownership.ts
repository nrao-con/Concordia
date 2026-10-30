/**
 * Ownership checks shared by the PrimeRx ingestion paths.  This module is
 * deliberately free of database imports so the rules can be tested without a
 * live database.
 */
import { createHmac } from "node:crypto";

export const PRIMERX_OWNERSHIP_ERROR = "PRIMERX_OWNERSHIP_CONFLICT";

export function operationalPatientHash(patientId: unknown, secret: string | undefined): string | undefined {
  if (!secret || patientId == null || !String(patientId).trim()) return undefined;
  return createHmac("sha256", secret).update(String(patientId).trim()).digest("hex");
}

export class PrimeRxOwnershipError extends Error {
  readonly code = PRIMERX_OWNERSHIP_ERROR;
  constructor(message = "PrimeRx record requires staff review") {
    super(message);
    this.name = "PrimeRxOwnershipError";
  }
}

export function requiredPrimeRxPatientId(value: unknown): string {
  const id = value == null ? "" : String(value).trim();
  if (!id || id === "undefined" || id === "null") {
    throw new PrimeRxOwnershipError("PrimeRx patient identity is required");
  }
  return id;
}

export type IncomingRx = { rxNumber?: unknown };
export type ExistingRx = { rxNumber?: unknown; userId: string };

/**
 * Validate the complete medication batch before changing a patient, doctor,
 * prescription, or blister record.  Existing prescriptions are globally
 * unique, so an RX may only be replayed for its established owner.
 */
export function assertMedicationOwnership(
  medications: readonly IncomingRx[] | undefined,
  userId: string,
  existing: readonly ExistingRx[],
): void {
  const seen = new Set<string>();
  for (const medication of medications || []) {
    const rx = medication.rxNumber == null ? "" : String(medication.rxNumber).trim();
    if (!rx) throw new PrimeRxOwnershipError("RX identity is required");
    if (seen.has(rx)) throw new PrimeRxOwnershipError("Duplicate RX in PrimeRx batch");
    seen.add(rx);
    const established = existing.find((item) => String(item.rxNumber ?? "").trim() === rx);
    if (established && established.userId !== userId) {
      throw new PrimeRxOwnershipError("RX is already assigned to another patient");
    }
  }
}

export function assertRxOwner(existing: ExistingRx | undefined, userId: string): void {
  if (existing && existing.userId !== userId) {
    throw new PrimeRxOwnershipError("RX is already assigned to another patient");
  }
}