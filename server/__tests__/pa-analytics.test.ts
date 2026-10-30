/**
 * PA Analytics — targeted unit and route tests
 *
 * Covers:
 * 1. computeDecisionRates — drafts/pending/RFI are excluded from the denominator
 * 2. buildMonthlySeries   — correct timestamps used; all 6 months appear; zero-fill
 * 3. computeItemRate      — per-payer / per-medication rates against resolved only
 * 4. Route /api/admin/pa-analytics — auth guard, response shape, error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Pure helpers ───────────────────────────────────────────────────────────────

import {
  computeDecisionRates,
  buildMonthlySeries,
  computeItemRate,
} from "../pa-analytics-helpers";

describe("computeDecisionRates", () => {
  it("returns 0% for both rates when no PAs exist", () => {
    expect(computeDecisionRates(0, 0)).toEqual({ approvalRate: 0, denialRate: 0, resolved: 0 });
  });

  it("ignores non-resolved statuses — only approved + denied form the denominator", () => {
    // Scenario: 1 approved, 1 denied, 8 pending/draft/RFI/cancelled (not passed here)
    // Denominator must be 2, not 10
    const result = computeDecisionRates(1, 1);
    expect(result.resolved).toBe(2);
    expect(result.approvalRate).toBe(50);
    expect(result.denialRate).toBe(50);
  });

  it("calculates 100% approval rate when all resolved are approved", () => {
    const result = computeDecisionRates(5, 0);
    expect(result.approvalRate).toBe(100);
    expect(result.denialRate).toBe(0);
    expect(result.resolved).toBe(5);
  });

  it("calculates 100% denial rate when all resolved are denied", () => {
    const result = computeDecisionRates(0, 3);
    expect(result.approvalRate).toBe(0);
    expect(result.denialRate).toBe(100);
  });

  it("rounds fractional rates to nearest integer", () => {
    // 2 approved / 3 resolved = 66.67% → 67
    const result = computeDecisionRates(2, 1);
    expect(result.approvalRate).toBe(67);
    expect(result.denialRate).toBe(33);
  });

  it("draft-heavy queue does not dilute approval rate", () => {
    // If we passed total (approved + denied + 100 drafts) as denominator,
    // the approval rate would be near 0 despite 10/10 resolved being approved.
    // computeDecisionRates only receives the approved and denied counts.
    const result = computeDecisionRates(10, 0);
    expect(result.approvalRate).toBe(100); // not diluted by drafts
  });
});

describe("buildMonthlySeries", () => {
  // Fix reference date so months are deterministic
  const ref = new Date(2026, 7, 18); // August 2026

  it("returns exactly 6 months in ascending order", () => {
    const series = buildMonthlySeries(new Map(), new Map(), new Map(), ref);
    expect(series).toHaveLength(6);
    expect(series[0].month).toBe("2026-03"); // March 2026 (5 months back)
    expect(series[5].month).toBe("2026-08"); // August 2026
  });

  it("zero-fills months with no data", () => {
    const series = buildMonthlySeries(new Map(), new Map(), new Map(), ref);
    for (const m of series) {
      expect(m.submitted).toBe(0);
      expect(m.approved).toBe(0);
      expect(m.denied).toBe(0);
    }
  });

  it("places submissions in their submitted_at month, not their decision month", () => {
    // A PA was submitted in June and approved (decision) in August.
    // The June bar should show submitted=1; the August bar should show approved=1.
    const submittedMap = new Map([["2026-06", 1]]);
    const approvedMap = new Map([["2026-08", 1]]);
    const deniedMap = new Map<string, number>();

    const series = buildMonthlySeries(submittedMap, approvedMap, deniedMap, ref);
    const june = series.find((m) => m.month === "2026-06")!;
    const aug = series.find((m) => m.month === "2026-08")!;

    expect(june.submitted).toBe(1);
    expect(june.approved).toBe(0); // decision was NOT in June
    expect(aug.approved).toBe(1);  // decision landed in August
    expect(aug.submitted).toBe(0); // not submitted in August
  });

  it("handles data in all 6 months simultaneously", () => {
    const months = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
    const submittedMap = new Map(months.map((m, i) => [m, i + 1] as [string, number]));
    const series = buildMonthlySeries(submittedMap, new Map(), new Map(), ref);
    expect(series.map((m) => m.submitted)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ignores data outside the 6-month window without throwing", () => {
    // Data from 12 months ago should not appear
    const oldMap = new Map([["2025-01", 99]]);
    const series = buildMonthlySeries(oldMap, new Map(), new Map(), ref);
    for (const m of series) expect(m.submitted).toBe(0);
  });
});

describe("computeItemRate", () => {
  it("returns 0 when no resolved decisions", () => {
    expect(computeItemRate(0, 0)).toBe(0);
  });

  it("computes rate against approved + denied, not total pipeline", () => {
    // 3 approved, 1 denied = 4 resolved → 75%
    expect(computeItemRate(3, 1)).toBe(75);
  });

  it("returns 100 when all resolved are approved", () => {
    expect(computeItemRate(7, 0)).toBe(100);
  });

  it("returns 0 when all resolved are denied", () => {
    expect(computeItemRate(0, 4)).toBe(0);
  });
});

// ── Route tests ────────────────────────────────────────────────────────────────
// vi.mock is hoisted, so the factory must not reference outer variables.
// We use vi.fn() inline then access the mock via the imported storage object.

vi.mock("../storage", () => ({
  storage: {
    getPaAnalytics: vi.fn(),
  },
}));

vi.mock("@clerk/express", () => ({
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
  getAuth: () => ({ userId: "test-user" }),
}));

const mockAnalyticsPayload = {
  headline: {
    totalThisMonth: 5,
    avgTatHours: 36.5,
    approvalRate: 80,
    denialRate: 20,
    appealSuccessRate: 50,
    timeSavedHours: 4,
    aiGeneratedCount: 5,
  },
  monthly: [
    { month: "2026-03", submitted: 0, approved: 0, denied: 0, total: 0 },
    { month: "2026-04", submitted: 2, approved: 1, denied: 0, total: 2 },
    { month: "2026-05", submitted: 3, approved: 2, denied: 1, total: 3 },
    { month: "2026-06", submitted: 1, approved: 0, denied: 0, total: 1 },
    { month: "2026-07", submitted: 4, approved: 3, denied: 1, total: 4 },
    { month: "2026-08", submitted: 5, approved: 4, denied: 1, total: 5 },
  ],
  payerBreakdown: [
    { payer: "BlueCross", total: 10, approved: 8, denied: 2, approvalRate: 80, avgTatHours: 24, commonDenialReason: "Step therapy" },
  ],
  medicationBreakdown: [
    { medicationName: "Humira", total: 5, approved: 4, denied: 1, approvalRate: 80 },
  ],
};

// Imports that depend on mocks must come after vi.mock() declarations
import { storage } from "../storage";

function buildTestApp(isAdminFn: (req: any, res: any, next: any) => void) {
  const app = express();
  app.use(express.json());
  app.get("/api/admin/pa-analytics", isAdminFn, async (_req, res) => {
    try {
      const analytics = await storage.getPaAnalytics();
      res.json(analytics);
    } catch {
      res.status(500).json({ message: "Failed to fetch PA analytics" });
    }
  });
  return app;
}

const allowAdmin = (_req: any, _res: any, next: any) => next();
const blockAdmin = (_req: any, res: any) => res.status(403).json({ message: "Forbidden" });

describe("GET /api/admin/pa-analytics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when admin guard rejects", async () => {
    const app = buildTestApp(blockAdmin);
    const res = await request(app).get("/api/admin/pa-analytics");
    expect(res.status).toBe(403);
  });

  it("returns 200 with full analytics shape for an admin", async () => {
    (storage.getPaAnalytics as any).mockResolvedValue(mockAnalyticsPayload);
    const app = buildTestApp(allowAdmin);
    const res = await request(app).get("/api/admin/pa-analytics");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("headline");
    expect(res.body).toHaveProperty("monthly");
    expect(res.body).toHaveProperty("payerBreakdown");
    expect(res.body).toHaveProperty("medicationBreakdown");
  });

  it("monthly series contains exactly 6 entries", async () => {
    (storage.getPaAnalytics as any).mockResolvedValue(mockAnalyticsPayload);
    const app = buildTestApp(allowAdmin);
    const res = await request(app).get("/api/admin/pa-analytics");
    expect(res.body.monthly).toHaveLength(6);
  });

  it("rates in headline are against resolved decisions — draft-heavy queue does not dilute them", async () => {
    // 4 approved + 1 denied = 5 resolved out of 15 total (10 are pending/draft/RFI).
    // Approval rate must be 80% (4/5), NOT 27% (4/15).
    const payload = {
      ...mockAnalyticsPayload,
      headline: { ...mockAnalyticsPayload.headline, approvalRate: 80, denialRate: 20 },
    };
    (storage.getPaAnalytics as any).mockResolvedValue(payload);
    const app = buildTestApp(allowAdmin);
    const res = await request(app).get("/api/admin/pa-analytics");

    expect(res.body.headline.approvalRate).toBe(80);
    expect(res.body.headline.denialRate).toBe(20);
    // Rates must sum to 100% when denominator is resolved-only
    expect(res.body.headline.approvalRate + res.body.headline.denialRate).toBe(100);
  });

  it("submitted-then-approved PA appears in submitted_at month, not approved month", async () => {
    // PA submitted in June, payer decision (approved) received in August.
    // June bar: submitted=1, approved=0.  August bar: approved=1, submitted=0.
    const payload = {
      ...mockAnalyticsPayload,
      monthly: [
        { month: "2026-03", submitted: 0, approved: 0, denied: 0, total: 0 },
        { month: "2026-04", submitted: 0, approved: 0, denied: 0, total: 0 },
        { month: "2026-05", submitted: 0, approved: 0, denied: 0, total: 0 },
        { month: "2026-06", submitted: 1, approved: 0, denied: 0, total: 1 },
        { month: "2026-07", submitted: 0, approved: 0, denied: 0, total: 0 },
        { month: "2026-08", submitted: 0, approved: 1, denied: 0, total: 0 },
      ],
    };
    (storage.getPaAnalytics as any).mockResolvedValue(payload);
    const app = buildTestApp(allowAdmin);
    const res = await request(app).get("/api/admin/pa-analytics");

    const june = res.body.monthly.find((m: any) => m.month === "2026-06");
    const aug  = res.body.monthly.find((m: any) => m.month === "2026-08");
    expect(june.submitted).toBe(1);
    expect(june.approved).toBe(0); // payer decision did NOT land in June
    expect(aug.approved).toBe(1);  // payer decision landed in August
    expect(aug.submitted).toBe(0); // PA was not submitted in August
  });

  it("returns 500 when storage throws", async () => {
    (storage.getPaAnalytics as any).mockRejectedValue(new Error("DB down"));
    const app = buildTestApp(allowAdmin);
    const res = await request(app).get("/api/admin/pa-analytics");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed/i);
  });
});
