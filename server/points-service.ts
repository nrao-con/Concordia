import { WebSocket } from "ws";
import { storage } from "./storage";
import type { PointsLedgerEntry, PointsWallet, EarningRule } from "@shared/schema";
import { DEFAULT_DAILY_POINTS_CAP, DEFAULT_WEEKLY_POINTS_CAP, GAMING_THRESHOLDS } from "@shared/schema";

// Type for earning rule evaluation context
interface EarningContext {
  userId: string;
  actionType: string;
  purchaseAmount?: number;
  orderId?: string;
  prescriptionId?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
}

// Check and reset daily/weekly caps if needed
async function checkAndResetCaps(wallet: PointsWallet): Promise<{ dailyRemaining: number; weeklyRemaining: number }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday start

  let dailyEarned = wallet.dailyPointsEarned ?? 0;
  let weeklyEarned = wallet.weeklyPointsEarned ?? 0;

  // Reset daily cap if new day
  const dailyResetAt = wallet.dailyPointsResetAt ? new Date(wallet.dailyPointsResetAt) : new Date(0);
  if (dailyResetAt < today) {
    dailyEarned = 0;
    await storage.resetDailyPointsCap(wallet.userId);
  }

  // Reset weekly cap if new week
  const weeklyResetAt = wallet.weeklyPointsResetAt ? new Date(wallet.weeklyPointsResetAt) : new Date(0);
  if (weeklyResetAt < startOfWeek) {
    weeklyEarned = 0;
    await storage.resetWeeklyPointsCap(wallet.userId);
  }

  return {
    dailyRemaining: Math.max(0, DEFAULT_DAILY_POINTS_CAP - dailyEarned),
    weeklyRemaining: Math.max(0, DEFAULT_WEEKLY_POINTS_CAP - weeklyEarned),
  };
}

// Apply caps to points amount
function applyPointsCaps(requestedPoints: number, dailyRemaining: number, weeklyRemaining: number): { 
  actualPoints: number; 
  cappedBy: string | null;
  dailyCapped: boolean;
  weeklyCapped: boolean;
} {
  let actualPoints = requestedPoints;
  let cappedBy: string | null = null;
  let dailyCapped = false;
  let weeklyCapped = false;

  if (actualPoints > weeklyRemaining) {
    actualPoints = weeklyRemaining;
    cappedBy = 'weekly';
    weeklyCapped = true;
  }
  
  if (actualPoints > dailyRemaining) {
    actualPoints = dailyRemaining;
    cappedBy = 'daily';
    dailyCapped = true;
  }

  return { actualPoints, cappedBy, dailyCapped, weeklyCapped };
}

// Gaming detection - track suspicious patterns
interface GamingCheckResult {
  isSuspicious: boolean;
  anomalyScore: number;
  reasons: string[];
}

async function checkForGaming(userId: string, actionType: string): Promise<GamingCheckResult> {
  const reasons: string[] = [];
  let anomalyScore = 0;
  
  // Get recent actions from ledger for this user
  const recentEntries = await storage.getPointsLedger(userId, 100);
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // Check for rapid same-action repeats (within 1 minute)
  const rapidWindow = new Date(now.getTime() - GAMING_THRESHOLDS.RAPID_ACTION_WINDOW_MS);
  const rapidSameActions = recentEntries.filter(e => 
    e.actionType === actionType && 
    new Date(e.createdAt) > rapidWindow
  );
  
  if (rapidSameActions.length >= 2) {
    anomalyScore += 15;
    reasons.push(`Rapid repeated ${actionType} actions`);
  }
  
  // Check for excessive refill requests (>5 per hour)
  if (actionType === 'on_time_refill') {
    const refillsLastHour = recentEntries.filter(e => 
      e.actionType === 'on_time_refill' && 
      new Date(e.createdAt) > oneHourAgo
    );
    if (refillsLastHour.length > GAMING_THRESHOLDS.MAX_REFILL_REQUESTS_PER_HOUR) {
      anomalyScore += 25;
      reasons.push(`Excessive refill requests (${refillsLastHour.length}/hour)`);
    }
  }
  
  // Check for too many logins/engagement per day
  if (actionType === 'weekly_app_engagement') {
    const engagementToday = recentEntries.filter(e => 
      e.actionType === 'weekly_app_engagement' && 
      new Date(e.createdAt) > oneDayAgo
    );
    if (engagementToday.length > GAMING_THRESHOLDS.MAX_LOGINS_PER_DAY) {
      anomalyScore += 20;
      reasons.push(`Too many engagement attempts (${engagementToday.length}/day)`);
    }
  }
  
  // Flag if anomaly score exceeds threshold
  if (anomalyScore >= GAMING_THRESHOLDS.ANOMALY_SCORE_THRESHOLD) {
    await storage.flagUserForGaming(userId, reasons.join('; '), anomalyScore);
  }
  
  return {
    isSuspicious: anomalyScore >= GAMING_THRESHOLDS.ANOMALY_SCORE_THRESHOLD,
    anomalyScore,
    reasons,
  };
}

