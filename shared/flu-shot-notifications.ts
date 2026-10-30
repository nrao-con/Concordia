export type AppointmentDeliveryState =
  | "accepted"
  | "already_sent"
  | "not_provided"
  | "not_configured"
  | "failed"
  | "in_progress";

export interface AppointmentNotificationDelivery {
  email: AppointmentDeliveryState;
  sms: AppointmentDeliveryState;
  reviewIncluded: boolean;
}

export function appointmentDeliverySummary(delivery?: AppointmentNotificationDelivery): string {
  if (!delivery) return "Keep your ticket number for your appointment.";
  const messages: string[] = [];
  for (const channel of ["email", "sms"] as const) {
    const label = channel === "email" ? "Email" : "Text message";
    const state = delivery[channel];
    if (state === "not_provided") continue;
    if (state === "accepted") messages.push(`${label} accepted by the messaging provider.`);
    else if (state === "already_sent") messages.push(`${label} was already submitted.`);
    else if (state === "in_progress") messages.push(`${label} is being processed; delivery is not yet confirmed.`);
    else messages.push(`${label} could not be sent. Please save your ticket and contact the pharmacy if needed.`);
  }
  return messages.join(" ") || "No message was sent. Keep your ticket number.";
}
