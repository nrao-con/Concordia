import { describe, expect, it } from "vitest";
import { insertSpecialtyFulfillmentRequestSchema } from "@shared/schema";
import { fingerprintRequest } from "../request-idempotency";

const publicRequest = {
  medicationName: "Test medication",
  patientName: "Test patient",
  phone: "0000000000",
  prescriberName: "Test prescriber",
  requestType: "new_prescription" as const,
};

describe("specialty request trust boundary", () => {
  it("strips source, external ID, fingerprint, and assignment fields from website input", () => {
    const parsed = insertSpecialtyFulfillmentRequestSchema.parse({
      ...publicRequest,
      source: "staff_app",
      externalRequestId: "forged-external-id",
      requestFingerprint: "forged-fingerprint",
      assignedToUserId: "forged-admin",
      assignedToName: "Forged Admin",
      claimedAt: new Date(),
    });

    expect(parsed).not.toHaveProperty("source");
    expect(parsed).not.toHaveProperty("externalRequestId");
    expect(parsed).not.toHaveProperty("requestFingerprint");
    expect(parsed).not.toHaveProperty("assignedToUserId");
    expect(parsed).not.toHaveProperty("assignedToName");
    expect(parsed).not.toHaveProperty("claimedAt");
  });

  it("produces stable fingerprints and detects changed retry payloads", () => {
    const first = fingerprintRequest({ ...publicRequest, externalRequestId: "mobile-request-1" });
    const reordered = fingerprintRequest({
      externalRequestId: "mobile-request-1",
      ...publicRequest,
    });
    const changed = fingerprintRequest({
      ...publicRequest,
      externalRequestId: "mobile-request-1",
      medicationName: "Different medication",
    });

    expect(first).toBe(reordered);
    expect(changed).not.toBe(first);
  });
});