// Export for admin visibility
export async function getUserGamingStatus(userId: string): Promise<{
  isFlagged: boolean;
  isFrozen: boolean;
  anomalyScore: number;
  flaggedReason: string | null;
}> {
  const wallet = await storage.getPointsWallet(userId);
  if (!wallet) {
    return { isFlagged: false, isFrozen: false, anomalyScore: 0, flaggedReason: null };
  }
  return {
    isFlagged: wallet.isFlagged ?? false,
    isFrozen: wallet.isFrozen ?? false,
    anomalyScore: wallet.anomalyScore ?? 0,
    flaggedReason: wallet.flaggedReason ?? null,
  };
}

// Cache for earning rules
let rulesCache: EarningRule[] = [];
let rulesCacheTime = 0;
const RULES_CACHE_TTL = 60000; // 1 minute

// WebSocket connections for real-time updates
let adminConnections: Set<WebSocket> | null = null;
let patientConnections: Map<string, WebSocket> = new Map();

export function setAdminConnections(connections: Set<WebSocket>) {
  adminConnections = connections;
}

export function addPatientConnection(userId: string, ws: WebSocket) {
  patientConnections.set(userId, ws);
}

export function removePatientConnection(userId: string) {
  patientConnections.delete(userId);
}

function broadcastToAdmin(channel: string, data: any) {
  if (!adminConnections) return;
  const message = JSON.stringify({ channel, data });
  adminConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

function broadcastToPatient(userId: string, channel: string, data: any) {
  const ws = patientConnections.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ channel, data }));
  }
}

async function getActiveRules(): Promise<EarningRule[]> {
  const now = Date.now();
  if (rulesCache.length === 0 || now - rulesCacheTime > RULES_CACHE_TTL) {
    rulesCache = await storage.getAllEarningRules();
    rulesCacheTime = now;
  }
  return rulesCache.filter(r => r.isActive);
}

export function invalidateRulesCache() {
  rulesCache = [];
  rulesCacheTime = 0;
}

// Get the earning rule for a specific action type
async function getEarningRule(actionType: string): Promise<EarningRule | undefined> {
  const rules = await getActiveRules();
  return rules.find(r => r.actionType === actionType);
}

// Calculate points based on earning rules
export async function calculatePointsForPurchase(amount: number): Promise<{ points: number; rule: EarningRule | null }> {
  const rule = await getEarningRule("otc_purchase");
  
  if (!rule) {
    // Fallback to default 10 points per dollar if no rule exists
    return { points: Math.floor(amount * 10), rule: null };
  }

  let points = rule.basePoints || 0;
  
  // Add points per dollar if defined
  if (rule.pointsPerDollar) {
    const ptsPerDollar = parseFloat(rule.pointsPerDollar);
    if (!isNaN(ptsPerDollar)) {
      points += Math.floor(amount * ptsPerDollar);
    }
  }

  // Apply max points cap if defined
  if (rule.maxPointsPerEvent && points > rule.maxPointsPerEvent) {
    points = rule.maxPointsPerEvent;
  }

  return { points, rule };
}

