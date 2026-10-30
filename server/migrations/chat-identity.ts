import { pool } from "../db";

/** Creates the isolated chat-directory verification tables before serving. */
export async function runChatIdentityMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_identity_challenges (
        id VARCHAR PRIMARY KEY,
        patient_id VARCHAR NULL,
        code_hash VARCHAR NOT NULL,
        identifier_hash VARCHAR NOT NULL,
        ip_hash VARCHAR NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT chat_identity_challenges_attempts_check CHECK (attempts >= 0 AND attempts <= 5)
      );
      CREATE INDEX IF NOT EXISTS chat_identity_challenges_expiry_idx
        ON chat_identity_challenges (expires_at);
      CREATE INDEX IF NOT EXISTS chat_identity_challenges_ip_created_idx
        ON chat_identity_challenges (ip_hash, created_at);
      CREATE TABLE IF NOT EXISTS chat_identity_rate_limits (
        key_hash VARCHAR PRIMARY KEY,
        last_requested_at TIMESTAMP NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}