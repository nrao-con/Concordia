/**
 * Patient identity resolution and ticket ownership helpers shared by the
 * external-facing API routes (flu-shot and insurance-help single-ticket
 * lookups).  Keeping this logic in one place allows it to be tested directly
 * without bootstrapping the full Express application.
 */

import { isConcordiaId } from "./concordiaId";

export interface PatientIdentityStore {
  getUserByConcordiaCareUserId(id: string): Promise<{ id: string; email?: string | null } | undefined | null>;
  getUserByEmail(email: string): Promise<{ id: string; email?: string | null } | undefined | null>;
  getUserByConcordiaId(concordiaId: string): Promise<{ id: string; email?: string | null } | undefined | null>;
  getUsersByPhone(phone: string): Promise<Array<{ id: string; email?: string | null }>>;
  getUser(id: string): Promise<FullPatientRecord | undefined>;
}

export interface FullPatientRecord {
  id: string;
  concordiaId?: string | null;
  concordiaCareUserId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | string | null;
  gender?: string | null;
  language?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  address?: string | null;
  insuranceProvider?: string | null;
  insurancePolicyNumber?: string | null;
  insuranceGroupNumber?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  loyaltyPoints?: number | null;
  usingApp?: boolean | null;
  patientStatus?: string | null;
  createdAt?: Date | string | null;
}

export interface ResolvedIdentity {
  patientUserId: string | null;
  patientEmail: string | null;
}

export interface PatientIdentityBlock {
  concordiaId: string | null;
  internalId: string;
  concordiaCareId: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  language: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  insurance: {
    provider: string | null;
    policyNumber: string | null;
    groupNumber: string | null;
  };
  allergies: string | null;
  conditions: string | null;
  loyalty: {
    points: number;
    memberSince: string | null;
  };
  usingApp: boolean;
  status: string;
}

/**
 * Resolve the canonical userId and email for a caller who may supply either a
 * concordiaCareUserId or a raw email address.
 *
 * Priority:
 *   1. concordiaCareUserId → user lookup → use that user's id + email
 *   2. If still no userId, raw email → user lookup → use that user's id + email
 *   3. If still no email, fall back to the raw email string (for pre-reg tickets
 *      where the ticket stores an email but no userId)
 */
export async function resolvePatientIdentity(
  concordiaCareUserId: string | undefined,
  email: string | undefined,
  db: PatientIdentityStore
): Promise<ResolvedIdentity> {
  let patientUserId: string | null = null;
  let patientEmail: string | null = null;

  if (concordiaCareUserId) {
    const patient = await db.getUserByConcordiaCareUserId(concordiaCareUserId);
    if (patient) {
      patientUserId = patient.id;
      patientEmail = patient.email ?? null;
    }
  }
  if (!patientUserId && email) {
    const patient = await db.getUserByEmail(email.toLowerCase().trim());
    if (patient) {
      patientUserId = patient.id;
      patientEmail = patient.email ?? null;
    }
  }
  if (!patientEmail && email) {
    patientEmail = email.toLowerCase().trim();
  }

  return { patientUserId, patientEmail };
}

/**
 * Resolve a patient by any single query string — tries identifiers in priority order:
 *   1. CP-XXXXXX (concordiaId)
 *   2. ConcordiaCare user ID (any stored concordiaCareUserId value, not UUID-restricted)
 *   3. Email (contains @)
 *   4. Phone (digit sequence ≥ 7 digits)
 *   5. Internal UUID (fallback)
 *
 * Note: steps 2 and 5 both hit the DB with the raw query; step 5 is the
 * last resort and will return null for strings that are not valid UUIDs.
 */
export async function resolvePatientByQuery(
  q: string,
  db: PatientIdentityStore
): Promise<FullPatientRecord | null> {
  const query = q.trim();
  if (!query) return null;

  // 1. Concordia Patient ID (CP-XXXXXX)
  if (isConcordiaId(query)) {
    const ref = await db.getUserByConcordiaId(query.toUpperCase());
    if (ref) return (await db.getUser(ref.id)) ?? null;
  }

  // 2. ConcordiaCare user ID — try as stored value; no pattern restriction
  //    (ConcordiaCare IDs can be any format, not just UUIDs)
  if (!isConcordiaId(query) && !query.includes("@")) {
    const ccRef = await db.getUserByConcordiaCareUserId(query);
    if (ccRef) return (await db.getUser(ccRef.id)) ?? null;
  }

  // 3. Email
  if (query.includes("@")) {
    const ref = await db.getUserByEmail(query.toLowerCase());
    if (ref) return (await db.getUser(ref.id)) ?? null;
  }

  // 4. Phone digits (7+ digits)
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 7) {
    const list = await db.getUsersByPhone(digits);
    if (list.length > 0) return (await db.getUser(list[0].id)) ?? null;
  }

  // 5. Internal UUID fallback — getUser will return undefined for invalid IDs
  return (await db.getUser(query)) ?? null;
}

/**
 * Build a standardised Patient Identity Block from a full user record.
 */
export function buildIdentityBlock(user: FullPatientRecord): PatientIdentityBlock {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown";
  const dob = user.dateOfBirth
    ? new Date(user.dateOfBirth as any).toISOString().split("T")[0]
    : null;
  const memberSince = user.createdAt
    ? new Date(user.createdAt as any).toISOString().split("T")[0]
    : null;

  return {
    concordiaId: user.concordiaId ?? null,
    internalId: user.id,
    concordiaCareId: user.concordiaCareUserId ?? null,
    name,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    dateOfBirth: dob,
    gender: user.gender ?? null,
    language: user.language ?? null,
    phone: user.phoneNumber ?? null,
    email: user.email ?? null,
    address: user.address ?? null,
    insurance: {
      provider: user.insuranceProvider ?? null,
      policyNumber: user.insurancePolicyNumber ?? null,
      groupNumber: user.insuranceGroupNumber ?? null,
    },
    allergies: user.allergies ?? null,
    conditions: user.medicalConditions ?? null,
    loyalty: {
      points: user.loyaltyPoints ?? 0,
      memberSince,
    },
    usingApp: user.usingApp ?? false,
    status: user.patientStatus ?? "active",
  };
}

/**
 * Return true when the resolved caller identity owns the given flu-shot ticket.
 * Returns false for absent tickets so callers cannot enumerate valid numbers via
 * divergent HTTP status codes.
 */
export function isFluShotTicketOwned(
  ticket: { userId?: string | null; email?: string | null } | undefined | null,
  identity: ResolvedIdentity
): boolean {
  if (!ticket) return false;
  const { patientUserId, patientEmail } = identity;
  return Boolean(
    (patientUserId && ticket.userId === patientUserId) ||
    (patientEmail && ticket.email && ticket.email.toLowerCase() === patientEmail)
  );
}

/**
 * Return true when the resolved caller identity owns the given insurance-help
 * request.  Same absent-ticket → false semantics as isFluShotTicketOwned.
 */
export function isInsuranceTicketOwned(
  ticket: { userId?: string | null; email?: string | null } | undefined | null,
  identity: ResolvedIdentity
): boolean {
  if (!ticket) return false;
  const { patientUserId, patientEmail } = identity;
  return Boolean(
    (patientUserId && ticket.userId === patientUserId) ||
    (patientEmail && ticket.email && ticket.email.toLowerCase() === patientEmail)
  );
}
