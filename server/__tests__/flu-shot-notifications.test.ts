import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { FluShotAppointment } from "@shared/schema";
import { appointmentDeliverySummary } from "@shared/flu-shot-notifications";

// No database, provider request, patient record, or external message in these tests.
vi.mock("../request-idempotency", () => ({
  claimRequest: vi.fn(), completeRequest: vi.fn(), releaseUncompletedRequest: vi.fn(),
}));
import { buildAppointmentMessage, createAppointmentNotifier } from "../flu-shot-notifications";
import { registerFluShotAppointmentRoutes, fluShotBookingSchema } from "../flu-shot-routes";

const appointment = (overrides: Partial<FluShotAppointment> = {}): FluShotAppointment => ({
  id: 71, ticketNumber: "FLU-NOTIFICATION-TEST", firstName: "Test", lastName: "Only",
  email: "flu-audit@example.com", phoneNumber: "2025550100",
  scheduledDate: new Date("2026-11-06T15:00:00.000Z"), scheduledTime: "10:00 AM",
  status: "scheduled", fluShotType: "Standard Flu Vaccine", userId: null,
  dateOfBirth: "sensitive-dob", insurancePolicyNumber: "sensitive-policy",
  ...overrides,
} as FluShotAppointment);

function fakeNotifier() {
  const ledger = new Map<string, { statusCode?: number; body?: unknown }>();
  const deps = {
    sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "test-email-id" }),
    sendSms: vi.fn().mockResolvedValue({ ok: true, ids: ["test-sms-id"] }),
    claimRequest: vi.fn(async (scope: string, key: string | undefined) => {
      const id = `${scope}:${key}`;
      const saved = ledger.get(id);
      if (saved) return { kind: "duplicate" as const, statusCode: saved.statusCode ?? 409, body: saved.body, correlationId: "test" };
      ledger.set(id, {});
      return { kind: "claimed" as const, correlationId: "test" };
    }),
    completeRequest: vi.fn(async (scope: string, key: string | undefined, statusCode: number, body: unknown) => {
      ledger.set(`${scope}:${key}`, { statusCode, body });
    }),
    releaseUncompletedRequest: vi.fn(async (scope: string, key: string | undefined) => {
      const id = `${scope}:${key}`;
      if (!ledger.get(id)?.statusCode) ledger.delete(id);
    }),
    reviewUrl: () => "https://example.com/contact",
  };
  return { ...deps, notify: createAppointmentNotifier(deps), ledger };
}

const booking = {
  firstName: "Test", lastName: "Only", email: "flu-audit@example.com", phoneNumber: "2025550100",
  scheduledDate: "2026-11-06T15:00:00.000Z", scheduledTime: "10:00 AM",
  fluShotType: "Standard Flu Vaccine", isExistingPatient: false,
};

function setupRoutes() {
  const app = express();
  app.use(express.json());
  const fake = fakeNotifier();
  let record = appointment();
  const storage = {
    createFluShotAppointment: vi.fn(async (data) => { record = { ...record, ...data }; return record; }),
    createNotification: vi.fn().mockResolvedValue({}),
    updateFluShotAppointmentStatus: vi.fn(async (id, status) => {
      if (id !== record.id) return undefined;
      record = { ...record, status };
      return record;
    }),
  };
  const auth: express.RequestHandler = (req, res, next) =>
    req.header("X-Test-Admin") === "yes" ? next() : void res.status(401).json({ message: "Denied" });
  registerFluShotAppointmentRoutes({
    app, storage: storage as any,
    resolveUser: (_req, _res, next) => next(), isAuthenticated: auth, isAdmin: auth,
    generateTicketNumber: () => "FLU-NOTIFICATION-TEST", notify: fake.notify,
  });
  return { app, fake, storage };
}

