import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { pool } from "./db";
import { sendEmail } from "./email";
import { recordFraudSignal } from "./fraud-alert-service";

const EXPIRY_MS = 10 * 60 * 1000;
const COOLDOWN_SECONDS = 60;
const IP_WINDOW_SECONDS = 10 * 60;
const IP_MAX_CHALLENGES = 20;
const IP_MAX_DISTINCT_IDENTITIES = 5;
export const GENERIC_REQUEST = "If eligible, a verification code has been sent.";
export const GENERIC_VERIFY = "Invalid or expired verification code.";

type DirectoryUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  date_of_birth: Date | null;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required");
  return "concordia-session-secret-dev-only";
}

export function chatIdentityHmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function normalizeChatIdentity(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
    : "";
}

export function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Testable constant-time comparison of a submitted code against its HMAC. */
export function codeMatchesHash(code: string, storedHash: string): boolean {
  const computed = Buffer.from(chatIdentityHmac(code), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function requestIp(req: Request): string {
  // trust proxy is configured by the application; this value is only HMACed.
  return req.ip || req.socket.remoteAddress || "";
}

function genericChallengeId(): string {
  return randomUUID();
}

async function recordCooldown(keyHash: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO chat_identity_rate_limits (key_hash, last_requested_at)
     VALUES ($1, NOW())
     ON CONFLICT (key_hash) DO UPDATE SET last_requested_at = NOW()
       WHERE chat_identity_rate_limits.last_requested_at < NOW() - ($2 * INTERVAL '1 second')
     RETURNING key_hash`,
    [keyHash, COOLDOWN_SECONDS],
  );
  return result.rowCount === 1;
}

async function ipUnderChallengeLimit(ipHash: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM chat_identity_challenges
     WHERE ip_hash = $1 AND created_at >= NOW() - ($2 * INTERVAL '1 second')`,
    [ipHash, IP_WINDOW_SECONDS],
  );
  return Number(result.rows[0]?.count ?? 0) < IP_MAX_CHALLENGES;
}

async function ipUnderIdentitySwitchLimit(ipHash: string, identifierHash: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT identifier_hash)::text AS count
     FROM chat_identity_challenges
     WHERE ip_hash = $1
       AND identifier_hash <> $2
       AND created_at >= NOW() - ($3 * INTERVAL '1 second')`,
    [ipHash, identifierHash, IP_WINDOW_SECONDS],
  );
  return Number(result.rows[0]?.count ?? 0) < IP_MAX_DISTINCT_IDENTITIES;
}

function auditEvent(event: "request" | "verify", challengeId: string, outcome: "created" | "accepted" | "rejected" | "flagged"): void {
  // The shared audit middleware records request metadata, so it is not suitable
  // for anonymous directory verification. This deliberately logs only an
  // irreversible challenge hash and coarse operational outcome.
  console.info("[chat-identity]", { event, outcome, challengeHash: chatIdentityHmac(challengeId) });
}

function sendFraudAlert(
  challengeId: string,
  signalType: string,
  severity: "medium" | "high" | "critical",
  summary: string,
  metadata: Record<string, string | number | boolean | null> = {},
): void {
  const challengeHash = chatIdentityHmac(challengeId);
  void recordFraudSignal({
    eventHash: chatIdentityHmac(`fraud\u001f${signalType}\u001f${challengeHash}`),
    signalType,
    severity,
    source: "chat_identity",
    summary,
    metadata: { challengeHash, ...metadata },
  }).catch((error) => {
    console.error("[chat-identity] failed to record fraud alert", {
      signalType,
      error: error instanceof Error ? error.message : "unknown error",
    });
  });
}

export async function requestChatIdentity(req: Request): Promise<{ accepted: true; challengeId: string; message: string }> {
  const body = req.body ?? {};
  const firstName = normalizeChatIdentity(body.firstName);
  const lastName = normalizeChatIdentity(body.lastName);
  const dob = body.dateOfBirth;
  const valid = firstName.length >= 1 && firstName.length <= 100 &&
    lastName.length >= 1 && lastName.length <= 100 &&
    isRealIsoDate(dob) &&
    (body.locale === undefined || (typeof body.locale === "string" && body.locale.length <= 20));
  const identifierHash = chatIdentityHmac(`${firstName}\u001f${lastName}\u001f${typeof dob === "string" ? dob : ""}`);
  const ipHash = chatIdentityHmac(requestIp(req));
  const challengeId = genericChallengeId();
  let patientId: string | null = null;
  let recipient: string | null = null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  // Both keys are persisted and independently cooled down. A rejected key
  // still receives a fake record and the identical public response.
  const controls = valid
    ? await Promise.all([
        recordCooldown(identifierHash),
        ipUnderChallengeLimit(ipHash),
        ipUnderIdentitySwitchLimit(ipHash, identifierHash),
      ])
    : [false, false, false];
  const permitted = controls[0] && controls[1] && controls[2];
  if (permitted) {
    const candidates = await pool.query<DirectoryUser>(
      `SELECT id, first_name, last_name, email, date_of_birth
       FROM users WHERE role = 'patient' AND patient_status = 'active'
       AND date_of_birth::date = $1::date`,
      [dob],
    );
    const matches = candidates.rows.filter((user) =>
      user.date_of_birth &&
      normalizeChatIdentity(user.first_name) === firstName &&
      normalizeChatIdentity(user.last_name) === lastName &&
      dateOnly(user.date_of_birth) === dob,
    );
    if (matches.length === 1 && matches[0].email) {
      patientId = matches[0].id;
      recipient = matches[0].email;
    }
  }

  await pool.query(
    `INSERT INTO chat_identity_challenges
       (id, patient_id, code_hash, identifier_hash, ip_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')`,
    [challengeId, patientId, chatIdentityHmac(code), identifierHash, ipHash],
  );
  const identitySwitchFlagged = valid && !controls[2];
  const challengeFloodFlagged = valid && !controls[1];
  auditEvent("request", challengeId, identitySwitchFlagged || challengeFloodFlagged ? "flagged" : "created");
  if (identitySwitchFlagged) {
    sendFraudAlert(
      challengeId,
      "identity_switch_velocity",
      "high",
      "A visitor attempted too many distinct patient identities within the verification window.",
      { windowMinutes: IP_WINDOW_SECONDS / 60, identityLimit: IP_MAX_DISTINCT_IDENTITIES },
    );
  }
  if (challengeFloodFlagged) {
    sendFraudAlert(
      challengeId,
      "verification_challenge_flood",
      "high",
      "A visitor exceeded the chat identity verification request limit.",
      { windowMinutes: IP_WINDOW_SECONDS / 60, challengeLimit: IP_MAX_CHALLENGES },
    );
  }

  if (recipient) {
    // Deliberately do not interpolate a name, DOB, email, or any other PHI.
    // Do not wait for the provider: response latency must not disclose whether
    // a directory match had a deliverable email address.
    void sendEmail({
        to: recipient,
        subject: "Your chat verification code",
        text: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
        html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. Do not share this code with anyone.</p>`,
        suppressFailureLogging: true,
      }).then((result) => {
        if (!result.ok) console.warn("[chat-identity] delivery failed", { challengeHash: chatIdentityHmac(challengeId) });
      }).catch(() => {
        console.warn("[chat-identity] delivery failed", { challengeHash: chatIdentityHmac(challengeId) });
      });
  }
  return { accepted: true, challengeId, message: GENERIC_REQUEST };
}

export async function verifyChatIdentity(req: Request): Promise<{ verified: boolean; firstName?: string; message?: string }> {
  const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId : "";
  const code = typeof req.body?.code === "string" && /^\d{6}$/.test(req.body.code) ? req.body.code : "";
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !code) return { verified: false, message: GENERIC_VERIFY };

  // This single statement increments attempts and only consumes a valid code.
  // PostgreSQL row locking makes concurrent verification attempts serializable.
  const result = await pool.query<{ patient_id: string | null; matched: boolean; attempts: number }>(
    `UPDATE chat_identity_challenges
       SET attempts = attempts + 1,
           consumed_at = CASE WHEN code_hash = $2 THEN NOW() ELSE consumed_at END
     WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW() AND attempts < 5
      RETURNING patient_id, (code_hash = $2) AS matched, attempts`,
    [challengeId, chatIdentityHmac(code)],
  );
  const row = result.rows[0];
  if (!row?.matched || !row.patient_id) {
    auditEvent("verify", challengeId || "invalid", "rejected");
    if (row?.attempts === 5) {
      sendFraudAlert(
        challengeId,
        "verification_attempts_exhausted",
        "medium",
        "A chat identity verification challenge reached the maximum number of failed code attempts.",
        { attemptLimit: 5 },
      );
    }
    return { verified: false, message: GENERIC_VERIFY };
  }
  const user = await pool.query<{ first_name: string | null }>(
    "SELECT first_name FROM users WHERE id = $1 AND role = 'patient' AND patient_status = 'active'",
    [row.patient_id],
  );
  const firstName = user.rows[0]?.first_name;
  if (!firstName) {
    auditEvent("verify", challengeId, "rejected");
    return { verified: false, message: GENERIC_VERIFY };
  }
  const session = req.session as any;
  session.chatVerifiedPatientId = row.patient_id;
  session.chatVerifiedUntil = Date.now() + EXPIRY_MS;
  session.chatVerificationMethod = "directory";
  await new Promise<void>((resolve, reject) => session.save((error: Error | null | undefined) => error ? reject(error) : resolve()));
  auditEvent("verify", challengeId, "accepted");
  return { verified: true, firstName };
}

export function clearChatIdentity(req: Request): Promise<void> {
  const session = req.session as any;
  delete session.chatVerifiedPatientId;
  delete session.chatVerifiedUntil;
  delete session.chatVerificationMethod;
  return new Promise((resolve, reject) => session.save((error: Error | null | undefined) => error ? reject(error) : resolve()));
}

export async function chatIdentityStatus(req: Request): Promise<{ recognized: boolean; firstName?: string; source: "clerk" | "directory" | null }> {
  const clerk = (req as any).localUser;
  if (clerk?.role === "patient" && clerk.patientStatus === "active") {
    return { recognized: true, firstName: clerk.firstName || "", source: "clerk" };
  }
  const session = req.session as any;
  if (session?.chatVerifiedPatientId && session.chatVerifiedUntil > Date.now()) {
    const user = await pool.query<{ first_name: string | null }>(
      "SELECT first_name FROM users WHERE id = $1 AND role = 'patient' AND patient_status = 'active'",
      [session.chatVerifiedPatientId],
    );
    if (user.rows[0]?.first_name) {
      return { recognized: true, firstName: user.rows[0].first_name, source: "directory" };
    }
  }
  return { recognized: false, source: null };
}