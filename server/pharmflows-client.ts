/**
 * Server-only, fail-closed PharmFlows integration. Callers must provide owned
 * prescription records, never medication names inferred from a shopping cart.
 * A pharmacy-scoped, patient-free dry run must pass before each real submission.
 */
export const PHARMFLOWS_SUBMISSION_URL = "https://pharmflows.com/api/external/prescription-requests";

export type PharmFlowsMedication = {
  name: string;
  dosage?: string | null;
  quantity?: number | null;
};

export type PharmFlowsRequest = {
  pharmacyCode: string;
  patientName: string;
  patientId: string;
  dob?: string;
  patientPhone?: string;
  medications: PharmFlowsMedication[];
  orderType: "pickup" | "delivery";
  deliveryAddress?: string;
  notes?: string;
};

export type PharmFlowsResult =
  | { submitted: true; response: unknown }
  | { submitted: false; reason: PharmFlowsFailureReason };

type PharmFlowsFailureReason = "not_configured" | "unavailable" | "invalid_response" | "rejected" | "verification_failed";
export type PharmFlowsConnectionResult =
  | { verified: true }
  | { verified: false; reason: PharmFlowsFailureReason };

type ConnectionConfig = { pharmacyCode: string; apiKey: string; timeoutMs: number };

function getConnectionConfig(): ConnectionConfig | null {
  const pharmacyCode = process.env.PHARMFLOWS_PHARMACY_CODE?.trim();
  const apiKey = process.env.PHARMFLOWS_API_KEY?.trim();
  if (!pharmacyCode || !apiKey) return null;
  const timeout = Number(process.env.PHARMFLOWS_TIMEOUT_MS ?? 10000);
  return {
    pharmacyCode,
    apiKey,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 30000) : 10000,
  };
}

async function postJson(config: ConnectionConfig, body: object): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: PharmFlowsFailureReason }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(PHARMFLOWS_SUBMISSION_URL, {
      method: "POST",
      // Never forward the private header or prescription body through a redirect.
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: "rejected" };
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return { ok: false, reason: "invalid_response" };
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return { ok: false, reason: "invalid_response" };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "invalid_response" };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    // Do not expose headers, credentials, response bodies or patient data in errors.
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyConnection(config: ConnectionConfig): Promise<PharmFlowsConnectionResult> {
  // This deliberately contains no patient fields, even when called for an order.
  const result = await postJson(config, { pharmacyCode: config.pharmacyCode, _test: true, dryRun: true });
  if (!result.ok) return { verified: false, reason: result.reason };
  const body = result.body;
  if (body.ok !== true || body.test !== true || body.dryRun !== true || body.pharmacyCode !== config.pharmacyCode) {
    return { verified: false, reason: "verification_failed" };
  }
  return { verified: true };
}

/** Safe to run during setup: never creates an order or sends patient information. */
export async function verifyPharmFlowsConnection(): Promise<PharmFlowsConnectionResult> {
  const config = getConnectionConfig();
  return config ? verifyConnection(config) : { verified: false, reason: "not_configured" };
}

export function buildPharmFlowsRequest(input: {
  patientId: string;
  patientName: string;
  dob?: string;
  patientPhone?: string;
  deliveryAddress?: string;
  orderType: "pickup" | "delivery";
  correlationId: string;
  medications: PharmFlowsMedication[];
}): PharmFlowsRequest {
  return {
    pharmacyCode: "",
    patientId: input.patientId,
    patientName: input.patientName,
    ...(input.dob ? { dob: input.dob } : {}),
    ...(input.patientPhone ? { patientPhone: input.patientPhone } : {}),
    medications: input.medications.map(({ name, dosage, quantity }) => ({
      name,
      ...(dosage ? { dosage } : {}),
      ...(quantity != null ? { quantity } : {}),
    })),
    orderType: input.orderType,
    ...(input.deliveryAddress ? { deliveryAddress: input.deliveryAddress } : {}),
    notes: `correlation:${input.correlationId}`,
  };
}

export async function submitPharmFlows(request: PharmFlowsRequest): Promise<PharmFlowsResult> {
  const config = getConnectionConfig();
  if (!config) return { submitted: false, reason: "not_configured" };
  if (!request.patientName?.trim() || !request.patientId?.trim() ||
      !["pickup", "delivery"].includes(request.orderType) ||
      !request.medications.length || request.medications.some((m) => !m.name?.trim())) {
    return { submitted: false, reason: "rejected" };
  }
  const verification = await verifyConnection(config);
  if (!verification.verified) return { submitted: false, reason: verification.reason };

  // Allowlist fields. A caller cannot override the server pharmacy, inject test
  // flags, or mix shopping-cart data into the prescription submission.
  const result = await postJson(config, {
    pharmacyCode: config.pharmacyCode,
    patientId: request.patientId,
    patientName: request.patientName,
    ...(request.dob ? { dob: request.dob } : {}),
    ...(request.patientPhone ? { patientPhone: request.patientPhone } : {}),
    medications: request.medications.map(({ name, dosage, quantity }) => ({
      name, ...(dosage ? { dosage } : {}), ...(quantity != null ? { quantity } : {}),
    })),
    orderType: request.orderType,
    ...(request.deliveryAddress ? { deliveryAddress: request.deliveryAddress } : {}),
    ...(request.notes ? { notes: request.notes } : {}),
  });
  if (!result.ok) return { submitted: false, reason: result.reason };
  const body = result.body;
  if (body.ok === false || body.success === false || body.test === true || body.dryRun === true ||
      (body.pharmacyCode !== undefined && body.pharmacyCode !== config.pharmacyCode)) {
    return { submitted: false, reason: "invalid_response" };
  }
  const hasRequestId = (typeof body.id === "string" && body.id.trim().length > 0) ||
    (typeof body.id === "number" && Number.isFinite(body.id) && body.id > 0);
  if (body.ok !== true && body.success !== true && !hasRequestId) {
    return { submitted: false, reason: "invalid_response" };
  }
  return { submitted: true, response: body };
}