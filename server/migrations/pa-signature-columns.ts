/**
 * Migration: PA prescriber e-signature columns
 *
 * Adds 7 signature-related columns to prior_authorization_requests and
 * the two new pa_status enum values.  Every statement is idempotent — safe
 * to re-run on a database that is already up-to-date.
 *
 * Uses the application's canonical database pool (DATABASE_URL via ./db)
 * so it always targets the same database as the running server.
 *
 * Called automatically from server/index.ts before route registration.
 * Can also be run directly:
 *   npx ts-node server/migrations/pa-signature-columns.ts
 */

import { pool } from "../db";

export async function runPaSignatureMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    const {
      rows: [{ enumExists }],
    } = await client.query<{ enumExists: boolean }>(`
      SELECT to_regtype('public.pa_status') IS NOT NULL AS "enumExists"
    `);

    if (enumExists) {
      // Add enum values only when the PA schema already exists.
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'pa_status' AND e.enumlabel = 'awaiting_signature'
          ) THEN
            ALTER TYPE pa_status ADD VALUE 'awaiting_signature';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'pa_status' AND e.enumlabel = 'signature_received'
          ) THEN
            ALTER TYPE pa_status ADD VALUE 'signature_received';
          END IF;
        END$$;
      `);
    }

    const {
      rows: [{ tableExists }],
    } = await client.query<{ tableExists: boolean }>(`
      SELECT to_regclass('public.prior_authorization_requests') IS NOT NULL AS "tableExists"
    `);

    if (tableExists) {
      // Add columns only when the PA table already exists.
      const columns: [string, string][] = [
        ["prescriber_email",           "TEXT"],
        ["signature_token_hash",       "TEXT"],
        ["signature_token_expires_at", "TIMESTAMPTZ"],
        ["signature_requested_at",     "TIMESTAMPTZ"],
        ["signature_received_at",      "TIMESTAMPTZ"],
        ["signature_status",           "TEXT NOT NULL DEFAULT 'not_required'"],
        ["signed_letter_html",         "TEXT"],
      ];

      for (const [col, type] of columns) {
        await client.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
              AND   table_name = 'prior_authorization_requests'
              AND   column_name = '${col}'
            ) THEN
              ALTER TABLE prior_authorization_requests ADD COLUMN ${col} ${type};
            END IF;
          END$$;
        `);
      }
    }

    console.log(
      `[migration] pa-signature-columns: OK (enum=${enumExists ? "updated" : "absent"}, table=${tableExists ? "updated" : "absent"})`,
    );
  } finally {
    client.release();
  }
}

// To run directly:  npx tsx server/migrations/pa-signature-columns.ts
// (called automatically from server/index.ts on startup)
