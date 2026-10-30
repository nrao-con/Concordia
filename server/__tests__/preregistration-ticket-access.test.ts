/**
 * Tests: Pre-registration ticket access after patient sign-up
 *
 * Covers the ownership logic extracted into server/patientIdentity.ts and used
 * directly by the production routes in server/routes.ts:
 *   GET /api/external/flu-shot                       (~line 4295) — list endpoint
 *   GET /api/external/flu-shot/:ticketNumber         (~line 4352) — single-ticket endpoint
 *   GET /api/external/insurance-help                 (~line 4392) — list endpoint
 *   GET /api/external/insurance-help/:ticketNumber   (~line 4437) — single-ticket endpoint
 *
 * The integration tests below mount a minimal Express app that calls the REAL
 * resolvePatientIdentity / isFluShotTicketOwned / isInsuranceTicketOwned
 * functions imported from the production module — so any change to those
 * functions is immediately exercised here.
 *
 * Scenario under test (the "pre-registration merge"):
 *   A patient submits a ticket before registering — the ticket stores only
 *   their email (userId is null).  After they create a ConcordiaCare account,
 *   the app queries using concordiaCareUserId.  resolvePatientIdentity maps
 *   that id to the patient's email and the ownership check then matches
 *   ticket.email to the resolved email — granting access without requiring a
 *   userId on the ticket itself.
 */

import { describe, it, expect, beforeAll } from "vitest";
import express, { type Application } from "express";
import request from "supertest";

// Import REAL production functions — changes here will break these tests.
import {
  resolvePatientIdentity,
  isFluShotTicketOwned,
  isInsuranceTicketOwned,
  type PatientIdentityStore,
  type ResolvedIdentity,
} from "../patientIdentity";

// ---------------------------------------------------------------------------
// Shared types (subset of the DB records used by these two routes)
// ---------------------------------------------------------------------------

interface MockFluShotAppointment {
  ticketNumber: string;
  userId: string | null;
  email: string | null;
  status: string;
  scheduledDate: Date;
  scheduledTime: string;
  fluShotType: string;
}

interface MockInsuranceHelpRequest {
  ticketNumber: string;
  userId: string | null;
  email: string | null;
  status: string;
  adminNotes: string | null;
}

