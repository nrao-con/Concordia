import { createHash } from "crypto";
import { db } from "./db";
import { sql } from "drizzle-orm";

export type IdempotencyClaim =
  | { kind: "claimed"; correlationId: string }
  | { kind: "duplicate"; statusCode: number; body: unknown; correlationId: string }
  | { kind: "mismatch"; correlationId: string };

export function fingerprintRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((o, k) => { o[k] = v[k]; return o; }, {} as Record<string, unknown>)
      : v,
  )).digest("hex");
}

export function normalizeIdempotencyKey(key: string | undefined): string | null {
  const normalized = key?.trim();
  if (!normalized || normalized.length > 255 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) return null;
  return normalized;
}

export async function ensureRequestIdempotencyTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS request_idempotency (
      scope VARCHAR NOT NULL,
      idempotency_key VARCHAR NOT NULL,
      request_fingerprint VARCHAR NOT NULL,
      correlation_id VARCHAR NOT NULL,
      status_code INTEGER,
      response_body JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope, idempotency_key)
    )
  `);
}

export async function claimRequest(scope: string, key: string | undefined, body: unknown): Promise<IdempotencyClaim | null> {
  const normalizedKey = normalizeIdempotencyKey(key);
  if (!normalizedKey) return null;
  const correlationId = createHash("sha256").update(`${scope}:${normalizedKey}`).digest("hex").slice(0, 32);
  const fp = fingerprintRequest(body);
  const inserted = await db.execute(sql`
    INSERT INTO request_idempotency (scope, idempotency_key, request_fingerprint, correlation_id)
    VALUES (${scope}, ${normalizedKey}, ${fp}, ${correlationId})
    ON CONFLICT (scope, idempotency_key) DO NOTHING
    RETURNING correlation_id
  `);
  if (inserted.rows.length) return { kind: "claimed", correlationId };
  const existing = await db.execute(sql`
    SELECT request_fingerprint, correlation_id, status_code, response_body
    FROM request_idempotency WHERE scope = ${scope} AND idempotency_key = ${normalizedKey}
  `);
  const row = existing.rows[0] as any;
  if (!row) return { kind: "claimed", correlationId };
  if (row.request_fingerprint !== fp) return { kind: "mismatch", correlationId: row.correlation_id };
  if (row.status_code == null) return { kind: "duplicate", statusCode: 409, body: { message: "Request is already being processed", correlationId: row.correlation_id }, correlationId: row.correlation_id };
  return { kind: "duplicate", statusCode: Number(row.status_code), body: row.response_body, correlationId: row.correlation_id };
}

export async function completeRequest(scope: string, key: string | undefined, statusCode: number, body: unknown): Promise<void> {
  const normalizedKey = normalizeIdempotencyKey(key);
  if (!normalizedKey) return;
  await db.execute(sql`
    UPDATE request_idempotency SET status_code = ${statusCode}, response_body = ${JSON.stringify(body)}::jsonb
    WHERE scope = ${scope} AND idempotency_key = ${normalizedKey}
  `);
}

// Release only a claim that has not been completed. Use this for a definitive
// rejection where the remote operation could not have created the resource.
export async function releaseUncompletedRequest(scope: string, key: string | undefined): Promise<void> {
  const normalizedKey = normalizeIdempotencyKey(key);
  if (!normalizedKey) return;
  await db.execute(sql`
    DELETE FROM request_idempotency
    WHERE scope = ${scope} AND idempotency_key = ${normalizedKey} AND status_code IS NULL
  `);
}