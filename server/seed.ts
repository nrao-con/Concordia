import { sql } from "drizzle-orm";
import { db } from "./db";
import { log } from "./vite";

// Product auto-seeding is permanently disabled.
// Products are managed exclusively by the staff app (concordia-staff.replit.app)
// and synced in via SSE + polling in server/staff-sync.ts.
export async function seedProductsIfEmpty() {
  log("[Seed] Product auto-seed is disabled — inventory is managed by the staff app.");
}

export async function ensureDoctorPartnersSchemaAndSeed(): Promise<void> {
  try {
    // Ensure schema exists (safe to run every boot)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS doctor_partners (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR NOT NULL,
        last_name VARCHAR NOT NULL,
        title VARCHAR NOT NULL DEFAULT 'MD',
        specialty VARCHAR NOT NULL,
        languages TEXT[] NOT NULL DEFAULT ARRAY['English']::text[],
        gender VARCHAR NOT NULL DEFAULT 'any',
        address VARCHAR,
        phone VARCHAR,
        fax VARCHAR,
        email VARCHAR,
        bio TEXT,
        photo_url VARCHAR,
        accepting_new_patients BOOLEAN NOT NULL DEFAULT true,
        borough VARCHAR NOT NULL DEFAULT 'Manhattan',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE doctor_partners ADD COLUMN IF NOT EXISTS borough VARCHAR NOT NULL DEFAULT 'Manhattan'`);
    await db.execute(sql`ALTER TABLE doctor_partners ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1)`);
    await db.execute(sql`ALTER TABLE doctor_partners ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE doctor_partners ADD COLUMN IF NOT EXISTS patient_quote TEXT`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS doctor_match_leads (
        id SERIAL PRIMARY KEY,
        specialty VARCHAR NOT NULL,
        language VARCHAR NOT NULL,
        gender_preference VARCHAR NOT NULL,
        borough VARCHAR NOT NULL DEFAULT 'any',
        selected_doctor_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS borough VARCHAR NOT NULL DEFAULT 'any'`);
    await db.execute(sql`ALTER TABLE doctor_match_leads DROP COLUMN IF EXISTS accepting_new`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS patient_name VARCHAR`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS patient_phone VARCHAR`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS patient_email VARCHAR`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS preferred_time VARCHAR`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS preferred_days text[]`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS preferred_times_of_day text[]`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS patient_notes TEXT`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS request_token VARCHAR`);
    await db.execute(sql`ALTER TABLE doctor_match_leads ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'website'`);
    await db.execute(sql`ALTER TABLE insurance_assistance_requests ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'website'`);

    // Demo doctor seeding is permanently disabled.
    // Add real partner doctors via the admin panel at /admin/doctor-partners.
    log("[Seed] Doctor partner auto-seed is disabled — add real partners via the admin panel.");
  } catch (err) {
    console.error("[Seed] Failed to ensure doctor partners schema:", err);
  }
}
