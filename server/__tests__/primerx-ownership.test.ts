import { describe, expect, it } from "vitest";
import {
  PrimeRxOwnershipError,
  assertMedicationOwnership,
  operationalPatientHash,
  requiredPrimeRxPatientId,
} from "../primerx-ownership";
import { extractPatientFromEvent, extractRxDataFromEvent } from "../primerx-webhook";

describe("PrimeRx ownership rules", () => {
  it("requires an authoritative patient id", () => {
    expect(() => requiredPrimeRxPatientId("")).toThrow(PrimeRxOwnershipError);
    expect(() => requiredPrimeRxPatientId("undefined")).toThrow(PrimeRxOwnershipError);
    expect(requiredPrimeRxPatientId(" p-1 ")).toBe("p-1");
  });

  it("writes only a keyed, stable identifier to operational logs", () => {
    const hash = operationalPatientHash("patient-1", "test-only-secret");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("patient-1");
    expect(operationalPatientHash("patient-1", "test-only-secret")).toBe(hash);
    expect(operationalPatientHash("patient-1", undefined)).toBeUndefined();
  });

  it("rejects native patient and RX events without real identifiers", () => {
    expect(() => extractPatientFromEvent({ Event: "PatientCreated" })).toThrow("Missing PrimeRx identifier");
    expect(() => extractPatientFromEvent({ Event: "RxReceived", Patient: {} })).toThrow("Missing PrimeRx identifier");
    expect(() => extractRxDataFromEvent({ Event: "RxReceived" })).toThrow("Missing PrimeRx identifier");
    expect(extractRxDataFromEvent({ Event: "RxReceived", RxNo: 0 }).rxNumber).toBe("0");
  });

  it("rejects an RX belonging to another patient", () => {
    expect(() => assertMedicationOwnership(
      [{ rxNumber: "RX-1" }],
      "patient-a",
      [{ rxNumber: "RX-1", userId: "patient-b" }],
    )).toThrow(PrimeRxOwnershipError);
  });

  it("rejects duplicate RX values in one feed", () => {
    expect(() => assertMedicationOwnership(
      [{ rxNumber: "RX-1" }, { rxNumber: " RX-1 " }],
      "patient-a",
      [],
    )).toThrow(PrimeRxOwnershipError);
  });

  it("rejects missing RX identity instead of treating it as an omitted item", () => {
    expect(() => assertMedicationOwnership(
      [{ rxNumber: " " }],
      "patient-a",
      [],
    )).toThrow(PrimeRxOwnershipError);
  });

  it("allows replay for the same owner and retains omitted prescriptions", () => {
    expect(() => assertMedicationOwnership(
      [{ rxNumber: "RX-1" }],
      "patient-a",
      [
        { rxNumber: "RX-1", userId: "patient-a" },
        { rxNumber: "RX-2", userId: "patient-a" },
      ],
    )).not.toThrow();
  });
});