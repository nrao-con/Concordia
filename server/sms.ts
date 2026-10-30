interface SendSmsParams {
  to: string | string[];
  body: string;
  from?: string;
  suppressFailureLogging?: boolean;
}

interface SendSmsResult {
  ok: boolean;
  ids?: string[];
  error?: string;
  skipped?: boolean;
  retrySafe?: boolean;
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber =
    params.from || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    console.warn("[sms] TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set; skipping SMS send");
    return { ok: false, skipped: true, error: "Twilio credentials not configured" };
  }
  if (!fromNumber) {
    console.warn("[sms] TWILIO_FROM_NUMBER not set; skipping SMS send");
    return { ok: false, skipped: true, error: "TWILIO_FROM_NUMBER not configured" };
  }

  const rawRecipients = (Array.isArray(params.to) ? params.to : [params.to])
    .map((s) => s.trim())
    .filter(Boolean);
  if (rawRecipients.length === 0) {
    return { ok: false, skipped: true, error: "No recipients provided" };
  }

  const recipients: string[] = [];
  const errors: string[] = [];
  for (const raw of rawRecipients) {
    const normalized = normalizePhone(raw);
    if (normalized) {
      recipients.push(normalized);
    } else {
      errors.push(`${raw}: invalid phone`);
    }
  }
  if (recipients.length === 0) {
    return { ok: false, error: errors.join("; ") || "Invalid recipient phone(s)" };
  }

  // Twilio caps individual SMS body length around 1600 chars; trim defensively.
  const body = params.body.length > 1500 ? params.body.slice(0, 1497) + "..." : params.body;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const ids: string[] = [];
  let retrySafe = true;

  for (const to of recipients) {
    const form = new URLSearchParams();
    form.set("To", to);
    form.set("From", fromNumber);
    form.set("Body", body);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: auth,
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        if (res.status >= 500) retrySafe = false;
        const errText = await res.text().catch(() => "");
        if (!params.suppressFailureLogging) console.error(`[sms] Twilio send to ${to} failed (${res.status}): ${errText}`);
        errors.push(`${to}: ${res.status}`);
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as { sid?: string };
      if (data.sid) ids.push(data.sid);
      else retrySafe = false;
    } catch (error) {
      retrySafe = false;
      const message = error instanceof Error ? error.message : String(error);
      if (!params.suppressFailureLogging) console.error(`[sms] Twilio send to ${to} threw:`, message);
      errors.push(`${to}: ${message}`);
    }
  }

  if (ids.length === 0) {
    return { ok: false, error: errors.join("; ") || "All sends failed", retrySafe };
  }
  if (errors.length > 0) {
    return { ok: true, ids, error: `Partial failure: ${errors.join("; ")}` };
  }
  return { ok: true, ids };
}
