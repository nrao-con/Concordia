/**
 * PA Prescriber E-Signature — tests against the REAL production handlers
 *
 * Imports registerPaSignatureRoutes from server/pa-signature-routes.ts
 * (the same module mounted in production) and mounts it on a fresh Express
 * app in each test suite.  All I/O is intercepted via vi.mock so no network
 * or database calls are made.
 *
 * Sections
 * ────────
 * A  Unit tests — validateSignatureDataUrl + embedSignatureInHtml (pure functions)
 * B  Integration tests — the 4 real route handlers via supertest
 *    B1  POST /api/admin/pa-requests/:id/request-signature
 *    B2  GET  /api/pa-sign/:token/details
 *    B3  POST /api/pa-sign/:token/submit  (input validation — XSS vectors)
 *    B4  POST /api/pa-sign/:token/submit  (concurrency + happy path)
 *    B5  POST /api/admin/pa-requests/:id/void-signature
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { PriorAuthorizationRequest } from "@shared/schema";

// ── Mocks (declared before module imports) ────────────────────────────────────

vi.mock("../storage", () => ({
  storage: {
    getPriorAuthRequest: vi.fn(),
    getPriorAuthRequestBySignatureToken: vi.fn(),
    submitSignatureAtomically: vi.fn(),
    updatePriorAuthRequest: vi.fn(),
    createAuditLog: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn(),
  },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "email-mock-id" }),
  escapeHtml: (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
}));

// ── Module imports (after mocks) ──────────────────────────────────────────────

import { storage } from "../storage";
import { sendEmail } from "../email";
import { escapeHtml } from "../email";

// Real production functions under test
import {
  embedSignatureInHtml,
  validateSignatureDataUrl,
} from "../pa-service";

// Real production route registrar — this is what runs in production
import { registerPaSignatureRoutes } from "../pa-signature-routes";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const basePa: Partial<PriorAuthorizationRequest> = {
  id: "pa-123",
  userId: "user-abc",
  medicationName: "Humira",
  prescriberName: "Dr. Jane Smith",
  letterHtml: "<html><body><p>PA letter</p></body></html>",
  letterText: "PA letter",
  status: "pending_submission",
  signatureStatus: "not_required",
  signatureTokenHash: null,
  signatureTokenExpiresAt: null,
};

const allowAdmin = (_: any, __: any, next: any) => next();
const blockAdmin = (_: any, res: any) =>
  res.status(403).json({ message: "Forbidden" });

/** Creates a real Express app with the production route handlers. */
function buildApp(isAdminFn = allowAdmin) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  registerPaSignatureRoutes(app, {
    storage: storage as any,
    isAdmin: isAdminFn as any,
    sendEmail: sendEmail as any,
    escapeHtml: escapeHtml as any,
  });

  return app;
}

// ── Section A: Unit tests for pure service functions ─────────────────────────

describe("A — validateSignatureDataUrl (pure unit)", () => {
  it("accepts a valid PNG base64 data URL", () => {
    expect(() => validateSignatureDataUrl(VALID_PNG_DATA_URL)).not.toThrow();
  });

  it("rejects a JPEG data URL", () => {
    expect(() =>
      validateSignatureDataUrl("data:image/jpeg;base64,/9j/abc=")
    ).toThrow();
  });

  it("rejects a plain https:// URL", () => {
    expect(() =>
      validateSignatureDataUrl("https://example.com/img.png")
    ).toThrow();
  });

  it("rejects a quote break-out injection attempt", () => {
    expect(() =>
      validateSignatureDataUrl('data:image/png;base64,abc" onerror="alert(1)')
    ).toThrow();
  });

  it("rejects a javascript: URI", () => {
    expect(() =>
      validateSignatureDataUrl("javascript:alert(document.cookie)")
    ).toThrow();
  });

  it("rejects payloads > 400 000 chars", () => {
    const huge = "data:image/png;base64," + "A".repeat(400_001);
    expect(() => validateSignatureDataUrl(huge)).toThrow(/exceeds maximum/);
  });

  it("rejects base64 with HTML-special characters", () => {
    expect(() =>
      validateSignatureDataUrl(
        "data:image/png;base64,<script>alert(1)</script>"
      )
    ).toThrow();
  });
});

