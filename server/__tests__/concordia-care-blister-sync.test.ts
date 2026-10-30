import { describe, expect, it, vi } from "vitest";
import {
  getCreatedBlisterPackId,
  isPermanentBlisterSyncFailure,
  isValidBlisterCreatePayload,
  mapBlisterCreateMedications,
  postBlisterCreate,
  resolveBlisterSyncIdentity,
} from "../concordia-care-blister-sync";

const patient = {
  linkedUserId: "pharmacy-user",
  firstName: "Jane",
  lastName: "Doe",
  dateOfBirth: "1985-03-15",
};
const user = {
  id: "pharmacy-user",
  role: "patient",
  firstName: "Jane",
  lastName: "Doe",
  dateOfBirth: "1985-03-15",
  concordiaId: "CP-123456",
  concordiaCareUserId: "app-user",
} as const;

describe("ConcordiaCare blister sync identity", () => {
  it("sends the verified app user ID, not the local pharmacy user ID", () => {
    expect(resolveBlisterSyncIdentity(patient, user)).toEqual({
      ok: true,
      payload: { userId: "app-user", concordiaId: "CP-123456" },
    });
  });

  it("does not link a guest or an account without a verified app ID by contact details", () => {
    expect(resolveBlisterSyncIdentity({ ...patient, linkedUserId: null })).toEqual({ ok: false, reason: "unlinked" });
    expect(resolveBlisterSyncIdentity(patient, { ...user, concordiaId: null, concordiaCareUserId: null })).toEqual({
      ok: false, reason: "app_link_missing",
    });
    expect(resolveBlisterSyncIdentity(patient, { ...user, concordiaCareUserId: null })).toEqual({
      ok: true, payload: { concordiaId: "CP-123456" },
    });
    expect(resolveBlisterSyncIdentity(patient, { ...user, concordiaId: null })).toEqual({
      ok: true, payload: { userId: "app-user" },
    });
    expect(resolveBlisterSyncIdentity(patient, {
      ...user, concordiaId: null, concordiaCareUserId: "user_clerk123", clerkId: "user_clerk123",
    })).toEqual({ ok: false, reason: "app_link_missing" });
  });

  it("rejects conflicting identities, including a birth-date mismatch", () => {
    expect(resolveBlisterSyncIdentity(patient, { ...user, id: "other" })).toEqual({ ok: false, reason: "mismatch" });
    expect(resolveBlisterSyncIdentity(patient, { ...user, dateOfBirth: "1985-03-16" })).toEqual({
      ok: false, reason: "mismatch",
    });
  });
});