interface MockStorage extends PatientIdentityStore {
  getFluShotAppointmentByTicketNumber(tn: string): Promise<MockFluShotAppointment | undefined>;
  getFluShotAppointmentsByUserId(userId: string): Promise<MockFluShotAppointment[]>;
  getFluShotAppointmentsByEmail(email: string): Promise<MockFluShotAppointment[]>;
  getInsuranceAssistanceRequestByTicketNumber(tn: string): Promise<MockInsuranceHelpRequest | undefined>;
  getInsuranceAssistanceRequestsByUserId(userId: string): Promise<MockInsuranceHelpRequest[]>;
  getInsuranceAssistanceRequestsByEmail(email: string): Promise<MockInsuranceHelpRequest[]>;
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ALICE_EMAIL = "alice@example.com";
const ALICE_CCU_ID = "ccu-alice-001";
const ALICE_USER_ID = "user-alice-001";

const BOB_EMAIL = "bob@example.com";
const BOB_CCU_ID = "ccu-bob-002";
const BOB_USER_ID = "user-bob-002";

const FLU_TICKET = "FLU-2024-0001";
const INS_TICKET = "INS-2024-0001";

// Pre-registration fixtures — email set, userId null (patient hadn't registered yet)
const fluAppointmentPreReg: MockFluShotAppointment = {
  ticketNumber: FLU_TICKET,
  userId: null,
  email: ALICE_EMAIL,
  status: "scheduled",
  scheduledDate: new Date("2024-10-15"),
  scheduledTime: "10:00 AM",
  fluShotType: "Standard Flu Vaccine",
};

// Post-registration fixture — userId set (patient registered after submitting ticket)
const FLU_TICKET_2 = "FLU-2024-0002";
const fluAppointmentPostReg: MockFluShotAppointment = {
  ticketNumber: FLU_TICKET_2,
  userId: ALICE_USER_ID,
  email: ALICE_EMAIL,
  status: "completed",
  scheduledDate: new Date("2024-11-01"),
  scheduledTime: "02:00 PM",
  fluShotType: "High-Dose Flu Vaccine",
};

const insuranceRequestPreReg: MockInsuranceHelpRequest = {
  ticketNumber: INS_TICKET,
  userId: null,
  email: ALICE_EMAIL,
  status: "pending",
  adminNotes: null,
};

// Second insurance request owned by userId (post-registration)
const INS_TICKET_2 = "INS-2024-0002";
const insuranceRequestPostReg: MockInsuranceHelpRequest = {
  ticketNumber: INS_TICKET_2,
  userId: ALICE_USER_ID,
  email: ALICE_EMAIL,
  status: "resolved",
  adminNotes: "All set.",
};

// ---------------------------------------------------------------------------
// Mock storage factory
// ---------------------------------------------------------------------------

function buildMockStorage(overrides: Partial<MockStorage> = {}): MockStorage {
  return {
    async getUserByConcordiaCareUserId(id) {
      if (id === ALICE_CCU_ID) return { id: ALICE_USER_ID, email: ALICE_EMAIL };
      if (id === BOB_CCU_ID) return { id: BOB_USER_ID, email: BOB_EMAIL };
      return undefined;
    },
    async getUserByEmail(email) {
      if (email === ALICE_EMAIL) return { id: ALICE_USER_ID, email: ALICE_EMAIL };
      if (email === BOB_EMAIL) return { id: BOB_USER_ID, email: BOB_EMAIL };
      return undefined;
    },
    async getFluShotAppointmentByTicketNumber(tn) {
      if (tn === FLU_TICKET) return fluAppointmentPreReg;
      if (tn === FLU_TICKET_2) return fluAppointmentPostReg;
      return undefined;
    },
    async getFluShotAppointmentsByUserId(userId) {
      const all = [fluAppointmentPreReg, fluAppointmentPostReg];
      return all.filter((a) => a.userId === userId);
    },
    async getFluShotAppointmentsByEmail(email) {
      const all = [fluAppointmentPreReg, fluAppointmentPostReg];
      return all.filter((a) => a.email?.toLowerCase() === email.toLowerCase());
    },
    async getInsuranceAssistanceRequestByTicketNumber(tn) {
      if (tn === INS_TICKET) return insuranceRequestPreReg;
      if (tn === INS_TICKET_2) return insuranceRequestPostReg;
      return undefined;
    },
    async getInsuranceAssistanceRequestsByUserId(userId) {
      const all = [insuranceRequestPreReg, insuranceRequestPostReg];
      return all.filter((r) => r.userId === userId);
    },
    async getInsuranceAssistanceRequestsByEmail(email) {
      const all = [insuranceRequestPreReg, insuranceRequestPostReg];
      return all.filter((r) => r.email?.toLowerCase() === email.toLowerCase());
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal Express app factory
//
// Registers only the two endpoints under test using the REAL production helper
// functions (resolvePatientIdentity, isFluShotTicketOwned,
// isInsuranceTicketOwned) imported from server/patientIdentity.ts.
// The storage dependency is injected via the factory parameter.
// ---------------------------------------------------------------------------

const TEST_API_KEY = "test-api-key-abc123";

function buildApp(storage: MockStorage): Application {
  const app = express();
  app.use(express.json());

  function requireApiKey(req: any, res: any, next: any) {
    const provided = req.headers["x-api-key"];
    if (provided !== TEST_API_KEY) {
      return res.status(401).json({ message: "Invalid or missing API key" });
    }
    next();
  }

  // GET /api/external/flu-shot — list all appointments for the authenticated patient
  app.get("/api/external/flu-shot", requireApiKey, async (req, res) => {
    const { concordiaCareUserId, email } = req.query as {
      concordiaCareUserId?: string;
      email?: string;
    };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({
        success: false,
        message: "One of concordiaCareUserId or email is required to verify identity",
      });
    }

    try {
      const { patientUserId, patientEmail } = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      if (!patientUserId && !patientEmail) {
        return res.json({ success: true, appointments: [] });
      }

      let appointments: MockFluShotAppointment[] = [];
      if (patientUserId && patientEmail) {
        const byUserId = await storage.getFluShotAppointmentsByUserId(patientUserId);
        const byEmail = await storage.getFluShotAppointmentsByEmail(patientEmail);
        const seen = new Set<string>();
        for (const a of [...byUserId, ...byEmail]) {
          if (!seen.has(a.ticketNumber)) { seen.add(a.ticketNumber); appointments.push(a); }
        }
      } else if (patientUserId) {
        appointments = await storage.getFluShotAppointmentsByUserId(patientUserId);
      } else if (patientEmail) {
        appointments = await storage.getFluShotAppointmentsByEmail(patientEmail);
      }

      return res.json({
        success: true,
        appointments: appointments.map((a) => ({
          ticketNumber: a.ticketNumber,
          status: a.status,
          scheduledDate: a.scheduledDate,
          scheduledTime: a.scheduledTime,
          fluShotType: a.fluShotType,
        })),
      });
    } catch {
      res.status(500).json({ success: false, message: "Failed to retrieve appointments" });
    }
  });

  // GET /api/external/insurance-help — list all requests for the authenticated patient
  app.get("/api/external/insurance-help", requireApiKey, async (req, res) => {
    const { concordiaCareUserId, email } = req.query as {
      concordiaCareUserId?: string;
      email?: string;
    };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({
        success: false,
        message: "One of concordiaCareUserId or email is required to verify identity",
      });
    }

    try {
      const { patientUserId, patientEmail } = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      if (!patientUserId && !patientEmail) {
        return res.json({ success: true, requests: [] });
      }

      let requests: MockInsuranceHelpRequest[] = [];
      if (patientUserId && patientEmail) {
        const byUserId = await storage.getInsuranceAssistanceRequestsByUserId(patientUserId);
        const byEmail = await storage.getInsuranceAssistanceRequestsByEmail(patientEmail);
        const seen = new Set<string>();
        for (const r of [...byUserId, ...byEmail]) {
          if (!seen.has(r.ticketNumber)) { seen.add(r.ticketNumber); requests.push(r); }
        }
      } else if (patientUserId) {
        requests = await storage.getInsuranceAssistanceRequestsByUserId(patientUserId);
      } else if (patientEmail) {
        requests = await storage.getInsuranceAssistanceRequestsByEmail(patientEmail);
      }

      return res.json({
        success: true,
        requests: requests.map((r) => {
          const entry: Record<string, unknown> = { ticketNumber: r.ticketNumber, status: r.status };
          if (r.adminNotes) entry.adminNotes = r.adminNotes;
          return entry;
        }),
      });
    } catch {
      res.status(500).json({ success: false, message: "Failed to retrieve insurance help requests" });
    }
  });

  // GET /api/external/flu-shot/:ticketNumber
  // Uses production resolvePatientIdentity + isFluShotTicketOwned
  app.get("/api/external/flu-shot/:ticketNumber", requireApiKey, async (req, res) => {
    const { ticketNumber } = req.params;
    const { concordiaCareUserId, email } = req.query as {
      concordiaCareUserId?: string;
      email?: string;
    };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({
        success: false,
        message: "One of concordiaCareUserId or email is required to verify identity",
      });
    }

    try {
      const appointment = await storage.getFluShotAppointmentByTicketNumber(ticketNumber);
      const identity = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      if (!isFluShotTicketOwned(appointment, identity)) {
        return res.status(404).json({ success: false, message: "Appointment not found" });
      }

      return res.json({
        success: true,
        ticketNumber: appointment!.ticketNumber,
        status: appointment!.status,
        scheduledDate: appointment!.scheduledDate,
        scheduledTime: appointment!.scheduledTime,
        fluShotType: appointment!.fluShotType,
      });
    } catch {
      res.status(500).json({ success: false, message: "Failed to retrieve appointment status" });
    }
  });

  // GET /api/external/insurance-help/:ticketNumber
  // Uses production resolvePatientIdentity + isInsuranceTicketOwned
  app.get("/api/external/insurance-help/:ticketNumber", requireApiKey, async (req, res) => {
    const { ticketNumber } = req.params;
    const { concordiaCareUserId, email } = req.query as {
      concordiaCareUserId?: string;
      email?: string;
    };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({
        success: false,
        message: "One of concordiaCareUserId or email is required to verify identity",
      });
    }

    try {
      const requestRecord = await storage.getInsuranceAssistanceRequestByTicketNumber(ticketNumber);
      const identity = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      if (!isInsuranceTicketOwned(requestRecord, identity)) {
        return res.status(404).json({ success: false, message: "Insurance help request not found" });
      }

      const responseBody: Record<string, unknown> = {
        success: true,
        ticketNumber: requestRecord!.ticketNumber,
        status: requestRecord!.status,
      };
      if (requestRecord!.adminNotes) {
        responseBody.adminNotes = requestRecord!.adminNotes;
      }

      return res.json(responseBody);
    } catch {
      res.status(500).json({ success: false, message: "Failed to retrieve insurance help request status" });
    }
  });

