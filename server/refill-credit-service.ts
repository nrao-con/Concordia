import { and, count, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { pointsLedger, pointsWallets, prescriptions, primeRxDrugs, streaks } from "@shared/schema";

export const FIVE_REFILL_CREDIT_CAMPAIGN = "five-refill-credit-v1";
export const FIVE_REFILL_CREDIT_POINTS = 20000;

type QualifyingPrescription = {
  qtyOrdered: string | null;
  qtyDispensed: string | null;
  deaSchedule?: string | null;
};

export function getRefillDisqualificationReason(rx: QualifyingPrescription): "controlled" | "partial" | "unknown" | null {
  const deaSchedule = rx.deaSchedule?.trim().toLowerCase();
  if (!deaSchedule) return "unknown";
  if (deaSchedule && !["0", "00", "none", "non-controlled", "noncontrolled"].includes(deaSchedule)) {
    return "controlled";
  }
  const ordered = rx.qtyOrdered == null ? null : Number(rx.qtyOrdered);
  const dispensed = rx.qtyDispensed == null ? null : Number(rx.qtyDispensed);
  if (ordered === null || dispensed === null || !Number.isFinite(ordered) || !Number.isFinite(dispensed)) {
    return "unknown";
  }
  if (ordered <= 0 || dispensed <= 0) return "unknown";
  if (dispensed < ordered) return "partial";
  return null;
}

export async function recordQualifyingCompletedRefill(params: {
  userId: string;
  prescriptionId: string;
  fillEventId: string;
}): Promise<{ counted: boolean; qualifyingCount: number; creditAwarded: boolean; reason?: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`refill-credit:${params.userId}`}))`);

    const [rx] = await tx
      .select()
      .from(prescriptions)
      .where(and(eq(prescriptions.id, params.prescriptionId), eq(prescriptions.userId, params.userId)));
    if (!rx) return { counted: false, qualifyingCount: 0, creditAwarded: false, reason: "not_found" };

    let deaSchedule: string | null = null;
    if (rx.ndc) {
      const [drug] = await tx
        .select({ deaSchedule: primeRxDrugs.deaSchedule })
        .from(primeRxDrugs)
        .where(eq(primeRxDrugs.ndc, rx.ndc));
      deaSchedule = drug?.deaSchedule ?? null;
    }
    const disqualification = getRefillDisqualificationReason({
      qtyOrdered: rx.qtyOrdered,
      qtyDispensed: rx.qtyDispensed,
      deaSchedule,
    });
    if (disqualification) {
      return { counted: false, qualifyingCount: 0, creditAwarded: false, reason: disqualification };
    }

    await tx.insert(pointsWallets).values({ userId: params.userId }).onConflictDoNothing({ target: pointsWallets.userId });
    const [wallet] = await tx.select().from(pointsWallets).where(eq(pointsWallets.userId, params.userId));
    if (!wallet || wallet.isFrozen) {
      return { counted: false, qualifyingCount: 0, creditAwarded: false, reason: "wallet_frozen" };
    }

    const refillEventKey = `${FIVE_REFILL_CREDIT_CAMPAIGN}:fill:${params.fillEventId}`;
    const insertedEvent = await tx
      .insert(pointsLedger)
      .values({
        userId: params.userId,
        actionType: "on_time_refill",
        points: 0,
        balanceAfter: wallet.currentBalance,
        referenceType: "qualifying_refill",
        referenceId: params.fillEventId,
        description: "Qualifying completed refill recorded for one-time $20 member credit",
        metadata: { campaign: FIVE_REFILL_CREDIT_CAMPAIGN, prescriptionId: params.prescriptionId },
        eventIdempotencyKey: refillEventKey,
      })
      .onConflictDoNothing({ target: pointsLedger.eventIdempotencyKey })
      .returning({ id: pointsLedger.id });

    const [{ value: qualifyingCount }] = await tx
      .select({ value: count() })
      .from(pointsLedger)
      .where(and(
        eq(pointsLedger.userId, params.userId),
        eq(pointsLedger.referenceType, "qualifying_refill"),
        sql`${pointsLedger.metadata}->>'campaign' = ${FIVE_REFILL_CREDIT_CAMPAIGN}`,
        sql`NOT EXISTS (
          SELECT 1 FROM points_ledger reversal
          WHERE reversal.user_id = ${params.userId}
            AND reversal.reference_type = 'qualifying_refill_reversal'
            AND reversal.reference_id = ${pointsLedger.referenceId}
            AND reversal.metadata->>'campaign' = ${FIVE_REFILL_CREDIT_CAMPAIGN}
        )`,
      ));

    const [existingStreak] = await tx
      .select()
      .from(streaks)
      .where(and(eq(streaks.userId, params.userId), eq(streaks.streakType, "refill_adherence")));
    if (existingStreak) {
      await tx.update(streaks).set({
        currentCount: Math.max(existingStreak.currentCount, qualifyingCount),
        bestCount: Math.max(existingStreak.bestCount, qualifyingCount),
        lastQualifyingActionAt: new Date(),
        lastQualifyingReferenceId: params.fillEventId,
        lastMilestoneAwarded: qualifyingCount >= 5 ? Math.max(existingStreak.lastMilestoneAwarded ?? 0, 5) : existingStreak.lastMilestoneAwarded,
        updatedAt: new Date(),
      }).where(eq(streaks.id, existingStreak.id));
    } else {
      await tx.insert(streaks).values({
        userId: params.userId,
        streakType: "refill_adherence",
        currentCount: qualifyingCount,
        bestCount: qualifyingCount,
        startedAt: new Date(),
        lastQualifyingActionAt: new Date(),
        lastQualifyingReferenceId: params.fillEventId,
        lastMilestoneAwarded: qualifyingCount >= 5 ? 5 : 0,
      });
    }

    const [{ value: campaignNetRaw }] = await tx
      .select({ value: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)` })
      .from(pointsLedger)
      .where(and(
        eq(pointsLedger.userId, params.userId),
        sql`${pointsLedger.metadata}->>'campaign' = ${FIVE_REFILL_CREDIT_CAMPAIGN}`,
      ));
    const campaignNet = Number(campaignNetRaw);

    let creditAwarded = false;
    if (qualifyingCount >= 5 && campaignNet < FIVE_REFILL_CREDIT_POINTS) {
      const awardAmount = FIVE_REFILL_CREDIT_POINTS - campaignNet;
      const newBalance = wallet.currentBalance + awardAmount;
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 12);
      const insertedCredit = await tx
        .insert(pointsLedger)
        .values({
          userId: params.userId,
          actionType: "membership_milestone",
          points: awardAmount,
          balanceAfter: newBalance,
          referenceType: "reward",
          referenceId: FIVE_REFILL_CREDIT_CAMPAIGN,
          description: "$20 store credit earned after five qualifying completed refills (20,000 points)",
          metadata: { campaign: FIVE_REFILL_CREDIT_CAMPAIGN, valueUsd: 20, qualifyingCount },
          expiresAt,
          eventIdempotencyKey: `${FIVE_REFILL_CREDIT_CAMPAIGN}:award:${params.fillEventId}`,
        })
        .onConflictDoNothing({ target: pointsLedger.eventIdempotencyKey })
        .returning({ id: pointsLedger.id });
      creditAwarded = insertedCredit.length > 0;
      if (creditAwarded) {
        await tx.update(pointsWallets).set({
          currentBalance: newBalance,
          lifetimeEarned: wallet.lifetimeEarned + awardAmount,
          lastEarnedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(pointsWallets.userId, params.userId));
      }
    }

    return {
      counted: insertedEvent.length > 0,
      qualifyingCount,
      creditAwarded,
      reason: insertedEvent.length ? undefined : "already_counted",
    };
  });
}