// Award points with cap enforcement and broadcast updates
export async function awardPoints(params: {
  userId: string;
  actionType: string;
  points: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
  campaignId?: number;
  adminId?: string;
  adminReason?: string;
  idempotencyKey?: string;
  bypassCaps?: boolean; // Admin awards can bypass caps
}): Promise<PointsLedgerEntry | null> {
  // Get wallet and check caps (unless bypassed by admin)
  const wallet = await storage.getOrCreatePointsWallet(params.userId);
  
  let actualPoints = params.points;
  let cappedInfo: { cappedBy: string | null; dailyCapped: boolean; weeklyCapped: boolean } = { 
    cappedBy: null, dailyCapped: false, weeklyCapped: false 
  };
  
  // Apply caps unless this is an admin action with bypass
  if (!params.bypassCaps && !params.adminId) {
    const caps = await checkAndResetCaps(wallet);
    const capResult = applyPointsCaps(params.points, caps.dailyRemaining, caps.weeklyRemaining);
    actualPoints = capResult.actualPoints;
    cappedInfo = capResult;
    
    // If capped to zero, don't award
    if (actualPoints <= 0) {
      console.log(`Points capped for user ${params.userId}: daily=${caps.dailyRemaining}, weekly=${caps.weeklyRemaining}`);
      return null;
    }
  }
  
  // Award points with potentially reduced amount
  const entry = await storage.awardPoints({
    ...params,
    points: actualPoints,
    metadata: {
      ...params.metadata,
      originalPoints: params.points,
      cappedBy: cappedInfo.cappedBy,
    },
  });
  
  // Update daily/weekly counters
  if (entry && !params.bypassCaps && !params.adminId) {
    await storage.updateDailyWeeklyPoints(params.userId, actualPoints);
  }
  
  if (entry) {
    // Get updated wallet balance
    const wallet = await storage.getOrCreatePointsWallet(params.userId);
    
    // Broadcast to admin panel
    broadcastToAdmin("wallet:updated", {
      userId: params.userId,
      wallet: {
        currentBalance: wallet.currentBalance,
        lifetimeEarned: wallet.lifetimeEarned,
        lifetimeRedeemed: wallet.lifetimeRedeemed,
      },
      transaction: {
        type: "earn",
        points: params.points,
        description: params.description,
        actionType: params.actionType,
      },
    });

    // Broadcast to patient (if connected)
    broadcastToPatient(params.userId, "wallet:updated", {
      currentBalance: wallet.currentBalance,
      lifetimeEarned: wallet.lifetimeEarned,
      lifetimeRedeemed: wallet.lifetimeRedeemed,
      lastTransaction: {
        type: "earn",
        points: params.points,
        description: params.description,
      },
    });

    // Also broadcast user profile update
    const user = await storage.getUser(params.userId);
    if (user) {
      broadcastToAdmin("user:updated", {
        userId: params.userId,
        loyaltyPoints: user.loyaltyPoints,
        wallet: {
          currentBalance: wallet.currentBalance,
          lifetimeEarned: wallet.lifetimeEarned,
        },
      });
    }
  }

  return entry;
}

// Deduct points and broadcast updates
export async function deductPoints(params: {
  userId: string;
  actionType: string;
  points: number;
  description: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, any>;
  adminId?: string;
  adminReason?: string;
  idempotencyKey?: string;
}): Promise<PointsLedgerEntry | null> {
  const entry = await storage.deductPoints(params);
  
  if (entry) {
    // Get updated wallet balance
    const wallet = await storage.getOrCreatePointsWallet(params.userId);
    
    // Broadcast to admin panel
    broadcastToAdmin("wallet:updated", {
      userId: params.userId,
      wallet: {
        currentBalance: wallet.currentBalance,
        lifetimeEarned: wallet.lifetimeEarned,
        lifetimeRedeemed: wallet.lifetimeRedeemed,
      },
      transaction: {
        type: "spend",
        points: params.points,
        description: params.description,
        actionType: params.actionType,
      },
    });

    // Broadcast to patient
    broadcastToPatient(params.userId, "wallet:updated", {
      currentBalance: wallet.currentBalance,
      lifetimeEarned: wallet.lifetimeEarned,
      lifetimeRedeemed: wallet.lifetimeRedeemed,
      lastTransaction: {
        type: "spend",
        points: params.points,
        description: params.description,
      },
    });

    // Also broadcast user profile update
    const user = await storage.getUser(params.userId);
    if (user) {
      broadcastToAdmin("user:updated", {
        userId: params.userId,
        loyaltyPoints: user.loyaltyPoints,
        wallet: {
          currentBalance: wallet.currentBalance,
          lifetimeRedeemed: wallet.lifetimeRedeemed,
        },
      });
    }
  }

  return entry;
}

