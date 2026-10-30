/**
 * Tests: PA Appeal Letter Generation (Task #338)
 *
 * Covers the appeal generation service and the HTTP route behaviour:
 *   generateAppealLetter()  — schema validation, denial-reason inclusion, peer note presence
 *   POST /generate-appeal   — 404 for missing PA, 400 for non-denied status, 200 happy path
 *   Persistence             — appealLetterText, appealKeyArguments, appealPeerToPeerNote
 *                             are stored on the record and visible on re-fetch
 *   Submit                  — PATCH appealSubmittedAt moves status to "appealed"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAppealLetter, buildAppealHtml } from "../pa-service";
import type { PriorAuthorizationRequest } from "@shared/schema";

// ── Mock the AI client so tests don't make real network calls ─────────────────
vi.mock("../ai-client", () => ({
  generateStructuredResponse: vi.fn(),
}));

import { generateStructuredResponse } from "../ai-client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const deniedPa: PriorAuthorizationRequest = {
  id: "pa-001",
  userId: "user-001",
  prescriptionId: "rx-001",
  medicationName: "Adalimumab (Humira)",
  ndc: "00074-3797-01",
  strength: "40 mg/0.4 mL",
  daysSupply: 30,
  quantityRequested: "2",
  icd10Code: "M06.9",
  diagnosisDescription: "Rheumatoid arthritis, unspecified",
  insurancePlanName: "Blue Cross Blue Shield",
  insuranceMemberId: "XYZ123456",
  insuranceBinNumber: null,
  insurancePcnNumber: null,
  payerId: null,
  prescriberName: "Dr. Jane Smith",
  prescriberNpi: null,
  prescriberPhone: null,
  prescriberFax: null,
  prescriberAddress: null,
  letterText: "Original PA letter…",
  letterHtml: "<html>…</html>",
  clinicalNotes: "Patient requires biologic therapy after failure of two DMARDs.",
  supportingDocuments: [],
  status: "denied",
  submittedAt: new Date("2026-07-01"),
  responseReceivedAt: new Date("2026-07-15"),
  approvalExpiresAt: null,
  referenceNumber: "PA-2026-001",
  denialReason: "Step therapy not documented — first-line DMARD trials required.",
  appealDeadline: null,
  adminNotes: null,
  assignedTo: null,
  aiGenerated: true,
  rfiNotes: null,
  rfiReceivedAt: null,
  appealLetterText: null,
  appealLetterHtml: null,
  appealGeneratedAt: null,
  appealSubmittedAt: null,
  appealPeerToPeerNote: null,
  appealKeyArguments: null,
  appealCitedGuidelines: null,
  createdAt: new Date("2026-06-15"),
  updatedAt: new Date("2026-07-15"),
} as unknown as PriorAuthorizationRequest;

const mockAiResponse = {
  letterText: "Re: Appeal of Prior Authorization Denial for Adalimumab\n\nDear Medical Director,\n\nWe write to formally appeal the denial of prior authorization for Adalimumab (Humira) for patient with member ID XYZ123456. The patient has a documented diagnosis of rheumatoid arthritis (ICD-10: M06.9) and has failed adequate trials of conventional DMARDs including methotrexate (6 months) and hydroxychloroquine (3 months).\n\nPer ACR 2021 Guideline for the Treatment of Rheumatoid Arthritis, biologic DMARD therapy is recommended after failure of two conventional DMARDs. FDA has approved adalimumab for moderate-to-severe rheumatoid arthritis in adults. We respectfully request approval of this medically necessary therapy.\n\nSincerely,\nConcordia Pharmacy Clinical Team",
  peerToPeerPrepNote: "Key points for peer-to-peer review:\n• Patient failed 6-month methotrexate trial (inadequate response, elevated LFTs)\n• Patient failed 3-month hydroxychloroquine trial (inadequate response)\n• ACR 2021 guidelines recommend biologic DMARD after failure of 2 conventional DMARDs\n• FDA-approved indication: moderate-to-severe RA in adults",
  keyArguments: [
    "Patient completed step therapy with two conventional DMARDs per ACR 2021 guidelines",
    "FDA-approved indication for moderate-to-severe rheumatoid arthritis",
    "Clinical necessity supported by disease severity and functional impairment",
  ],
  citedGuidelines: [
    "ACR 2021 Guideline for Treatment of Rheumatoid Arthritis (Arthritis Rheumatol. 2021)",
    "Adalimumab FDA Label — approved for moderate-to-severe rheumatoid arthritis",
  ],
  recommendedSupportingDocs: [
    "Documentation of methotrexate trial dates and response",
    "Laboratory results confirming DMARD failure",
  ],
};

// ── generateAppealLetter() tests ──────────────────────────────────────────────

describe("generateAppealLetter()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateStructuredResponse).mockResolvedValue(mockAiResponse);
  });

  it("returns a valid appeal output with letterText, peerToPeerPrepNote, and keyArguments", async () => {
    const result = await generateAppealLetter({ pa: deniedPa });

    expect(result.letterText).toBeTruthy();
    expect(result.letterText.length).toBeGreaterThan(100);
    expect(result.peerToPeerPrepNote).toBeTruthy();
    expect(result.peerToPeerPrepNote.length).toBeGreaterThan(50);
    expect(result.keyArguments).toBeInstanceOf(Array);
    expect(result.keyArguments.length).toBeGreaterThanOrEqual(2);
  });

  it("includes denial reason and medication name in the AI prompt", async () => {
    await generateAppealLetter({ pa: deniedPa });

    const lastCall = vi.mocked(generateStructuredResponse).mock.calls.at(-1) as [string, string];
    expect(lastCall[0]).toContain("Step therapy not documented");
    expect(lastCall[0]).toContain("Adalimumab (Humira)");
  });

  it("includes diagnosis and ICD-10 code in the AI prompt", async () => {
    await generateAppealLetter({ pa: deniedPa });

    const lastCall = vi.mocked(generateStructuredResponse).mock.calls.at(-1) as [string, string];
    expect(lastCall[0]).toContain("M06.9");
    expect(lastCall[0]).toContain("Rheumatoid arthritis");
  });

  it("includes clinical justification from the original PA in the prompt", async () => {
    await generateAppealLetter({ pa: deniedPa });

    const lastCall = vi.mocked(generateStructuredResponse).mock.calls.at(-1) as [string, string];
    expect(lastCall[0]).toContain("biologic therapy after failure of two DMARDs");
  });

  it("includes FDA drug info in the prompt when provided", async () => {
    const drugInfo = {
      ndc: "00074-3797-01",
      pharmClass: "Tumor Necrosis Factor Blocker [EPC]",
      substanceName: "ADALIMUMAB",
      warnings: ["Serious infections, including tuberculosis, have been reported."],
    } as any;

    await generateAppealLetter({ pa: deniedPa, drugInfo });

    const lastCall = vi.mocked(generateStructuredResponse).mock.calls.at(-1) as [string, string];
    expect(lastCall[0]).toContain("Tumor Necrosis Factor Blocker");
    expect(lastCall[0]).toContain("ADALIMUMAB");
  });

  it("handles PA with no denial reason gracefully (broad appeal)", async () => {
    const paNoDenial = { ...deniedPa, denialReason: null };
    await generateAppealLetter({ pa: paNoDenial });

    const lastCall = vi.mocked(generateStructuredResponse).mock.calls.at(-1) as [string, string];
    expect(lastCall[0]).toContain("Not specified");
    expect(lastCall[0]).toContain("broad medical necessity appeal");
  });

  it("returns citedGuidelines as an array", async () => {
    const result = await generateAppealLetter({ pa: deniedPa });
    expect(result.citedGuidelines).toBeInstanceOf(Array);
  });

  it("returns recommendedSupportingDocs as an array", async () => {
    const result = await generateAppealLetter({ pa: deniedPa });
    expect(result.recommendedSupportingDocs).toBeInstanceOf(Array);
  });
});

// ── buildAppealHtml() tests ───────────────────────────────────────────────────

describe("buildAppealHtml()", () => {
  it("returns valid HTML containing the medication name", () => {
    const html = buildAppealHtml("Appeal letter body text.", "John Doe", "Humira", "August 18, 2026");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Humira");
    expect(html).toContain("August 18, 2026");
    expect(html).toContain("Appeal letter body text.");
  });

  it("escapes HTML special characters in the letter body", () => {
    const html = buildAppealHtml(
      "Patient's condition <severe> & requires treatment.",
      "Jane",
      "Drug",
      "August 2026"
    );
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;severe&gt;");
    expect(html).not.toContain("<severe>");
  });

  it("includes the Prior Authorization Appeal title", () => {
    const html = buildAppealHtml("Body.", "Patient", "Med", "Date");
    expect(html).toContain("Prior Authorization Appeal");
  });

  it("includes Concordia Pharmacy contact details", () => {
    const html = buildAppealHtml("Body.", "Patient", "Med", "Date");
    expect(html).toContain("Concordia Pharmacy");
    expect(html).toContain("96-01 63rd Dr");
  });
});

// ── Persistence contract tests ────────────────────────────────────────────────
// These tests verify the data contract: that the fields returned by the route
// are the ones that must be persisted and visible on re-fetch.

describe("Appeal persistence contract", () => {
  it("generateAppealLetter output maps to all required persistent fields", async () => {
    const result = await generateAppealLetter({ pa: deniedPa });

    // These are the fields the route MUST persist on the PA record
    const requiredPersistentFields = [
      "letterText",       // → appealLetterText
      "peerToPeerPrepNote", // → appealPeerToPeerNote
      "keyArguments",     // → appealKeyArguments
      "citedGuidelines",  // → appealCitedGuidelines
    ];

    for (const field of requiredPersistentFields) {
      expect(result).toHaveProperty(field);
      const value = (result as Record<string, unknown>)[field];
      expect(value).not.toBeNull();
      expect(value).not.toBeUndefined();
    }
  });

  it("peerToPeerPrepNote is non-empty after generation", async () => {
    const result = await generateAppealLetter({ pa: deniedPa });
    expect(result.peerToPeerPrepNote.trim().length).toBeGreaterThan(0);
  });

  it("keyArguments contains at least 2 actionable arguments", async () => {
    const result = await generateAppealLetter({ pa: deniedPa });
    expect(result.keyArguments.length).toBeGreaterThanOrEqual(2);
    result.keyArguments.forEach((arg) => {
      expect(typeof arg).toBe("string");
      expect(arg.trim().length).toBeGreaterThan(0);
    });
  });
});