export async function recordReversedRefill(params: {
  userId: string;
  fillEventId: string;
}): Promise<{ reversed: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`refill-credit:${params.userId}`}))`);
    await tx.insert(pointsWallets).values({ userId: params.userId }).onConflictDoNothing({ target: pointsWallets.userId });
    const [wallet] = await tx.select().from(pointsWallets).where(eq(pointsWallets.userId, params.userId));
    if (!wallet) return { reversed: false };
    const result = await tx
      .insert(pointsLedger)
      .values({
        userId: params.userId,
        actionType: "order_void",
        points: 0,
        balanceAfter: wallet.currentBalance,
        referenceType: "qualifying_refill_reversal",
        referenceId: params.fillEventId,
        description: "Reversed refill excluded from five-refill member credit",
        metadata: { campaign: FIVE_REFILL_CREDIT_CAMPAIGN },
        eventIdempotencyKey: `${FIVE_REFILL_CREDIT_CAMPAIGN}:reversal:${params.fillEventId}`,
      })
      .onConflictDoNothing({ target: pointsLedger.eventIdempotencyKey })
      .returning({ id: pointsLedger.id });

    const [{ value: qualifyingCount }] = await tx
      .select({ value: count() })
      .from(pointsLedger)
      .where(and(
        eq(pointsLedger.userId, params.userId),
        eq(pointsLedger.referenceType, "qualifying_refill"),
        sql`${pointsLedger.metadata}->>'campaign' = ${FIVE_REFILL_CREDIT_CAMPAIGN}`,
        sql`NOT EXISTS (
          SELECT 1 FROM points_ledger reversal
          WHERE reversal.user_id = ${params.userId}
            AND reversal.reference_type = 'qualifying_refill_reversal'
            AND reversal.reference_id = ${pointsLedger.referenceId}
            AND reversal.metadata->>'campaign' = ${FIVE_REFILL_CREDIT_CAMPAIGN}
        )`,
      ));
    const [{ value: campaignNetRaw }] = await tx
      .select({ value: sql<number>`COALESCE(SUM(${pointsLedger.points}), 0)` })
      .from(pointsLedger)
      .where(and(
        eq(pointsLedger.userId, params.userId),
        sql`${pointsLedger.metadata}->>'campaign' = ${FIVE_REFILL_CREDIT_CAMPAIGN}`,
      ));
    const campaignNet = Number(campaignNetRaw);

    if (qualifyingCount < 5 && campaignNet > 0) {
      const newBalance = wallet.currentBalance - campaignNet;
      await tx
        .insert(pointsLedger)
        .values({
          userId: params.userId,
          actionType: "order_void",
          points: -campaignNet,
          balanceAfter: newBalance,
          referenceType: "reward_reversal",
          referenceId: params.fillEventId,
          description: "Five-refill $20 store credit reversed after a qualifying fill reversal",
          metadata: { campaign: FIVE_REFILL_CREDIT_CAMPAIGN, valueUsd: 20 },
          eventIdempotencyKey: `${FIVE_REFILL_CREDIT_CAMPAIGN}:credit-reversal:${params.fillEventId}`,
        })
        .onConflictDoNothing({ target: pointsLedger.eventIdempotencyKey });
      await tx.update(pointsWallets).set({
        currentBalance: newBalance,
        updatedAt: new Date(),
      }).where(eq(pointsWallets.userId, params.userId));
    }

    return { reversed: result.length > 0 };
  });
}