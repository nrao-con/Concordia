import type { FluShotAppointment } from "@shared/schema";
import type { AppointmentDeliveryState, AppointmentNotificationDelivery } from "@shared/flu-shot-notifications";
import { sendEmail, escapeHtml } from "./email";
import { sendSms } from "./sms";
import { claimRequest, completeRequest, releaseUncompletedRequest } from "./request-idempotency";

type AppointmentStatus = FluShotAppointment["status"];
type Dependencies = {
  sendEmail: typeof sendEmail;
  sendSms: typeof sendSms;
  claimRequest: typeof claimRequest;
  completeRequest: typeof completeRequest;
  releaseUncompletedRequest: typeof releaseUncompletedRequest;
  reviewUrl: () => string | undefined;
};

export function buildAppointmentMessage(appointment: FluShotAppointment, reviewUrl?: string) {
  let validReviewUrl: string | undefined;
  try {
    if (reviewUrl && new URL(reviewUrl).protocol === "https:") validReviewUrl = reviewUrl;
  } catch { /* No unverified or malformed review links in patient messages. */ }
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date(appointment.scheduledDate));
  const status: AppointmentStatus = appointment.status;
  const intro: Record<AppointmentStatus, string> = {
    scheduled: "Your flu shot appointment is confirmed.",
    completed: "Your flu shot appointment has been marked completed. Thank you for visiting Concordia Pharmacy.",
    cancelled: "Your flu shot appointment has been cancelled.",
    no_show: "Our records show that your flu shot appointment was missed. Please call us if this is incorrect or you would like to reschedule.",
  };
  const lines = [
    "Concordia Pharmacy", intro[status],
    `Ticket: ${appointment.ticketNumber}`,
    `Date: ${date}`, `Time: ${appointment.scheduledTime} (New York time)`,
  ];
  if (status === "scheduled") lines.push("Location: 898 East Tremont Ave, Bronx, NY 10460", "Please bring your ticket number and insurance card, if applicable.");
  if (status === "completed") {
    lines.push("How was your visit? We welcome your honest feedback.");
    if (validReviewUrl) lines.push(`Share feedback: ${validReviewUrl}`);
  }
  lines.push("Questions? Call (718) 328-2833.");
  const text = lines.join("\n");
  const subjects: Record<AppointmentStatus, string> = {
    scheduled: "Your appointment confirmation",
    completed: "Your appointment is complete - share your feedback",
    cancelled: "Your appointment was cancelled",
    no_show: "An update about your appointment",
  };
  return {
    subject: `Concordia Pharmacy: ${subjects[status]}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${lines.map(line => `<p>${escapeHtml(line)}</p>`).join("")}${status === "completed" && validReviewUrl ? `<p><a href="${escapeHtml(validReviewUrl)}">Share feedback about your visit</a></p>` : ""}</div>`,
    reviewIncluded: status === "completed" && !!validReviewUrl,
  };
}

export function createAppointmentNotifier(deps: Dependencies) {
  return async (appointment: FluShotAppointment): Promise<AppointmentNotificationDelivery> => {
    const message = buildAppointmentMessage(appointment, deps.reviewUrl());
    const sendChannel = async (channel: "email" | "sms"): Promise<AppointmentDeliveryState> => {
      const recipient = channel === "email" ? appointment.email?.trim() : appointment.phoneNumber?.trim();
      if (!recipient) return "not_provided";
      // Each appointment/status/channel is submitted at most once. Repeated
      // admin saves and concurrent requests must not send duplicate reviews.
      const scope = `flu-shot-message:${channel}`;
      const key = `${appointment.id}:${appointment.status}`;
      let claimed = false;
      try {
        const claim = await deps.claimRequest(scope, key, { appointmentId: appointment.id, status: appointment.status });
        if (!claim || claim.kind === "mismatch") return "failed";
        if (claim.kind === "duplicate") {
          if (claim.statusCode === 202) return "already_sent";
          return claim.statusCode === 409 ? "in_progress" : "failed";
        }
        claimed = true;
        const result = channel === "email"
          ? await deps.sendEmail({
            to: recipient, subject: message.subject, text: message.text, html: message.html,
            suppressFailureLogging: true, idempotencyKey: `flu-shot-${key}-email`,
          })
          : await deps.sendSms({ to: recipient, body: message.text, suppressFailureLogging: true });
        if (result.skipped) {
          await deps.releaseUncompletedRequest(scope, key);
          console.warn(`[FluShotNotification] appointment=${appointment.id} status=${appointment.status} channel=${channel} not configured`);
          return "not_configured";
        }
        if (!result.ok && result.retrySafe) {
          // A known 4xx did not accept a message. Staff can save the current
          // status again after correcting the provider configuration.
          await deps.releaseUncompletedRequest(scope, key);
          console.warn(`[FluShotNotification] appointment=${appointment.id} status=${appointment.status} channel=${channel} provider rejected; correct configuration and retry manually`);
          return "failed";
        }
        const state = result.ok ? "accepted" : "failed";
        // Provider acceptance is not proof of inbox/handset delivery.
        await deps.completeRequest(scope, key, result.ok ? 202 : 502, { state });
        if (!result.ok) console.warn(`[FluShotNotification] appointment=${appointment.id} status=${appointment.status} channel=${channel} send failed; staff review required`);
        return state;
      } catch {
        // A timeout or crash may follow a successful send. Do not release
        // this claim or automatically replay an uncertain SMS.
        console.warn(`[FluShotNotification] appointment=${appointment.id} channel=${channel} ${claimed ? "send uncertain" : "claim unavailable"}; staff review required`);
        return "failed";
      }
    };
    const [email, sms] = await Promise.all([sendChannel("email"), sendChannel("sms")]);
    return { email, sms, reviewIncluded: message.reviewIncluded };
  };
}

export const notifyFluShotAppointment = createAppointmentNotifier({
  sendEmail, sendSms, claimRequest, completeRequest, releaseUncompletedRequest,
  reviewUrl: () => process.env.FLU_SHOT_REVIEW_URL,
});
