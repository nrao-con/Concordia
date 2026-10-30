import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * The public concierge is intentionally backed by conversion_leads, but needs
 * a database-enforced idempotency boundary for retries/double-clicks.
 */
export async function runConciergeLeadMigration(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE conversion_leads
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS conversion_leads_idempotency_key_unique
    ON conversion_leads (idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);
}