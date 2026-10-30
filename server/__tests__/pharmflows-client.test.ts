import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PHARMFLOWS_SUBMISSION_URL, submitPharmFlows, verifyPharmFlowsConnection } from "../pharmflows-client";

// Synthetic unit-test configuration only. No real credentials or network calls.
const CODE = "TEST-PHARMACY";
const KEY = "synthetic-test-connection-key";
const request = {
  pharmacyCode: "caller-cannot-choose-another-pharmacy",
  patientName: "Synthetic Patient",
  patientId: "test-patient",
  dob: "1980-01-01",
  patientPhone: "555-0100",
  deliveryAddress: "Test Address",
  medications: [{ name: "Synthetic Owned Rx", dosage: "10 mg", quantity: 1 }],
  orderType: "pickup" as const,
  notes: "correlation:test-request",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function dryRunAck() {
  return json({ ok: true, test: true, dryRun: true, pharmacyCode: CODE });
}

beforeEach(() => {
  vi.stubEnv("PHARMFLOWS_PHARMACY_CODE", CODE);
  vi.stubEnv("PHARMFLOWS_API_KEY", KEY);
  vi.stubEnv("PHARMFLOWS_TIMEOUT_MS", "10000");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("patient-free PharmFlows connection verification", () => {
  it("uses the exact endpoint and private header with no patient information", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(dryRunAck());
    expect(await verifyPharmFlowsConnection()).toEqual({ verified: true });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://pharmflows.com/api/external/prescription-requests");
    expect(options).toMatchObject({
      method: "POST", redirect: "error",
      headers: { "x-api-key": KEY, Accept: "application/json", "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(options?.body))).toEqual({ pharmacyCode: CODE, _test: true, dryRun: true });
  });

  it.each(["PHARMFLOWS_PHARMACY_CODE", "PHARMFLOWS_API_KEY"])("requires %s without contacting the receiver", async key => {
    vi.stubEnv(key, "");
    expect(await verifyPharmFlowsConnection()).toEqual({ verified: false, reason: "not_configured" });
    expect(await submitPharmFlows(request)).toEqual({ submitted: false, reason: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, test: true, dryRun: true, pharmacyCode: CODE },
    { ok: true, test: false, dryRun: true, pharmacyCode: CODE },
    { ok: true, test: true, dryRun: false, pharmacyCode: CODE },
    { ok: true, test: true, dryRun: true, pharmacyCode: "OTHER-PHARMACY" },
    { ok: true, test: true, dryRun: true },
    { ok: "true", test: true, dryRun: true, pharmacyCode: CODE },
    {},
  ])("blocks patient submission after an incomplete or mismatched acknowledgement: %j", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(json(body));
    expect(await submitPharmFlows(request)).toEqual({ submitted: false, reason: "verification_failed" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).not.toContain(request.patientName);
  });

  it.each([null, [], "success"])("rejects an unexpected JSON shape: %j", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(json(body));
    expect(await verifyPharmFlowsConnection()).toEqual({ verified: false, reason: "invalid_response" });
  });

  it("rejects an HTML page instead of treating HTTP 200 as a verified API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>Sign in</html>", {
      status: 200, headers: { "content-type": "text/html" },
    }));
    expect(await submitPharmFlows(request)).toEqual({ submitted: false, reason: "invalid_response" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{bad", {
      status: 200, headers: { "content-type": "application/json" },
    }));
    expect(await verifyPharmFlowsConnection()).toEqual({ verified: false, reason: "invalid_response" });
  });

  it.each([401, 403, 404, 500])("fails closed on HTTP %i without exposing the receiver body", async status => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ message: "Private receiver details" }, status));
    const result = await submitPharmFlows(request);
    expect(result).toEqual({ submitted: false, reason: "rejected" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("Private");
  });

  it("does not expose a network error that could contain a key", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error(`Network failure ${KEY}`));
    expect(await verifyPharmFlowsConnection()).toEqual({ verified: false, reason: "unavailable" });
  });

  it("aborts the check on timeout and sends no prescription", async () => {
    vi.useFakeTimers();
    vi.stubEnv("PHARMFLOWS_TIMEOUT_MS", "100");
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    const result = submitPharmFlows(request);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toEqual({ submitted: false, reason: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("prescription handoff after verification", () => {
  it("posts only allowed prescription fields, using the server pharmacy rather than caller values", async () => {
    vi.stubEnv("PHARMFLOWS_ROUTE", "/legacy-wrong-route");
    vi.mocked(fetch).mockResolvedValueOnce(dryRunAck()).mockResolvedValueOnce(json({ ok: true, id: "test-request-id" }, 201));
    const result = await submitPharmFlows({
      ...request, products: [{ name: "Never send OTC" }], _test: true, dryRun: true,
    } as typeof request);
    expect(result).toMatchObject({ submitted: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe(PHARMFLOWS_SUBMISSION_URL);
    expect(options).toMatchObject({ redirect: "error", headers: { "x-api-key": KEY } });
    expect(JSON.parse(String(options?.body))).toEqual({
      ...request, pharmacyCode: CODE,
    });
    expect(String(options?.body)).not.toContain(KEY);
  });

  it("retains the existing successful JSON request-id response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(dryRunAck()).mockResolvedValueOnce(json({ id: "test-id" }, 201));
    expect(await submitPharmFlows(request)).toMatchObject({ submitted: true });
  });

  it.each([
    { ok: false }, { success: false }, { ok: true, test: true }, { ok: true, dryRun: true },
    { ok: true, pharmacyCode: "OTHER-PHARMACY" }, {}, { message: "Sign in" }, { id: "" },
  ])("does not claim submission for an explicit failure or dry-run reply: %j", async body => {
    vi.mocked(fetch).mockResolvedValueOnce(dryRunAck()).mockResolvedValueOnce(json(body));
    expect(await submitPharmFlows(request)).toEqual({ submitted: false, reason: "invalid_response" });
  });

  it("does not automatically retry uncertain prescription submissions", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(dryRunAck()).mockRejectedValueOnce(new Error("Timeout after commit"));
    expect(await submitPharmFlows(request)).toEqual({ submitted: false, reason: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("verifies again for a later request rather than reusing an old success after key revocation", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(dryRunAck()).mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ message: "Revoked" }, 401));
    expect((await submitPharmFlows(request)).submitted).toBe(true);
    expect(await submitPharmFlows(request)).toEqual({ submitted: false, reason: "rejected" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not contact PharmFlows for an empty prescription list", async () => {
    expect(await submitPharmFlows({ ...request, medications: [] })).toEqual({ submitted: false, reason: "rejected" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
