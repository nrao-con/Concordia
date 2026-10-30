import { randomUUID } from "crypto";
import { pool } from "./db";

export type FraudAlertSeverity = "medium" | "high" | "critical";
export type FraudAlertStatus = "open" | "reviewed" | "resolved" | "false_positive";

export type FraudAlert = {
  id: string;
  signalType: string;
  severity: FraudAlertSeverity;
  status: FraudAlertStatus;
  source: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: Date;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  resolution: string | null;
};

type FraudSignal = {
  eventHash: string;
  signalType: string;
  severity: FraudAlertSeverity;
  source: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt?: Date;
};

type FraudAlertListener = (alert: FraudAlert) => void;
const listeners = new Set<FraudAlertListener>();

export async function ensureFraudAlertsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id UUID PRIMARY KEY,
      event_hash VARCHAR NOT NULL UNIQUE,
      signal_type VARCHAR NOT NULL,
      severity VARCHAR NOT NULL CHECK (severity IN ('medium', 'high', 'critical')),
      status VARCHAR NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved', 'false_positive')),
      source VARCHAR NOT NULL,
      summary TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMP,
      reviewed_by VARCHAR,
      resolution TEXT
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS fraud_alerts_status_created_idx ON fraud_alerts (status, created_at DESC)");
}

function mapAlert(row: any): FraudAlert {
  return {
    id: row.id,
    signalType: row.signal_type,
    severity: row.severity,
    status: row.status,
    source: row.source,
    summary: row.summary,
    metadata: row.metadata ?? {},
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    resolution: row.resolution,
  };
}

export function subscribeFraudAlerts(listener: FraudAlertListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function recordFraudSignal(signal: FraudSignal): Promise<FraudAlert | null> {
  const result = await pool.query(
    `INSERT INTO fraud_alerts
       (id, event_hash, signal_type, severity, source, summary, metadata, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (event_hash) DO NOTHING
     RETURNING *`,
    [
      randomUUID(),
      signal.eventHash,
      signal.signalType,
      signal.severity,
      signal.source,
      signal.summary,
      JSON.stringify(signal.metadata ?? {}),
      signal.occurredAt ?? new Date(),
    ],
  );
  if (!result.rows[0]) return null;

  const alert = mapAlert(result.rows[0]);
  await pool.query(
    `INSERT INTO audit_logs
       (id, user_id, action_type, entity_type, entity_id, new_value)
     VALUES ($1, NULL, 'create', 'chat', $2, $3::jsonb)`,
    [
      randomUUID(),
      alert.id,
      JSON.stringify({
        event: "fraud_alert_created",
        signalType: alert.signalType,
        severity: alert.severity,
        source: alert.source,
      }),
    ],
  );
  listeners.forEach((listener) => listener(alert));
  return alert;
}

export async function listFraudAlerts(options: {
  status?: FraudAlertStatus;
  limit?: number;
} = {}): Promise<FraudAlert[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const result = options.status
    ? await pool.query(
        "SELECT * FROM fraud_alerts WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
        [options.status, limit],
      )
    : await pool.query("SELECT * FROM fraud_alerts ORDER BY created_at DESC LIMIT $1", [limit]);
  return result.rows.map(mapAlert);
}

export async function reviewFraudAlert(input: {
  id: string;
  status: Exclude<FraudAlertStatus, "open">;
  reviewedBy: string;
  resolution: string;
}): Promise<FraudAlert | null> {
  const result = await pool.query(
    `UPDATE fraud_alerts
        SET status = $2, reviewed_at = NOW(), reviewed_by = $3, resolution = $4
      WHERE id = $1
      RETURNING *`,
    [input.id, input.status, input.reviewedBy, input.resolution],
  );
  if (!result.rows[0]) return null;

  const alert = mapAlert(result.rows[0]);
  await pool.query(
    `INSERT INTO audit_logs
       (id, user_id, action_type, entity_type, entity_id, new_value)
     VALUES ($1, $2, 'update', 'chat', $3, $4::jsonb)`,
    [
      randomUUID(),
      input.reviewedBy || null,
      alert.id,
      JSON.stringify({
        event: "fraud_alert_reviewed",
        signalType: alert.signalType,
        severity: alert.severity,
        status: alert.status,
      }),
    ],
  );
  listeners.forEach((listener) => listener(alert));
  return alert;
}