describe("flu-shot notification delivery", () => {
  it("sends guest confirmation to both supplied contacts without sensitive demographics", async () => {
    const f = fakeNotifier();
    expect(await f.notify(appointment())).toEqual({ email: "accepted", sms: "accepted", reviewIncluded: false });
    const mail = f.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("flu-audit@example.com");
    expect(mail.text).toContain("FLU-NOTIFICATION-TEST");
    expect(mail.text).toContain("Friday, November 6, 2026");
    expect(mail.text).not.toContain("sensitive-dob");
    expect(mail.text).not.toContain("sensitive-policy");
    expect(mail.idempotencyKey).toBe("flu-shot-71:scheduled-email");
  });

  it("sends only email when phone is absent", async () => {
    const f = fakeNotifier();
    expect((await f.notify(appointment({ phoneNumber: "" }))).sms).toBe("not_provided");
    expect(f.sendSms).not.toHaveBeenCalled();
  });

  it("sends only SMS when email is absent", async () => {
    const f = fakeNotifier();
    expect((await f.notify(appointment({ email: null }))).email).toBe("not_provided");
    expect(f.sendEmail).not.toHaveBeenCalled();
    expect(f.sendSms).toHaveBeenCalledOnce();
  });

  it("includes completion and an honest feedback invitation only for completed appointments", () => {
    const completed = buildAppointmentMessage(appointment({ status: "completed" }), "https://example.com/contact");
    expect(completed.text).toContain("marked completed");
    expect(completed.text).toContain("honest feedback");
    expect(completed.html).toContain('href="https://example.com/contact"');
    expect(completed.reviewIncluded).toBe(true);
    for (const status of ["scheduled", "cancelled", "no_show"] as const) {
      expect(buildAppointmentMessage(appointment({ status }), "https://example.com/contact").reviewIncluded).toBe(false);
    }
  });

  it("rejects unsafe feedback links and escapes HTML input", () => {
    const message = buildAppointmentMessage(appointment({ status: "completed", ticketNumber: "<script>" }), "javascript:alert(1)");
    expect(message.reviewIncluded).toBe(false);
    expect(message.html).not.toContain("javascript:");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("does not duplicate messages or reviews on repeated/concurrent status saves", async () => {
    const f = fakeNotifier();
    const a = appointment({ status: "completed" });
    await Promise.all([f.notify(a), f.notify(a), f.notify(a)]);
    expect(f.sendEmail).toHaveBeenCalledOnce();
    expect(f.sendSms).toHaveBeenCalledOnce();
    expect(await f.notify(a)).toMatchObject({ email: "already_sent", sms: "already_sent" });
  });

  it("allows a confirmation and then a separate completion message", async () => {
    const f = fakeNotifier();
    await f.notify(appointment());
    await f.notify(appointment({ status: "completed" }));
    expect(f.sendEmail).toHaveBeenCalledTimes(2);
    expect(f.sendSms).toHaveBeenCalledTimes(2);
  });

  it("keeps missing configuration visible and permits a later manual retry", async () => {
    const f = fakeNotifier();
    f.sendSms.mockResolvedValueOnce({ ok: false, skipped: true });
    expect((await f.notify(appointment())).sms).toBe("not_configured");
    expect(await f.notify(appointment())).toMatchObject({ email: "already_sent", sms: "accepted" });
    expect(f.sendEmail).toHaveBeenCalledOnce();
    expect(f.sendSms).toHaveBeenCalledTimes(2);
  });

  it("permits manual retry of a definitive rejection, not an uncertain send", async () => {
    const f = fakeNotifier();
    f.sendEmail.mockResolvedValueOnce({ ok: false, retrySafe: true });
    expect((await f.notify(appointment())).email).toBe("failed");
    expect((await f.notify(appointment())).email).toBe("accepted");
    const other = fakeNotifier();
    other.sendSms.mockRejectedValueOnce(new Error("network uncertain"));
    expect((await other.notify(appointment())).sms).toBe("failed");
    expect((await other.notify(appointment())).sms).toBe("in_progress");
    expect(other.sendSms).toHaveBeenCalledOnce();
  });

  it("does not label provider acceptance as handset or inbox delivery", () => {
    const text = appointmentDeliverySummary({ email: "accepted", sms: "failed", reviewIncluded: false });
    expect(text).toContain("accepted by the messaging provider");
    expect(text).toContain("could not be sent");
    expect(text).not.toContain("delivered");
  });
});

describe("real flu-shot HTTP handlers with mock messaging providers", () => {
  it("books a guest and invokes real notification service without trusting browser userId", async () => {
    const { app, fake, storage } = setupRoutes();
    const res = await request(app).post("/api/flu-shot-appointments").send({ ...booking, userId: "another-patient" });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBeNull();
    expect(res.body.notificationDelivery.email).toBe("accepted");
    expect(storage.createNotification).not.toHaveBeenCalled();
    expect(fake.sendEmail).toHaveBeenCalledOnce();
    expect(fake.sendSms).toHaveBeenCalledOnce();
  });

  it.each([
    { email: "flu-audit@example.com", phoneNumber: "" },
    { email: "", phoneNumber: "2025550100" },
  ])("accepts a booking with just one valid contact: %j", async (contacts) => {
    const { app } = setupRoutes();
    expect((await request(app).post("/api/flu-shot-appointments").send({ ...booking, ...contacts })).status).toBe(201);
  });

  it("rejects missing contact, invalid contact, and invalid dates before creating a record", async () => {
    const { app, storage } = setupRoutes();
    for (const fields of [
      { email: "", phoneNumber: "" }, { phoneNumber: "123" },
      { email: "not-an-email" }, { scheduledDate: "invalid" },
    ]) expect((await request(app).post("/api/flu-shot-appointments").send({ ...booking, ...fields })).status).toBe(400);
    expect(storage.createFluShotAppointment).not.toHaveBeenCalled();
  });

  it("completes from the admin endpoint and requests feedback exactly once", async () => {
    const { app, fake } = setupRoutes();
    const first = await request(app).patch("/api/admin/flu-shot-appointments/71/status").set("X-Test-Admin", "yes").send({ status: "completed" });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("completed");
    expect(first.body.notificationDelivery.reviewIncluded).toBe(true);
    const second = await request(app).patch("/api/admin/flu-shot-appointments/71/status").set("X-Test-Admin", "yes").send({ status: "completed" });
    expect(second.body.notificationDelivery.email).toBe("already_sent");
    expect(fake.sendEmail).toHaveBeenCalledOnce();
    expect(fake.sendSms).toHaveBeenCalledOnce();
  });

  it("persists a booking/status update while reporting provider failure", async () => {
    const { app, fake, storage } = setupRoutes();
    fake.sendEmail.mockResolvedValue({ ok: false, retrySafe: true });
    fake.sendSms.mockResolvedValue({ ok: false, skipped: true });
    const bookingRes = await request(app).post("/api/flu-shot-appointments").send(booking);
    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.notificationDelivery).toMatchObject({ email: "failed", sms: "not_configured" });
    const updated = await request(app).patch("/api/admin/flu-shot-appointments/71/status").set("X-Test-Admin", "yes").send({ status: "completed" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("completed");
    expect(updated.body.notificationDelivery.email).toBe("failed");
    expect(storage.updateFluShotAppointmentStatus).toHaveBeenCalledOnce();
  });

  it("rejects unauthorized, invalid, and nonexistent admin updates without messaging", async () => {
    const { app, fake } = setupRoutes();
    expect((await request(app).patch("/api/admin/flu-shot-appointments/71/status").send({ status: "completed" })).status).toBe(401);
    for (const path of ["abc", "0", "71x"]) expect((await request(app).patch(`/api/admin/flu-shot-appointments/${path}/status`).set("X-Test-Admin", "yes").send({ status: "completed" })).status).toBe(400);
    expect((await request(app).patch("/api/admin/flu-shot-appointments/71/status").set("X-Test-Admin", "yes").send({ status: "confirmed" })).status).toBe(400);
    expect((await request(app).patch("/api/admin/flu-shot-appointments/999/status").set("X-Test-Admin", "yes").send({ status: "completed" })).status).toBe(404);
    expect(fake.sendEmail).not.toHaveBeenCalled();
  });

  it("allows a missing phone only with a valid email", () => {
    expect(fluShotBookingSchema.safeParse({ ...booking, phoneNumber: undefined }).success).toBe(true);
  });
});
