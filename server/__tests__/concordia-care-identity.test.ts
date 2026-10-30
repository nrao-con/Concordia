import { describe, expect, it } from "vitest";
import {
  buildConcordiaCarePatientPayload,
  guardConcordiaCareLink,
} from "../concordiaCareIdentity";

const user = {
  id: "local-user-1",
  concordiaId: "CP-000001",
  concordiaCareUserId: null,
  email: "patient@example.test",
  firstName: "Test",
  lastName: "Patient",
  phoneNumber: "555-0100",
  dateOfBirth: null,
  address: "1 Main Street",
  preferredDeliveryMethod: "delivery",
  role: "patient",
} as any;

describe("ConcordiaCare patient identity payload", () => {
  it("uses the server user's immutable ID and canonical patient ID", () => {
    const payload = buildConcordiaCarePatientPayload(user, { action: "updated" });

    expect(payload).toMatchObject({
      concordiaPharmacyUserId: "local-user-1",
      concordiaUserId: "local-user-1",
      concordiaId: "CP-000001",
      canonicalPatientId: "CP-000001",
    });
    expect(payload.concordiaCareUserId).toBeUndefined();
  });

  it("does not accept browser-controlled identity fields", () => {
    const payload = buildConcordiaCarePatientPayload({
      ...user,
      concordiaId: "CP-000001",
      concordiaCareUserId: "app-user-1",
      concordiaPharmacyUserId: "browser-user",
      canonicalPatientId: "CP-999999",
    } as any);

    expect(payload.concordiaPharmacyUserId).toBe("local-user-1");
    expect(payload.concordiaId).toBe("CP-000001");
    expect(payload.canonicalPatientId).toBe("CP-000001");
    expect(payload.concordiaCareUserId).toBe("app-user-1");
  });

  it("keeps the app date-of-birth contract date-only", () => {
    const payload = buildConcordiaCarePatientPayload({
      ...user,
      dateOfBirth: new Date("1990-04-15T00:00:00.000Z"),
    } as any);

    expect(payload.dateOfBirth).toBe("1990-04-15");
  });
});

describe("ConcordiaCare linkage guard", () => {
  it("preserves an existing link and rejects a conflicting link", () => {
    expect(guardConcordiaCareLink("app-user-1", "app-user-1")).toEqual({
      ok: true,
      value: "app-user-1",
    });
    expect(guardConcordiaCareLink("app-user-1", "app-user-2")).toEqual({
      ok: false,
      conflict: true,
    });
  });
});