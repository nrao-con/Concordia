import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: { query } }));

import { recordFraudSignal, subscribeFraudAlerts } from "../fraud-alert-service";

describe("fraud alert service", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("persists, audits, and sends a newly recorded privacy-safe alert", async () => {
    const createdAt = new Date("2026-09-08T20:00:00Z");
    query
      .mockResolvedValueOnce({
        rows: [{
          id: "ecf3b7d6-57c5-4866-98b7-6c6d0eb889f3",
          signal_type: "identity_switch_velocity",
          severity: "high",
          status: "open",
          source: "chat_identity",
          summary: "A visitor attempted too many distinct patient identities.",
          metadata: { challengeHash: "a".repeat(64), identityLimit: 5 },
          occurred_at: createdAt,
          created_at: createdAt,
          reviewed_at: null,
          reviewed_by: null,
          resolution: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const listener = vi.fn();
    const unsubscribe = subscribeFraudAlerts(listener);
    const alert = await recordFraudSignal({
      eventHash: "b".repeat(64),
      signalType: "identity_switch_velocity",
      severity: "high",
      source: "chat_identity",
      summary: "A visitor attempted too many distinct patient identities.",
      metadata: { challengeHash: "a".repeat(64), identityLimit: 5 },
    });
    unsubscribe();

    expect(alert?.status).toBe("open");
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1][2]).toContain('"fraud_alert_created"');
    expect(query.mock.calls[1][1][2]).not.toMatch(/name|email|date.?of.?birth|verification.?code/i);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(alert);
  });

  it("does not audit or resend a duplicate event", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const listener = vi.fn();
    const unsubscribe = subscribeFraudAlerts(listener);

    const alert = await recordFraudSignal({
      eventHash: "c".repeat(64),
      signalType: "verification_attempts_exhausted",
      severity: "medium",
      source: "chat_identity",
      summary: "A challenge reached its attempt limit.",
    });
    unsubscribe();

    expect(alert).toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
  });
});