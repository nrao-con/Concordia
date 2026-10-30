import { describe, expect, it } from "vitest";
import { buildPharmFlowsRequest } from "../pharmflows-client";
import { fingerprintRequest, normalizeIdempotencyKey } from "../request-idempotency";

describe("combined checkout safety", () => {
  it("builds pharmacy medication payload only from supplied owned prescription records", () => {
    const payload = buildPharmFlowsRequest({
      patientId: "p-1", patientName: "A Patient", dob: "1980-01-01",
      orderType: "delivery", correlationId: "c-1",
      medications: [{ name: "Owned Rx", prescriptionId: "rx-1" }],
    });
    expect(payload.medications).toHaveLength(1);
    expect(payload.medications[0]).not.toHaveProperty("prescriptionId");
    expect(payload.notes).toContain("c-1");
    expect(JSON.stringify(payload)).not.toContain("free text");
  });

  it("normalizes idempotency keys and fingerprints object ordering consistently", () => {
    expect(normalizeIdempotencyKey("checkout:one")).toBe("checkout:one");
    expect(normalizeIdempotencyKey("bad key")).toBeNull();
    expect(fingerprintRequest({ a: 1, b: 2 })).toBe(fingerprintRequest({ b: 2, a: 1 }));
  });
});