describe("A — embedSignatureInHtml (XSS safety, pure unit)", () => {
  it("HTML-escapes the signatureDataUrl so the src attribute cannot be broken out of", () => {
    const result = embedSignatureInHtml(
      "<html><body><p>Letter</p></body></html>",
      VALID_PNG_DATA_URL,
      "Dr. Smith",
      "August 18, 2026"
    );
    // The img src value must be contained inside double-quote delimiters
    const imgMatch = result.match(/<img src="([^"]*)"[^>]*>/);
    expect(imgMatch).toBeTruthy();
    expect(imgMatch![1]).toBe(VALID_PNG_DATA_URL);
  });

  it("HTML-escapes the signerName to prevent injection in the name paragraph", () => {
    const result = embedSignatureInHtml(
      "<body></body>",
      VALID_PNG_DATA_URL,
      '<script>alert("xss")</script>',
      "August 18, 2026"
    );
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("throws when given a data URL that fails the allow-list", () => {
    expect(() =>
      embedSignatureInHtml(
        "<body></body>",
        'data:image/png;base64,EVIL" onerror="alert(1)',
        "Dr. Smith",
        "August 18, 2026"
      )
    ).toThrow();
  });

  it("inserts the block before </body>", () => {
    const result = embedSignatureInHtml(
      "<html><body><p>Content</p></body></html>",
      VALID_PNG_DATA_URL,
      "Dr. Smith",
      "August 18, 2026"
    );
    expect(result.lastIndexOf("</body>")).toBeGreaterThan(
      result.indexOf("Prescriber Electronic Signature")
    );
  });

  it("appends the block when </body> is absent", () => {
    const result = embedSignatureInHtml(
      "<p>Letter</p>",
      VALID_PNG_DATA_URL,
      "Dr. Smith",
      "August 18, 2026"
    );
    expect(result).toContain("Prescriber Electronic Signature");
  });
});

// ── Section B: Integration tests against the REAL route handlers ──────────────

describe("B1 — POST /api/admin/pa-requests/:id/request-signature (real handler)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 when admin guard blocks", async () => {
    const res = await request(buildApp(blockAdmin))
      .post("/api/admin/pa-requests/pa-123/request-signature")
      .send({ prescriberEmail: "dr@example.com" });
    expect(res.status).toBe(403);
  });

  it("404 when PA not found", async () => {
    (storage.getPriorAuthRequest as any).mockResolvedValue(undefined);
    const res = await request(buildApp())
      .post("/api/admin/pa-requests/bad/request-signature")
      .send({ prescriberEmail: "dr@example.com" });
    expect(res.status).toBe(404);
  });

  it("400 when prescriberEmail is not a valid email", async () => {
    (storage.getPriorAuthRequest as any).mockResolvedValue(basePa);
    const res = await request(buildApp())
      .post("/api/admin/pa-requests/pa-123/request-signature")
      .send({ prescriberEmail: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("200: email sent to prescriber, SHA-256 hash stored (not raw token), status → awaiting_signature", async () => {
    const updated = { ...basePa, signatureStatus: "requested", status: "awaiting_signature" };
    (storage.getPriorAuthRequest as any).mockResolvedValue(basePa);
    (storage.updatePriorAuthRequest as any).mockResolvedValue(updated);

    const res = await request(buildApp())
      .post("/api/admin/pa-requests/pa-123/request-signature")
      .send({ prescriberEmail: "dr.smith@clinic.com" });

    expect(res.status).toBe(200);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.pa.status).toBe("awaiting_signature");

    // Verify the email was addressed to the prescriber
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dr.smith@clinic.com" })
    );

    // Verify the token hash (not the raw token) was stored
    const updateCall = (storage.updatePriorAuthRequest as any).mock.calls[0][1];
    expect(updateCall.signatureTokenHash).toHaveLength(64); // SHA-256 hex
    expect(updateCall.signatureStatus).toBe("requested");
    expect(updateCall.status).toBe("awaiting_signature");
    // Confirm the audit log was written
    expect(storage.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "pa-123" })
    );
  });

  it("email subject includes the medication name", async () => {
    (storage.getPriorAuthRequest as any).mockResolvedValue(basePa);
    (storage.updatePriorAuthRequest as any).mockResolvedValue(basePa);

    await request(buildApp())
      .post("/api/admin/pa-requests/pa-123/request-signature")
      .send({ prescriberEmail: "dr@example.com" });

    const emailCall = (sendEmail as any).mock.calls[0][0];
    expect(emailCall.subject).toContain("Humira");
  });
});

