interface SendEmailParams {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  /** Caller will emit its own sanitized operational failure event. */
  suppressFailureLogging?: boolean;
  idempotencyKey?: string;
}

interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
  /** A definitive provider rejection, safe to retry manually after correction. */
  retrySafe?: boolean;
}

const DEFAULT_FROM = "ConcordiaCare <onboarding@resend.dev>";

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set; skipping email send");
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  const to = Array.isArray(params.to) ? params.to : [params.to];
  const recipients = to.map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, skipped: true, error: "No recipients provided" };
  }

  const cc = params.cc
    ? (Array.isArray(params.cc) ? params.cc : [params.cc]).map((s) => s.trim()).filter(Boolean)
    : undefined;

  const body: Record<string, unknown> = {
    from: params.from || process.env.EMAIL_FROM || DEFAULT_FROM,
    to: recipients,
    subject: params.subject,
    html: params.html,
  };
  if (params.text) body.text = params.text;
  if (cc && cc.length > 0) body.cc = cc;
  if (params.replyTo) body.reply_to = params.replyTo;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (!params.suppressFailureLogging) {
        console.error(`[email] Resend send failed (${res.status}): ${errText}`);
      }
      return { ok: false, error: `Resend ${res.status}: ${errText}`, retrySafe: res.status >= 400 && res.status < 500 };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!params.suppressFailureLogging) {
      console.error("[email] Resend send threw:", message);
    }
    return { ok: false, error: message };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
