import type { BlisterPackPatient, User } from "@shared/schema";

type PatientIdentity = Pick<BlisterPackPatient, "linkedUserId" | "firstName" | "lastName" | "dateOfBirth">;
type AppIdentity = Pick<User, "id" | "role" | "firstName" | "lastName" | "dateOfBirth" | "concordiaId" | "concordiaCareUserId"> & Partial<Pick<User, "clerkId">>;

export type BlisterSyncIdentity =
  | { ok: true; payload: { userId?: string; concordiaId?: string } }
  | { ok: false; reason: "unlinked" | "mismatch" | "app_link_missing" };

const normalizedName = (name: string | null | undefined) => name?.trim().toLocaleLowerCase() || "";
const normalizedDate = (date: string | Date | null | undefined) =>
  date instanceof Date ? date.toISOString().slice(0, 10) : date?.slice(0, 10) || "";

export function resolveBlisterSyncIdentity(patient: PatientIdentity, user?: AppIdentity): BlisterSyncIdentity {
  if (!patient.linkedUserId || !user) return { ok: false, reason: "unlinked" };
  if (
    user.id !== patient.linkedUserId ||
    user.role !== "patient" ||
    normalizedName(patient.firstName) !== normalizedName(user.firstName) ||
    normalizedName(patient.lastName) !== normalizedName(user.lastName) ||
    (patient.dateOfBirth && user.dateOfBirth &&
      normalizedDate(patient.dateOfBirth) !== normalizedDate(user.dateOfBirth))
  ) {
    return { ok: false, reason: "mismatch" };
  }
  const concordiaId = /^CP-\d{6}$/.test(user.concordiaId?.trim() || "")
    ? user.concordiaId!.trim() : undefined;
  const appUserId = user.concordiaCareUserId?.trim();
  const userId = appUserId && appUserId !== user.id && appUserId !== user.clerkId &&
    !/^user_[a-zA-Z0-9]+$/.test(appUserId) ? appUserId : undefined;
  if (!concordiaId && !userId) {
    return { ok: false, reason: "app_link_missing" };
  }
  return {
    ok: true,
    payload: { ...(userId ? { userId } : {}), ...(concordiaId ? { concordiaId } : {}) },
  };
}

export type BlisterCreatePayload = {
  pharmacyEnrollmentId: string;
  name: string;
  medications: Array<{ name: string; timeSlot: string; [key: string]: unknown }>;
  userId?: string;
  concordiaId?: string;
  [key: string]: unknown;
};

export function mapBlisterCreateMedications(value: unknown): BlisterCreatePayload["medications"] | null {
  if (!Array.isArray(value)) return null;
  const slots: Record<string, string> = {
    morning: "Morning", noon: "Afternoon", evening: "Evening", bedtime: "Bedtime",
  };
  const medications: BlisterCreatePayload["medications"] = [];
  for (const medication of value) {
    if (medication?.isActive === false) continue;
    if (typeof medication?.name !== "string" || !medication.name.trim() ||
        !Array.isArray(medication.intakeTimes) || medication.intakeTimes.length === 0) {
      return null;
    }
    for (const slot of medication.intakeTimes) {
      if (typeof slot !== "string" || !slots[slot]) return null;
      medications.push({
        name: medication.name.trim(),
        strength: medication.dosage || medication.strength || "",
        quantity: medication.dosage || "1 tablet",
        timeSlot: slots[slot],
        instructions: medication.instructions || "",
      });
    }
  }
  return medications;
}

export function isValidBlisterCreatePayload(value: unknown): value is BlisterCreatePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const cp = typeof payload.concordiaId === "string" && /^CP-\d{6}$/.test(payload.concordiaId);
  const userId = typeof payload.userId === "string" && !!payload.userId.trim() &&
    !/^user_[a-zA-Z0-9]+$/.test(payload.userId);
  return typeof payload.pharmacyEnrollmentId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.pharmacyEnrollmentId) &&
    (payload.concordiaId === undefined || cp) &&
    (payload.userId === undefined || userId) &&
    (cp || userId) &&
    typeof payload.name === "string" && !!payload.name.trim() &&
    Array.isArray(payload.medications) &&
    payload.medications.every((medication) =>
      medication && typeof medication === "object" &&
      typeof medication.name === "string" && !!medication.name.trim() &&
      typeof medication.timeSlot === "string" && !!medication.timeSlot.trim());
}

export type BlisterCreateDelivery =
  | { kind: "accepted"; blisterPackId: string }
  | { kind: "rejected"; status: number; code: string | null }
  | { kind: "retry"; status: number | null }
  | { kind: "invalid_response" };

export async function postBlisterCreate(
  endpoint: string,
  apiKey: string,
  payload: BlisterCreatePayload,
  fetcher: typeof fetch = fetch,
): Promise<BlisterCreateDelivery> {
  if (!isValidBlisterCreatePayload(payload)) {
    return { kind: "rejected", status: 0, code: "invalid_sender_payload" };
  }
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 200 || response.status === 201) {
      const body = await response.json().catch(() => null);
      const blisterPackId = getCreatedBlisterPackId(body);
      return blisterPackId ? { kind: "accepted", blisterPackId } : { kind: "invalid_response" };
    }
    if (response.status >= 400 && response.status < 500) {
      const body = await response.json().catch(() => null);
      const rawCode = body && typeof body === "object" ?
        (body as Record<string, unknown>).code ?? (body as Record<string, unknown>).error : null;
      const code = typeof rawCode === "string" && /^[a-z][a-z0-9_]{1,80}$/.test(rawCode)
        ? rawCode : null;
      return { kind: "rejected", status: response.status, code };
    }
    return { kind: "retry", status: response.status };
  } catch {
    // The receiver may have committed before a timeout. The enrollment ID
    // makes replay of this exact body safe under its idempotency contract.
    return { kind: "retry", status: null };
  }
}

export function getCreatedBlisterPackId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const response = body as Record<string, unknown>;
  const id = response.blisterPackId ?? response.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const value = String(id).trim();
  return value || null;
}

export const BLISTER_OUTBOX_PATIENT_ID = "__pharmacyBlisterPatientId";

export function isPermanentBlisterSyncFailure(status: number, endpoint: string): boolean {
  return (
    (endpoint.endsWith("/api/external/create-blister-pack") ||
      endpoint.includes("/api/external/blister-pack/")) &&
    [400, 404, 409, 422].includes(status)
  );
}