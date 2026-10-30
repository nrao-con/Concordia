import { db } from "./db";
import { users } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

export function generateConcordiaId(seq: number): string {
  return `CP-${String(seq).padStart(6, "0")}`;
}

export function isConcordiaId(value: string): boolean {
  return /^CP-\d{6}$/i.test(value);
}

export async function backfillConcordiaIds(): Promise<void> {
  try {
    const withoutId = await db
      .select({ id: users.id })
      .from(users)
      .where(isNull(users.concordiaId))
      .orderBy(users.createdAt);

    if (withoutId.length === 0) return;

    for (const user of withoutId) {
      try {
        await assignConcordiaId(user.id);
      } catch (err) {
        console.error(`[ConcordiaID] Failed to backfill user ${user.id}:`, err);
      }
    }
    console.log(`[ConcordiaID] Backfilled ${withoutId.length} users`);
  } catch (err) {
    console.error("[ConcordiaID] Backfill error:", err);
  }
}

/**
 * Atomically assigns a unique CP-XXXXXX identifier to a user.
 *
 * Race safety: the assignment uses a single conditional UPDATE that only
 * succeeds when the row still has concordia_id IS NULL. If two concurrent
 * callers compute the same MAX()+1 candidate, the unique constraint causes one
 * to throw a unique_violation (code 23505); that caller retries with the
 * incremented MAX(). Up to 10 retries are attempted before throwing.
 *
 * Also handles the case where a concurrent caller already assigned an ID to
 * this user (UPDATE matches 0 rows but the user now has an ID).
 */
export async function assignConcordiaId(userId: string): Promise<string> {
  const MAX_RETRIES = 10;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Fetch the current highest sequence number
    const maxResult = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(SUBSTRING(concordia_id FROM 4) AS INTEGER)), 0) AS max_seq
      FROM users
      WHERE concordia_id IS NOT NULL
        AND concordia_id ~ '^CP-[0-9]{6}$'
    `);
    const rows = (maxResult as any).rows ?? maxResult;
    const seq = Number(rows[0]?.max_seq ?? 0) + 1;
    const concordiaId = generateConcordiaId(seq);

    try {
      // Single atomic UPDATE — only fires when the row still has no concordia_id
      const result = await db.execute(sql`
        UPDATE users
        SET concordia_id = ${concordiaId}
        WHERE id = ${userId}
          AND concordia_id IS NULL
        RETURNING concordia_id
      `);
      const updated = (result as any).rows ?? result;

      if (updated.length > 0) {
        // Successfully assigned
        return concordiaId;
      }

      // UPDATE matched 0 rows — either the user already has an ID (assigned
      // concurrently) or the userId doesn't exist. Return whatever is there.
      const existing = await db
        .select({ concordiaId: users.concordiaId })
        .from(users)
        .where(eq(users.id, userId));
      if (existing[0]?.concordiaId) return existing[0].concordiaId;
      // User row doesn't exist yet — shouldn't happen but be defensive
      return concordiaId;

    } catch (err: any) {
      // Unique constraint violation: another concurrent request grabbed this seq
      const isUnique =
        err?.code === "23505" ||
        err?.message?.includes("unique") ||
        err?.message?.includes("duplicate");
      if (isUnique) {
        // Retry — the next MAX() call will see the newly inserted value
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[ConcordiaID] Failed to assign ID to user ${userId} after ${MAX_RETRIES} retries`);
}