  return app;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function authedGet(app: Application, path: string) {
  return request(app).get(path).set("x-api-key", TEST_API_KEY);
}

// ---------------------------------------------------------------------------
// Tests: Flu Shot — pre-registration ticket access
// ---------------------------------------------------------------------------

describe("GET /api/external/flu-shot/:ticketNumber — pre-registration merge", () => {
  let app: Application;

  beforeAll(() => {
    app = buildApp(buildMockStorage());
  });

  it("returns 400 when neither concordiaCareUserId nor email is provided", async () => {
    const res = await authedGet(app, `/api/external/flu-shot/${FLU_TICKET}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("happy path: registered patient retrieves pre-registration ticket via concordiaCareUserId", async () => {
    // Alice submitted a flu-shot form before registering (ticket has her email, no userId).
    // After signing up she queries with her concordiaCareUserId.
    // resolvePatientIdentity maps concordiaCareUserId → alice's email.
    // isFluShotTicketOwned returns true because ticket.email matches.
    const res = await authedGet(
      app,
      `/api/external/flu-shot/${FLU_TICKET}?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketNumber).toBe(FLU_TICKET);
    expect(res.body.status).toBe("scheduled");
    expect(res.body.fluShotType).toBe("Standard Flu Vaccine");
  });

  it("happy path: pre-registration ticket accessible via original email", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot/${FLU_TICKET}?email=${encodeURIComponent(ALICE_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketNumber).toBe(FLU_TICKET);
  });

  it("negative: different patient's concordiaCareUserId is rejected with 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot/${FLU_TICKET}?concordiaCareUserId=${BOB_CCU_ID}`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("negative: unknown concordiaCareUserId with no email falls through to 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot/${FLU_TICKET}?concordiaCareUserId=ccu-unknown`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("negative: wrong email address is rejected with 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot/${FLU_TICKET}?email=${encodeURIComponent(BOB_EMAIL)}`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("negative: non-existent ticket number returns 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot/FLU-9999?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when API key is missing", async () => {
    const res = await request(app).get(`/api/external/flu-shot/${FLU_TICKET}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Tests: Insurance Help — pre-registration ticket access
// ---------------------------------------------------------------------------

describe("GET /api/external/insurance-help/:ticketNumber — pre-registration merge", () => {
  let app: Application;

  beforeAll(() => {
    app = buildApp(buildMockStorage());
  });

  it("returns 400 when neither concordiaCareUserId nor email is provided", async () => {
    const res = await authedGet(app, `/api/external/insurance-help/${INS_TICKET}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("happy path: registered patient retrieves pre-registration ticket via concordiaCareUserId", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help/${INS_TICKET}?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketNumber).toBe(INS_TICKET);
    expect(res.body.status).toBe("pending");
  });

  it("happy path: adminNotes included in response when present", async () => {
    const storageWithNotes = buildMockStorage({
      async getInsuranceAssistanceRequestByTicketNumber(tn) {
        if (tn === INS_TICKET) {
          return { ...insuranceRequestPreReg, adminNotes: "Reviewing your case." };
        }
        return undefined;
      },
    });
    const appWithNotes = buildApp(storageWithNotes);
    const res = await authedGet(
      appWithNotes,
      `/api/external/insurance-help/${INS_TICKET}?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.adminNotes).toBe("Reviewing your case.");
  });

  it("happy path: pre-registration ticket accessible via original email", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help/${INS_TICKET}?email=${encodeURIComponent(ALICE_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticketNumber).toBe(INS_TICKET);
  });

  it("negative: different patient's concordiaCareUserId is rejected with 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help/${INS_TICKET}?concordiaCareUserId=${BOB_CCU_ID}`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("negative: unknown concordiaCareUserId (no matching user, no fallback email) → 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help/${INS_TICKET}?concordiaCareUserId=ccu-unknown`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("negative: wrong email address is rejected with 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help/${INS_TICKET}?email=${encodeURIComponent(BOB_EMAIL)}`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("negative: non-existent ticket number returns 404", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help/INS-9999?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when API key is missing", async () => {
    const res = await request(app).get(`/api/external/insurance-help/${INS_TICKET}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Tests: Flu Shot list endpoint — GET /api/external/flu-shot
// ---------------------------------------------------------------------------

describe("GET /api/external/flu-shot — list endpoint ownership", () => {
  let app: Application;

  beforeAll(() => {
    app = buildApp(buildMockStorage());
  });

  it("returns 400 when neither concordiaCareUserId nor email is provided", async () => {
    const res = await authedGet(app, "/api/external/flu-shot");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when API key is missing", async () => {
    const res = await request(app).get("/api/external/flu-shot");
    expect(res.status).toBe(401);
  });

  it("happy path: owner retrieves their appointments via concordiaCareUserId (deduped)", async () => {
    // Alice has two appointments — both matched because concordiaCareUserId resolves her
    // userId + email, which are then used to query by both dimensions and deduplicate.
    const res = await authedGet(
      app,
      `/api/external/flu-shot?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tickets = res.body.appointments.map((a: { ticketNumber: string }) => a.ticketNumber);
    expect(tickets).toContain(FLU_TICKET);
    expect(tickets).toContain(FLU_TICKET_2);
  });

  it("happy path: owner retrieves their appointments via email", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot?email=${encodeURIComponent(ALICE_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tickets = res.body.appointments.map((a: { ticketNumber: string }) => a.ticketNumber);
    expect(tickets).toContain(FLU_TICKET);
  });

  it("isolation: different patient receives only their own (empty) list — not Alice's appointments", async () => {
    // Bob has no appointments; he must receive an empty list, not Alice's data.
    const res = await authedGet(
      app,
      `/api/external/flu-shot?concordiaCareUserId=${BOB_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointments).toHaveLength(0);
  });

  it("isolation: different patient's email receives only their own (empty) list", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot?email=${encodeURIComponent(BOB_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointments).toHaveLength(0);
  });

  it("unknown concordiaCareUserId with no fallback email returns empty list (not an error)", async () => {
    const res = await authedGet(
      app,
      "/api/external/flu-shot?concordiaCareUserId=ccu-does-not-exist"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointments).toHaveLength(0);
  });

  it("unknown email returns empty list (not an error)", async () => {
    const res = await authedGet(
      app,
      "/api/external/flu-shot?email=nobody%40example.com"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointments).toHaveLength(0);
  });

  it("response shape includes required fields for each appointment", async () => {
    const res = await authedGet(
      app,
      `/api/external/flu-shot?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    for (const appt of res.body.appointments) {
      expect(appt).toHaveProperty("ticketNumber");
      expect(appt).toHaveProperty("status");
      expect(appt).toHaveProperty("scheduledDate");
      expect(appt).toHaveProperty("scheduledTime");
      expect(appt).toHaveProperty("fluShotType");
    }
  });

  it("precedence: concordiaCareUserId takes priority over a mismatched email", async () => {
    // Alice's concordiaCareUserId is supplied together with Bob's email.
    // resolvePatientIdentity must resolve Alice's identity (concordiaCareUserId wins),
    // so the response must contain Alice's appointments — not an empty list.
    const res = await authedGet(
      app,
      `/api/external/flu-shot?concordiaCareUserId=${ALICE_CCU_ID}&email=${encodeURIComponent(BOB_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tickets = res.body.appointments.map((a: { ticketNumber: string }) => a.ticketNumber);
    expect(tickets).toContain(FLU_TICKET);
    // Bob's identity must NOT have leaked in
    expect(res.body.appointments.every((a: { ticketNumber: string }) =>
      [FLU_TICKET, FLU_TICKET_2].includes(a.ticketNumber)
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Insurance Help list endpoint — GET /api/external/insurance-help
// ---------------------------------------------------------------------------

describe("GET /api/external/insurance-help — list endpoint ownership", () => {
  let app: Application;

  beforeAll(() => {
    app = buildApp(buildMockStorage());
  });

  it("returns 400 when neither concordiaCareUserId nor email is provided", async () => {
    const res = await authedGet(app, "/api/external/insurance-help");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when API key is missing", async () => {
    const res = await request(app).get("/api/external/insurance-help");
    expect(res.status).toBe(401);
  });

  it("happy path: owner retrieves their requests via concordiaCareUserId (deduped)", async () => {
    // Alice has two insurance requests — both matched via concordiaCareUserId.
    const res = await authedGet(
      app,
      `/api/external/insurance-help?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tickets = res.body.requests.map((r: { ticketNumber: string }) => r.ticketNumber);
    expect(tickets).toContain(INS_TICKET);
    expect(tickets).toContain(INS_TICKET_2);
  });

  it("happy path: owner retrieves their requests via email", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help?email=${encodeURIComponent(ALICE_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tickets = res.body.requests.map((r: { ticketNumber: string }) => r.ticketNumber);
    expect(tickets).toContain(INS_TICKET);
  });

  it("isolation: different patient receives only their own (empty) list — not Alice's requests", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help?concordiaCareUserId=${BOB_CCU_ID}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requests).toHaveLength(0);
  });

  it("isolation: different patient's email receives only their own (empty) list", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help?email=${encodeURIComponent(BOB_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requests).toHaveLength(0);
  });

  it("unknown concordiaCareUserId with no fallback email returns empty list (not an error)", async () => {
    const res = await authedGet(
      app,
      "/api/external/insurance-help?concordiaCareUserId=ccu-does-not-exist"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requests).toHaveLength(0);
  });

  it("unknown email returns empty list (not an error)", async () => {
    const res = await authedGet(
      app,
      "/api/external/insurance-help?email=nobody%40example.com"
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.requests).toHaveLength(0);
  });

  it("adminNotes included in list response when present", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    const resolved = res.body.requests.find((r: { ticketNumber: string }) => r.ticketNumber === INS_TICKET_2);
    expect(resolved).toBeDefined();
    expect(resolved.adminNotes).toBe("All set.");
  });

  it("adminNotes omitted from list response when null", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    const pending = res.body.requests.find((r: { ticketNumber: string }) => r.ticketNumber === INS_TICKET);
    expect(pending).toBeDefined();
    expect(pending.adminNotes).toBeUndefined();
  });

  it("response shape includes required fields for each request", async () => {
    const res = await authedGet(
      app,
      `/api/external/insurance-help?concordiaCareUserId=${ALICE_CCU_ID}`
    );
    expect(res.status).toBe(200);
    for (const req of res.body.requests) {
      expect(req).toHaveProperty("ticketNumber");
      expect(req).toHaveProperty("status");
    }
  });

  it("precedence: concordiaCareUserId takes priority over a mismatched email", async () => {
    // Alice's concordiaCareUserId + Bob's email: Alice's identity must win,
    // so the response must include Alice's requests.
    const res = await authedGet(
      app,
      `/api/external/insurance-help?concordiaCareUserId=${ALICE_CCU_ID}&email=${encodeURIComponent(BOB_EMAIL)}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tickets = res.body.requests.map((r: { ticketNumber: string }) => r.ticketNumber);
    expect(tickets).toContain(INS_TICKET);
    // Bob's identity must NOT have leaked in
    expect(res.body.requests.every((r: { ticketNumber: string }) =>
      [INS_TICKET, INS_TICKET_2].includes(r.ticketNumber)
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: resolvePatientIdentity — production function from patientIdentity.ts
// ---------------------------------------------------------------------------

describe("resolvePatientIdentity (production function) — core merge logic", () => {
  const storage = buildMockStorage();

  it("concordiaCareUserId → resolves to registered user's id and email", async () => {
    const result = await resolvePatientIdentity(ALICE_CCU_ID, undefined, storage);
    expect(result.patientUserId).toBe(ALICE_USER_ID);
    expect(result.patientEmail).toBe(ALICE_EMAIL);
  });

  it("unknown concordiaCareUserId with no raw email → both null", async () => {
    const result = await resolvePatientIdentity("ccu-nobody", undefined, storage);
    expect(result.patientUserId).toBeNull();
    expect(result.patientEmail).toBeNull();
  });

  it("unknown concordiaCareUserId falls back to raw email user lookup", async () => {
    const result = await resolvePatientIdentity("ccu-nobody", ALICE_EMAIL, storage);
    expect(result.patientUserId).toBe(ALICE_USER_ID);
    expect(result.patientEmail).toBe(ALICE_EMAIL);
  });

  it("no concordiaCareUserId, raw email resolves registered user", async () => {
    const result = await resolvePatientIdentity(undefined, ALICE_EMAIL, storage);
    expect(result.patientUserId).toBe(ALICE_USER_ID);
    expect(result.patientEmail).toBe(ALICE_EMAIL);
  });

  it("no concordiaCareUserId, unknown email → userId null, patientEmail set to raw email", async () => {
    const result = await resolvePatientIdentity(undefined, "stranger@example.com", storage);
    expect(result.patientUserId).toBeNull();
    expect(result.patientEmail).toBe("stranger@example.com");
  });

  it("email is lowercased and trimmed before matching", async () => {
    const result = await resolvePatientIdentity(undefined, "  ALICE@EXAMPLE.COM  ", storage);
    expect(result.patientUserId).toBe(ALICE_USER_ID);
    expect(result.patientEmail).toBe(ALICE_EMAIL);
  });

  it("concordiaCareUserId takes priority over raw email when both are provided", async () => {
    const result = await resolvePatientIdentity(ALICE_CCU_ID, BOB_EMAIL, storage);
    expect(result.patientUserId).toBe(ALICE_USER_ID);
    expect(result.patientEmail).toBe(ALICE_EMAIL);
  });
});

// ---------------------------------------------------------------------------
// Tests: isFluShotTicketOwned — production function from patientIdentity.ts
// ---------------------------------------------------------------------------

describe("isFluShotTicketOwned (production function)", () => {
  const aliceIdentity: ResolvedIdentity = { patientUserId: ALICE_USER_ID, patientEmail: ALICE_EMAIL };
  const bobIdentity: ResolvedIdentity = { patientUserId: BOB_USER_ID, patientEmail: BOB_EMAIL };

  it("returns false for a missing ticket (undefined)", () => {
    expect(isFluShotTicketOwned(undefined, aliceIdentity)).toBe(false);
  });

  it("returns false for a missing ticket (null)", () => {
    expect(isFluShotTicketOwned(null, aliceIdentity)).toBe(false);
  });

  it("email-only ticket owned by user with matching email", () => {
    const ticket = { userId: null, email: ALICE_EMAIL };
    expect(isFluShotTicketOwned(ticket, aliceIdentity)).toBe(true);
  });

  it("email-only ticket not owned by a different user", () => {
    const ticket = { userId: null, email: ALICE_EMAIL };
    expect(isFluShotTicketOwned(ticket, bobIdentity)).toBe(false);
  });

  it("userId ticket owned by matching userId", () => {
    const ticket = { userId: ALICE_USER_ID, email: null };
    expect(isFluShotTicketOwned(ticket, aliceIdentity)).toBe(true);
  });

  it("userId ticket not owned by different userId", () => {
    const ticket = { userId: ALICE_USER_ID, email: null };
    expect(isFluShotTicketOwned(ticket, bobIdentity)).toBe(false);
  });

  it("email comparison is case-insensitive on the ticket side", () => {
    const ticket = { userId: null, email: "ALICE@EXAMPLE.COM" };
    expect(isFluShotTicketOwned(ticket, aliceIdentity)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: isInsuranceTicketOwned — production function from patientIdentity.ts
// ---------------------------------------------------------------------------

describe("isInsuranceTicketOwned (production function)", () => {
  const aliceIdentity: ResolvedIdentity = { patientUserId: ALICE_USER_ID, patientEmail: ALICE_EMAIL };
  const bobIdentity: ResolvedIdentity = { patientUserId: BOB_USER_ID, patientEmail: BOB_EMAIL };

  it("returns false for a missing request (undefined)", () => {
    expect(isInsuranceTicketOwned(undefined, aliceIdentity)).toBe(false);
  });

  it("returns false for a missing request (null)", () => {
    expect(isInsuranceTicketOwned(null, aliceIdentity)).toBe(false);
  });

  it("email-only request owned by user with matching email", () => {
    const req = { userId: null, email: ALICE_EMAIL };
    expect(isInsuranceTicketOwned(req, aliceIdentity)).toBe(true);
  });

  it("email-only request not owned by a different user", () => {
    const req = { userId: null, email: ALICE_EMAIL };
    expect(isInsuranceTicketOwned(req, bobIdentity)).toBe(false);
  });

  it("userId request owned by matching userId", () => {
    const req = { userId: ALICE_USER_ID, email: null };
    expect(isInsuranceTicketOwned(req, aliceIdentity)).toBe(true);
  });

  it("email comparison is case-insensitive on the ticket side", () => {
    const req = { userId: null, email: "ALICE@EXAMPLE.COM" };
    expect(isInsuranceTicketOwned(req, aliceIdentity)).toBe(true);
  });
});
