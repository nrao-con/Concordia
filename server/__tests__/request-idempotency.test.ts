import { describe, expect, it } from "vitest";
import { fingerprintRequest, normalizeIdempotencyKey } from "../request-idempotency";

describe("request idempotency helpers", () => {
  it("accepts bounded opaque request keys", () => {
    expect(normalizeIdempotencyKey(" refill:patient_123.abc-1 ")).toBe("refill:patient_123.abc-1");
  });

  it.each(["", "contains spaces", "contains/slash", "x".repeat(256)])(
    "rejects invalid key %s",
    (key) => expect(normalizeIdempotencyKey(key)).toBeNull(),
  );

  it("fingerprints object keys deterministically", () => {
    expect(fingerprintRequest({ patientId: "1", rxNumbers: ["2"] }))
      .toBe(fingerprintRequest({ rxNumbers: ["2"], patientId: "1" }));
  });

  it("distinguishes a changed request body", () => {
    expect(fingerprintRequest({ rxNumbers: ["1"] }))
      .not.toBe(fingerprintRequest({ rxNumbers: ["2"] }));
  });
});