// Apply earning rule for a specific action
export async function applyEarningRule(context: EarningContext): Promise<PointsLedgerEntry | null> {
  const rule = await getEarningRule(context.actionType);
  
  if (!rule || !rule.isActive) {
    return null;
  }

  // Check one-time rules
  if (rule.isOneTime) {
    const existing = await storage.checkIdempotencyKey(`${rule.ruleKey}_${context.userId}`);
    if (existing) {
      console.log(`One-time rule ${rule.ruleKey} already applied for user ${context.userId}`);
      return null;
    }
  }

  // Calculate points
  let points = rule.basePoints || 0;
  
  // For purchase-based rules, add points per dollar
  if (context.purchaseAmount && rule.pointsPerDollar) {
    const ptsPerDollar = parseFloat(rule.pointsPerDollar);
    if (!isNaN(ptsPerDollar)) {
      points += Math.floor(context.purchaseAmount * ptsPerDollar);
    }
  }

  // Apply max points cap
  if (rule.maxPointsPerEvent && points > rule.maxPointsPerEvent) {
    points = rule.maxPointsPerEvent;
  }

  if (points <= 0) {
    return null;
  }

  // Award the points
  return awardPoints({
    userId: context.userId,
    actionType: context.actionType,
    points,
    description: rule.description || rule.name,
    referenceType: context.referenceType,
    referenceId: context.referenceId,
    metadata: context.metadata,
    idempotencyKey: rule.isOneTime ? `${rule.ruleKey}_${context.userId}` : undefined,
  });
}

// Trigger profile completion points
export async function triggerProfileCompletion(userId: string): Promise<PointsLedgerEntry | null> {
  return applyEarningRule({
    userId,
    actionType: "profile_completion",
    referenceType: "user",
    referenceId: userId,
  });
}

// Trigger on-time refill points
export async function triggerOnTimeRefill(userId: string, prescriptionId: string): Promise<PointsLedgerEntry | null> {
  return applyEarningRule({
    userId,
    actionType: "on_time_refill",
    referenceType: "prescription",
    referenceId: prescriptionId,
  });
}

// Trigger delivery enabled points
export async function triggerEnableDelivery(userId: string): Promise<PointsLedgerEntry | null> {
  return applyEarningRule({
    userId,
    actionType: "enable_delivery",
    referenceType: "user",
    referenceId: userId,
  });
}

// Trigger weekly app engagement points
export async function triggerWeeklyEngagement(userId: string): Promise<PointsLedgerEntry | null> {
  // For engagement, use week-based idempotency
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  
  const rule = await getEarningRule("weekly_app_engagement");
  if (!rule || !rule.isActive) return null;

  return awardPoints({
    userId,
    actionType: "weekly_app_engagement",
    points: rule.basePoints || 10,
    description: rule.description || "Weekly app engagement bonus",
    referenceType: "engagement",
    referenceId: `week_${weekNumber}`,
    idempotencyKey: `weekly_engagement_${userId}_${weekNumber}`,
  });
}

// Void (reverse) all otc_purchase points awarded for a given order.
// Safe to call multiple times — idempotency key prevents double-reversals.
export async function voidOrderPoints(
  orderId: string,
  userId: string,
  orderNumber: string
): Promise<void> {
  const idempotencyKey = `void_order_${orderId}`;

  // Guard: skip if already voided
  const alreadyVoided = await storage.checkIdempotencyKey(idempotencyKey);
  if (alreadyVoided) return;

  // Find positive ledger entries tied to this order
  const earnedEntries = await storage.getPointsLedgerByOrderId(orderId);
  if (earnedEntries.length === 0) return;

  const totalEarned = earnedEntries.reduce((sum, e) => sum + e.points, 0);
  if (totalEarned <= 0) return;

  // Clamp reversal to current balance to avoid going negative
  const wallet = await storage.getPointsWallet(userId);
  const currentBalance = wallet?.currentBalance ?? 0;
  const reversalAmount = Math.min(totalEarned, currentBalance);

  if (reversalAmount <= 0) return;

  await deductPoints({
    userId,
    actionType: "order_void",
    points: reversalAmount,
    description: `Points reversed for cancelled/refunded order #${orderNumber}`,
    referenceType: "order",
    referenceId: orderId,
    idempotencyKey,
  });

  // Sync user loyalty points field
  const updatedWallet = await storage.getPointsWallet(userId);
  if (updatedWallet) {
    await storage.updateUserPoints(userId, updatedWallet.currentBalance);
  }
}

// Get wallet with real-time status
export async function getWalletWithStatus(userId: string): Promise<PointsWallet & { recentTransactions?: PointsLedgerEntry[] }> {
  const wallet = await storage.getOrCreatePointsWallet(userId);
  const recentTransactions = await storage.getPointsLedger(userId, 5);
  
  return {
    ...wallet,
    recentTransactions,
  };
}