describe("B2 — GET /api/pa-sign/:token/details (real handler)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 when token not found / expired", async () => {
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(undefined);
    const res = await request(buildApp()).get("/api/pa-sign/bad-token/details");
    expect(res.status).toBe(404);
  });

  it("200: returns medication name, prescriber name, patientFirstName, letterHtml", async () => {
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(basePa);
    (storage.getUser as any).mockResolvedValue({ firstName: "Alice", lastName: "Johnson" });

    const res = await request(buildApp()).get("/api/pa-sign/valid-token/details");
    expect(res.status).toBe(200);
    expect(res.body.medicationName).toBe("Humira");
    expect(res.body.prescriberName).toBe("Dr. Jane Smith");
    expect(res.body.patientFirstName).toBe("Alice");
    expect(res.body.letterHtml).toBeTruthy();
  });

  it("falls back to 'Your patient' when user record is missing", async () => {
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(basePa);
    (storage.getUser as any).mockResolvedValue(null);

    const res = await request(buildApp()).get("/api/pa-sign/valid/details");
    expect(res.status).toBe(200);
    expect(res.body.patientFirstName).toBe("Your patient");
  });
});

describe("B3 — POST /api/pa-sign/:token/submit — XSS / input validation (real handler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(basePa);
  });

  const submit = (app: ReturnType<typeof buildApp>, body: object) =>
    request(app).post("/api/pa-sign/some-token/submit").send(body);

  it("400: plain https:// URL rejected (not a data URL)", async () => {
    const res = await submit(buildApp(), {
      signatureDataUrl: "https://evil.com/xss.png",
      signerName: "Dr. Smith",
    });
    expect(res.status).toBe(400);
  });

  it("400: JPEG data URL rejected (only PNG allowed)", async () => {
    const res = await submit(buildApp(), {
      signatureDataUrl: "data:image/jpeg;base64,/9j/abc=",
      signerName: "Dr. Smith",
    });
    expect(res.status).toBe(400);
  });

  it('400: event-handler injection in base64 segment — data:image/png;base64,abc" onerror=...', async () => {
    const res = await submit(buildApp(), {
      signatureDataUrl: 'data:image/png;base64,abc" onerror="alert(document.cookie)',
      signerName: "Dr. Smith",
    });
    expect(res.status).toBe(400);
  });

  it("400: angle bracket / script-tag injection attempt", async () => {
    const res = await submit(buildApp(), {
      signatureDataUrl: "data:image/png;base64,<script>alert(1)</script>",
      signerName: "Dr. Smith",
    });
    expect(res.status).toBe(400);
  });

  it("400: javascript: URI", async () => {
    const res = await submit(buildApp(), {
      signatureDataUrl: "javascript:alert(document.cookie)",
      signerName: "Dr. Smith",
    });
    expect(res.status).toBe(400);
  });

  it("400: empty signerName", async () => {
    const res = await submit(buildApp(), {
      signatureDataUrl: VALID_PNG_DATA_URL,
      signerName: "",
    });
    expect(res.status).toBe(400);
  });

  it("404: token not found before even reaching submission", async () => {
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(undefined);
    const res = await submit(buildApp(), {
      signatureDataUrl: VALID_PNG_DATA_URL,
      signerName: "Dr. Smith",
    });
    expect(res.status).toBe(404);
  });
});

