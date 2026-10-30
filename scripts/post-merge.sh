#!/bin/bash
set -e
npm install

# Apply any new columns/tables using raw SQL so we never hit interactive prompts.
# drizzle-kit push hangs asking about the earning_rules_rule_key_unique constraint
# when the table is non-empty. Adding the constraint with IF NOT EXISTS is safe.
psql "$DATABASE_URL" <<'SQL'
-- earning_rules table: add any missing columns
ALTER TABLE earning_rules
  ADD COLUMN IF NOT EXISTS rule_key text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- add the unique constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'earning_rules_rule_key_unique'
  ) THEN
    ALTER TABLE earning_rules ADD CONSTRAINT earning_rules_rule_key_unique UNIQUE (rule_key);
  END IF;
END$$;

-- blog_posts: add category column (defaults existing rows to 'general')
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS category varchar DEFAULT 'general' NOT NULL;

-- sync_outbox: retryable queue for outbound ConcordiaCare app pushes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_outbox_status') THEN
    CREATE TYPE sync_outbox_status AS ENUM ('pending', 'delivered', 'failed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS sync_outbox (
  id          serial PRIMARY KEY,
  endpoint    varchar NOT NULL,
  method      varchar NOT NULL DEFAULT 'POST',
  payload     jsonb NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamp NOT NULL DEFAULT NOW(),
  status      sync_outbox_status NOT NULL DEFAULT 'pending',
  last_error  text,
  created_at  timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_outbox_pending_idx
  ON sync_outbox (status, next_retry_at)
  WHERE status = 'pending';

-- products: draft/active staging workflow (Task #163)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS import_batch_id varchar,
  ADD COLUMN IF NOT EXISTS import_source varchar;

-- products: external_id for bulk OTC sync upsert conflict target (Task #188)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS external_id varchar;

-- Drop partial index if it exists (was created in an earlier migration attempt),
-- then add a full non-partial unique constraint so ON CONFLICT (external_id) works.
DROP INDEX IF EXISTS products_external_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_external_id_unique'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_external_id_unique UNIQUE (external_id);
  END IF;
END$$;
-- order_status enum: add pharmacy fulfillment stages (Task #191)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'refunded') THEN
    ALTER TYPE order_status ADD VALUE 'refunded';
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'preparing') THEN
    ALTER TYPE order_status ADD VALUE 'preparing';
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'ready_for_pickup') THEN
    ALTER TYPE order_status ADD VALUE 'ready_for_pickup';
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'sent_for_delivery') THEN
    ALTER TYPE order_status ADD VALUE 'sent_for_delivery';
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'delivered') THEN
    ALTER TYPE order_status ADD VALUE 'delivered';
  END IF;
END$$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'picked_up') THEN
    ALTER TYPE order_status ADD VALUE 'picked_up';
  END IF;
END$$;

-- orders: payment_status column — "paid_online" or "collect_at_counter" (Task #191)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status varchar DEFAULT 'collect_at_counter';

-- blog_posts: pinned_to_hero flag (Task #210)
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS pinned_to_hero boolean NOT NULL DEFAULT FALSE;

SQL

echo "post-merge: DB schema up to date"

# ── STAFF_API_KEY reminder ─────────────────────────────────────────────────
# Task #192: Set STAFF_API_KEY in the Replit secrets panel before deploying.
# This secret authenticates the staff tablet app at /api/staff/* and /ws/staff.
# It is separate from API_KEY (used by the ConcordiaCare mobile app).
# No SQL migration is required for this task.