describe("blister create delivery with fake enrollments", () => {
  const enrollment = {
    pharmacyEnrollmentId: "969accb6-c76e-4a3b-85e6-f08601e7bc6f",
    blisterPackId: null as string | null,
    medications: [{ name: "Sample medication", dosage: "5 mg", intakeTimes: ["morning"], isActive: true }],
  };
  const endpoint = "https://example.test/api/external/create-blister-pack";
  const payload = {
    pharmacyEnrollmentId: enrollment.pharmacyEnrollmentId,
    concordiaId: "CP-123456",
    name: "Test pack",
    medications: mapBlisterCreateMedications(enrollment.medications)!,
  };

  it("sends a first create with the partner header and saves its returned ID", async () => {
    const fakeRecord = { ...enrollment };
    const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
      expect(options?.headers).toEqual(expect.objectContaining({ "X-API-KEY": "fake-partner-key" }));
      expect(JSON.parse(String(options?.body))).toEqual(payload);
      return { status: 201, json: async () => ({ blisterPackId: "pack-123" }) } as Response;
    });
    const result = await postBlisterCreate(endpoint, "fake-partner-key", payload, fetcher as typeof fetch);
    if (result.kind === "accepted") fakeRecord.blisterPackId = result.blisterPackId;
    expect(fakeRecord.blisterPackId).toBe("pack-123");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reuses the exact saved payload and enrollment ID on an identical retry", async () => {
    const savedBody = JSON.parse(JSON.stringify(payload));
    const fetcher = vi.fn(async () =>
      ({ status: 200, json: async () => ({ blisterPackId: "pack-123" }) }) as Response);
    expect(await postBlisterCreate(endpoint, "fake-partner-key", payload, fetcher as typeof fetch))
      .toEqual({ kind: "accepted", blisterPackId: "pack-123" });
    expect(await postBlisterCreate(endpoint, "fake-partner-key", savedBody, fetcher as typeof fetch))
      .toEqual({ kind: "accepted", blisterPackId: "pack-123" });
    expect(fetcher.mock.calls.map(([, options]) => JSON.parse(String(options?.body))))
      .toEqual([savedBody, savedBody]);
  });

  it("keeps the same persisted body for a timeout retry", async () => {
    const savedBody = JSON.parse(JSON.stringify(payload));
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ status: 200, json: async () => ({ blisterPackId: "pack-456" }) });
    expect(await postBlisterCreate(endpoint, "fake-partner-key", savedBody, fetcher as typeof fetch))
      .toEqual({ kind: "retry", status: null });
    expect(await postBlisterCreate(endpoint, "fake-partner-key", savedBody, fetcher as typeof fetch))
      .toEqual({ kind: "accepted", blisterPackId: "pack-456" });
    expect(fetcher.mock.calls.map(([, options]) => JSON.parse(String(options?.body))))
      .toEqual([savedBody, savedBody]);
  });

  it("rejects unchanged 4xx and missing or invalid identifiers without sending", async () => {
    const fetcher = vi.fn()
      .mockResolvedValue({ status: 422, json: async () => ({ code: "pharmacy_enrollment_id_required" }) });
    expect(await postBlisterCreate(endpoint, "fake-partner-key", payload, fetcher as typeof fetch))
      .toEqual({ kind: "rejected", status: 422, code: "pharmacy_enrollment_id_required" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(isValidBlisterCreatePayload({ ...payload, pharmacyEnrollmentId: "" })).toBe(false);
    expect(isValidBlisterCreatePayload({ ...payload, concordiaId: "user_clerk123" })).toBe(false);
    expect(isValidBlisterCreatePayload({ ...payload, concordiaId: undefined, userId: "user_clerk123" })).toBe(false);
    expect(isValidBlisterCreatePayload({ ...payload, medications: [{ name: "", timeSlot: "Morning" }] })).toBe(false);
    expect(mapBlisterCreateMedications([{ name: "Sample", intakeTimes: [] }])).toBeNull();
    for (const bad of [
      { ...payload, pharmacyEnrollmentId: "" },
      { ...payload, concordiaId: undefined, userId: "user_clerk123" },
    ]) {
      expect(await postBlisterCreate(endpoint, "fake-partner-key", bad, fetcher as typeof fetch))
        .toEqual({ kind: "rejected", status: 0, code: "invalid_sender_payload" });
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("ConcordiaCare blister sync responses", () => {
  it("recognizes both documented and legacy created-pack IDs", () => {
    expect(getCreatedBlisterPackId({ blisterPackId: "app-pack" })).toBe("app-pack");
    expect(getCreatedBlisterPackId({ id: 123 })).toBe("123");
    expect(getCreatedBlisterPackId({ success: true })).toBeNull();
  });

  it("does not retry patient-not-found or validation errors as transient failures", () => {
    const endpoint = "https://example.com/api/external/create-blister-pack";
    expect(isPermanentBlisterSyncFailure(404, endpoint)).toBe(true);
    expect(isPermanentBlisterSyncFailure(422, endpoint)).toBe(true);
    expect(isPermanentBlisterSyncFailure(503, endpoint)).toBe(false);
    expect(isPermanentBlisterSyncFailure(404, "https://example.com/api/external/register-patient")).toBe(false);
  });
});