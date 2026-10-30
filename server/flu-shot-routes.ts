import type { Express, RequestHandler } from "express";
import { z } from "zod";
import type { IStorage } from "./storage";
import type { notifyFluShotAppointment } from "./flu-shot-notifications";

export const fluShotBookingSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.preprocess(value => value === "" ? undefined : value, z.string().trim().email().optional()),
  phoneNumber: z.string().trim().default("").refine(value => !value || /^\d{10}$|^1\d{10}$/.test(value.replace(/\D/g, "")), "Enter a valid phone number"),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  scheduledDate: z.string().refine(value => !Number.isNaN(new Date(value).getTime()), "Invalid appointment date"),
  scheduledTime: z.string().trim().min(1),
  fluShotType: z.string().trim().min(1),
  notes: z.string().optional(),
  isExistingPatient: z.boolean(),
}).refine(value => !!(value.email || value.phoneNumber), "Enter an email address or phone number for appointment updates");

export function registerFluShotAppointmentRoutes(deps: {
  app: Express;
  storage: Pick<IStorage, "createFluShotAppointment" | "createNotification" | "updateFluShotAppointmentStatus">;
  resolveUser: RequestHandler;
  isAuthenticated: RequestHandler;
  isAdmin: RequestHandler;
  generateTicketNumber: (prefix: string) => string;
  notify: typeof notifyFluShotAppointment;
}) {
  const { app, storage } = deps;
  app.post("/api/flu-shot-appointments", deps.resolveUser, async (req: any, res) => {
    const parsed = fluShotBookingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
    try {
      const userId = req.localUser?.role === "patient" ? req.localUser.id : null;
      const appointment = await storage.createFluShotAppointment({
        ...parsed.data, userId,
        ticketNumber: deps.generateTicketNumber("FLU"),
        email: parsed.data.email || null,
        scheduledDate: new Date(parsed.data.scheduledDate),
        status: "scheduled",
      });
      if (userId) {
        try {
          await storage.createNotification({
            userId, type: "system", channel: "in_app",
            title: "Flu Shot Appointment Confirmed",
            message: `Your appointment is confirmed. Ticket: ${appointment.ticketNumber}.`,
            entityId: appointment.id.toString(),
          });
        } catch {
          console.warn(`[FluShotNotification] appointment=${appointment.id} in-app notice failed`);
        }
      }
      const notificationDelivery = await deps.notify(appointment);
      return res.status(201).json({ ...appointment, notificationDelivery });
    } catch {
      console.error("[FluShot] Appointment creation failed");
      return res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  app.patch("/api/admin/flu-shot-appointments/:id/status", deps.isAuthenticated, deps.isAdmin, async (req, res) => {
    const parsed = z.object({
      id: z.coerce.number().int().positive(),
      status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
    }).safeParse({ id: req.params.id, status: req.body.status });
    if (!parsed.success) return res.status(400).json({ message: "Invalid appointment ID or status" });
    try {
      const appointment = await storage.updateFluShotAppointmentStatus(parsed.data.id, parsed.data.status);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      const notificationDelivery = await deps.notify(appointment);
      return res.json({ ...appointment, notificationDelivery });
    } catch {
      console.error("[FluShot] Appointment status update failed");
      return res.status(500).json({ message: "Failed to update appointment status" });
    }
  });
}