describe("B4 — POST /api/pa-sign/:token/submit — concurrency + happy path (real handler)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("200 happy path: atomically stores signed letter, clears token, status → signature_received", async () => {
    const paWithSig = {
      ...basePa,
      signatureStatus: "received",
      status: "signature_received",
      signatureTokenHash: null,
    };
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(basePa);
    (storage.submitSignatureAtomically as any).mockResolvedValue(paWithSig);

    const res = await request(buildApp())
      .post("/api/pa-sign/valid-token/submit")
      .send({ signatureDataUrl: VALID_PNG_DATA_URL, signerName: "Dr. Jane Smith" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const atomicArgs = (storage.submitSignatureAtomically as any).mock.calls[0][0];
    expect(atomicArgs.tokenHash).toHaveLength(64);          // SHA-256 hex
    expect(atomicArgs.signedLetterHtml).toContain("data:image/png;base64,"); // img embedded
    expect(atomicArgs.signedLetterHtml).not.toContain('" onerror='); // no XSS payload
    expect(atomicArgs.signatureReceivedAt).toBeInstanceOf(Date);
  });

  it("409 when submitSignatureAtomically returns null — concurrent request already consumed token", async () => {
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(basePa);
    (storage.submitSignatureAtomically as any).mockResolvedValue(null); // already consumed

    const res = await request(buildApp())
      .post("/api/pa-sign/consumed-token/submit")
      .send({ signatureDataUrl: VALID_PNG_DATA_URL, signerName: "Dr. Smith" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been submitted/i);
  });

  it("confirmation email is sent to the pharmacy admin address (non-blocking)", async () => {
    (storage.getPriorAuthRequestBySignatureToken as any).mockResolvedValue(basePa);
    (storage.submitSignatureAtomically as any).mockResolvedValue({
      ...basePa,
      status: "signature_received",
    });

    await request(buildApp())
      .post("/api/pa-sign/token/submit")
      .send({ signatureDataUrl: VALID_PNG_DATA_URL, signerName: "Dr. Smith" });

    // sendEmail may be called asynchronously (fire-and-forget) — wait a tick
    await new Promise((r) => setTimeout(r, 20));
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("PA Signature Received") })
    );
  });
});

describe("B5 — POST /api/admin/pa-requests/:id/void-signature (real handler)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 when admin guard blocks", async () => {
    const res = await request(buildApp(blockAdmin)).post(
      "/api/admin/pa-requests/pa-123/void-signature"
    );
    expect(res.status).toBe(403);
  });

  it("404 when PA not found", async () => {
    (storage.getPriorAuthRequest as any).mockResolvedValue(undefined);
    const res = await request(buildApp()).post(
      "/api/admin/pa-requests/bad/void-signature"
    );
    expect(res.status).toBe(404);
  });

  it("200: signatureStatus → voided, status → pending_submission, signed letter cleared", async () => {
    const voidedPa = {
      ...basePa,
      signatureStatus: "voided",
      status: "pending_submission",
      signedLetterHtml: null,
    };
    (storage.getPriorAuthRequest as any).mockResolvedValue(basePa);
    (storage.updatePriorAuthRequest as any).mockResolvedValue(voidedPa);

    const res = await request(buildApp()).post(
      "/api/admin/pa-requests/pa-123/void-signature"
    );
    expect(res.status).toBe(200);

    const updateArgs = (storage.updatePriorAuthRequest as any).mock.calls[0][1];
    expect(updateArgs.signatureStatus).toBe("voided");
    expect(updateArgs.status).toBe("pending_submission");
    expect(updateArgs.signedLetterHtml).toBeNull();
    expect(updateArgs.signatureTokenHash).toBeNull();
    expect(storage.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: "pa-123" })
    );
  });
});
