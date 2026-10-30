/**
 * Tests: voidOrderPoints (server/points-service.ts)
 *
 * Exercises the loyalty-point reversal path that fires when an order is
 * cancelled or refunded.  All external dependencies (storage module) are
 * mocked so the tests run without a database.
 *
 * Scenarios covered:
 *   Reversal path         — deductPoints called with the earned amount when
 *                           positive ledger entries exist for the order
 *   Balance clamp         — reversal capped to current wallet balance when the
 *                           patient has already spent some of those points
 *   No points earned      — deductPoints NOT called when no positive ledger
 *                           entries exist for the order
 *   Idempotency           — second call for the same order is a no-op once the
 *                           void idempotency key is present in the ledger
 *   Zero balance          — no reversal when wallet balance is already 0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock the storage module BEFORE importing points-service so the module
// resolves the mocked version of `storage`.
// ---------------------------------------------------------------------------
vi.mock("../storage", () => {
  const mockStorage = {
    checkIdempotencyKey: vi.fn(),
    getPointsLedgerByOrderId: vi.fn(),
    getPointsWallet: vi.fn(),
    getOrCreatePointsWallet: vi.fn(),
    deductPoints: vi.fn(),
    updateUserPoints: vi.fn(),
    getUser: vi.fn(),
    addPointsLedgerEntry: vi.fn(),
    resetDailyPointsCap: vi.fn(),
    resetWeeklyPointsCap: vi.fn(),
    updateDailyWeeklyPoints: vi.fn(),
    flagUserForGaming: vi.fn(),
    getPointsLedger: vi.fn(),
  };
  return { storage: mockStorage };
});

import { voidOrderPoints } from "../points-service";
import { storage } from "../storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = "order-uuid-001";
const ORDER_NUMBER = "ORD-1001";
const USER_ID = "user-uuid-alice";
const VOID_KEY = `void_order_${ORDER_ID}`;

function makeLedgerEntry(points: number) {
  return {
    id: 1,
    userId: USER_ID,
    actionType: "otc_purchase",
    points,
    balanceAfter: 100,
    referenceType: "order",
    referenceId: ORDER_ID,
    description: "Earned from order #ORD-1001",
    metadata: null,
    expiresAt: null,
    isExpired: false,
    campaignId: null,
    adminId: null,
    adminReason: null,
    eventIdempotencyKey: `otc_purchase_${ORDER_ID}`,
    createdAt: new Date(),
  };
}

function makeWallet(balance: number) {
  return {
    id: "wallet-001",
    userId: USER_ID,
    currentBalance: balance,
    totalEarned: balance,
    totalRedeemed: 0,
    lifetimeEarned: balance,
    lifetimeRedeemed: 0,
    lifetimeTier: "bronze",
    isFrozen: false,
    isFlagged: false,
    anomalyScore: 0,
    flaggedReason: null,
    dailyPointsEarned: 0,
    weeklyPointsEarned: 0,
    dailyPointsResetAt: null,
    weeklyPointsResetAt: null,
    frozenUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: void key not yet present
  (storage.checkIdempotencyKey as Mock).mockResolvedValue(false);

  // Default: one ledger entry worth 50 points
  (storage.getPointsLedgerByOrderId as Mock).mockResolvedValue([
    makeLedgerEntry(50),
  ]);

  // Default: wallet with 50 points
  (storage.getPointsWallet as Mock).mockResolvedValue(makeWallet(50));

  // Default: deductPoints returns a ledger entry
  (storage.deductPoints as Mock).mockResolvedValue({
    id: 99,
    userId: USER_ID,
    points: -50,
  });

  // Default: getOrCreatePointsWallet (used by the broadcast path in deductPoints wrapper)
  (storage.getOrCreatePointsWallet as Mock).mockResolvedValue(makeWallet(0));

  // Default: getUser (used by broadcast path)
  (storage.getUser as Mock).mockResolvedValue({
    id: USER_ID,
    loyaltyPoints: 0,
  });

  // updateUserPoints: no-op
  (storage.updateUserPoints as Mock).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("voidOrderPoints", () => {
  it("calls deductPoints with the earned points amount when ledger entries exist", async () => {
    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    expect(storage.deductPoints).toHaveBeenCalledOnce();
    const callArgs = (storage.deductPoints as Mock).mock.calls[0][0];
    expect(callArgs.userId).toBe(USER_ID);
    expect(callArgs.points).toBe(50);
    expect(callArgs.actionType).toBe("order_void");
    expect(callArgs.referenceId).toBe(ORDER_ID);
    expect(callArgs.idempotencyKey).toBe(VOID_KEY);
  });

  it("clamps the reversal to the current wallet balance when it is lower than earned", async () => {
    // Patient earned 100 pts but only has 30 left
    (storage.getPointsLedgerByOrderId as Mock).mockResolvedValue([
      makeLedgerEntry(100),
    ]);
    (storage.getPointsWallet as Mock).mockResolvedValue(makeWallet(30));

    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    const callArgs = (storage.deductPoints as Mock).mock.calls[0][0];
    expect(callArgs.points).toBe(30);
  });

  it("does NOT call deductPoints when no positive ledger entries exist for the order", async () => {
    (storage.getPointsLedgerByOrderId as Mock).mockResolvedValue([]);

    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    expect(storage.deductPoints).not.toHaveBeenCalled();
  });

  it("does NOT call deductPoints when the wallet balance is 0", async () => {
    (storage.getPointsWallet as Mock).mockResolvedValue(makeWallet(0));

    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    expect(storage.deductPoints).not.toHaveBeenCalled();
  });

  it("is idempotent — skips the reversal when the void key already exists in the ledger", async () => {
    (storage.checkIdempotencyKey as Mock).mockResolvedValue(true);

    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    expect(storage.getPointsLedgerByOrderId).not.toHaveBeenCalled();
    expect(storage.deductPoints).not.toHaveBeenCalled();
  });

  it("syncs the user loyaltyPoints field after a successful reversal", async () => {
    (storage.getPointsWallet as Mock)
      .mockResolvedValueOnce(makeWallet(50))  // first call (balance check)
      .mockResolvedValueOnce(makeWallet(0));  // second call (post-deduction sync)

    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    expect(storage.updateUserPoints).toHaveBeenCalledWith(USER_ID, 0);
  });

  it("handles multiple earned entries by summing them before reversing", async () => {
    (storage.getPointsLedgerByOrderId as Mock).mockResolvedValue([
      makeLedgerEntry(30),
      makeLedgerEntry(20),
    ]);
    (storage.getPointsWallet as Mock).mockResolvedValue(makeWallet(50));

    await voidOrderPoints(ORDER_ID, USER_ID, ORDER_NUMBER);

    const callArgs = (storage.deductPoints as Mock).mock.calls[0][0];
    expect(callArgs.points).toBe(50); // 30 + 20, within balance
  });
});
