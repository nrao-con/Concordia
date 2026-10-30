import { pool } from "../db";

/**
 * An enrollment's partner id must exist before the first network request.
 * Existing rows receive distinct ids, but historical uncertain creates remain
 * blocked by the sender until staff reconciles them.
 */
export async function runBlisterEnrollmentIdMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('blister-enrollment-id-migration'))");
    const { rows } = await client.query<{ exists: boolean }>(
      "SELECT to_regclass('public.blister_pack_patients') IS NOT NULL AS exists",
    );
    if (rows[0]?.exists) {
      await client.query(`
        ALTER TABLE blister_pack_patients
        ADD COLUMN IF NOT EXISTS pharmacy_enrollment_id uuid DEFAULT gen_random_uuid()
      `);
      await client.query(`
        UPDATE blister_pack_patients
        SET pharmacy_enrollment_id = gen_random_uuid()
        WHERE pharmacy_enrollment_id IS NULL
      `);
      await client.query(`
        ALTER TABLE blister_pack_patients
        ALTER COLUMN pharmacy_enrollment_id SET DEFAULT gen_random_uuid(),
        ALTER COLUMN pharmacy_enrollment_id SET NOT NULL
      `);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'blister_pack_patients_pharmacy_enrollment_id_unique'
              AND conrelid = 'blister_pack_patients'::regclass
          ) THEN
            ALTER TABLE blister_pack_patients
              ADD CONSTRAINT blister_pack_patients_pharmacy_enrollment_id_unique
              UNIQUE (pharmacy_enrollment_id);
          END IF;
        END;
        $$
      `);
      await client.query(`
        CREATE OR REPLACE FUNCTION keep_blister_pharmacy_enrollment_id()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.pharmacy_enrollment_id IS DISTINCT FROM OLD.pharmacy_enrollment_id THEN
            RAISE EXCEPTION 'pharmacy_enrollment_id is immutable';
          END IF;
          RETURN NEW;
        END;
        $$
      `);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'blister_pharmacy_enrollment_id_immutable'
              AND tgrelid = 'blister_pack_patients'::regclass
          ) THEN
            CREATE TRIGGER blister_pharmacy_enrollment_id_immutable
              BEFORE UPDATE ON blister_pack_patients
              FOR EACH ROW EXECUTE FUNCTION keep_blister_pharmacy_enrollment_id();
          END IF;
        END;
        $$
      `);
    }
    await client.query("COMMIT");
    console.log("[migration] blister-enrollment-id: OK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}