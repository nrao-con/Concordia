/**
 * PA Prescriber E-Signature routes
 *
 * Extracted from the main routes file so they can be unit-tested by importing
 * this module directly — tests get the REAL handler logic, not simplified copies.
 *
 * Call registerPaSignatureRoutes(app, deps) from routes.ts to mount these four
 * endpoints:
 *   POST /api/admin/pa-requests/:id/request-signature   (isAdmin)
 *   GET  /api/pa-sign/:token/details                    (public)
 *   POST /api/pa-sign/:token/submit                     (public)
 *   POST /api/admin/pa-requests/:id/void-signature      (isAdmin)
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { type IStorage } from "./storage";
import { embedSignatureInHtml, validateSignatureDataUrl } from "./pa-service";
import { sendEmail, escapeHtml } from "./email";

/** Minimal dependency surface — makes the module testable with simple mocks. */
export interface PaSignatureDeps {
  storage: Pick<
    IStorage,
    | "getPriorAuthRequest"
    | "getPriorAuthRequestBySignatureToken"
    | "submitSignatureAtomically"
    | "updatePriorAuthRequest"
    | "createAuditLog"
    | "getUser"
  >;
  isAdmin: RequestHandler;
  sendEmail: typeof sendEmail;
  escapeHtml: typeof escapeHtml;
}

export function registerPaSignatureRoutes(
  app: Express,
  deps: PaSignatureDeps
): void {
  const { storage, isAdmin, sendEmail: se, escapeHtml: esc } = deps;

  // ── POST /api/admin/pa-requests/:id/request-signature ─────────────────────
  // Admin sends a one-time signature link to the prescriber.
  app.post(
    "/api/admin/pa-requests/:id/request-signature",
    isAdmin,
    async (req, res) => {
      try {
        const pa = await storage.getPriorAuthRequest(req.params.id);
        if (!pa) return res.status(404).json({ message: "Not found" });

        const schema = z.object({
          prescriberEmail: z.string().email("Valid prescriber email required"),
        });
        const body = schema.parse(req.body);

        // 256-bit secure random token; store only the SHA-256 hash in the DB
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 h

        // Build signature URL from environment — dev falls back to concordianyc.com
        const domains = (process.env.REPLIT_DOMAINS || "")
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
        const baseUrl =
          process.env.CONCORDIA_CARE_APP_URL ||
          (domains.length ? `https://${domains[0]}` : "https://concordianyc.com");
        const signUrl = `${baseUrl}/pa-sign/${rawToken}`;

        const prescriberName = pa.prescriberName ?? "Physician";
        const expiryStr = expiresAt.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;color:#111;">
<div style="border-bottom:2px solid #1a5276;padding-bottom:16px;margin-bottom:24px;">
  <h1 style="font-size:18pt;margin:0 0 4px;color:#1a5276;">Prescriber Signature Required</h1>
  <p style="margin:0;font-size:10pt;color:#555;">Concordia Pharmacy — Prior Authorization</p>
</div>
<p>Dear ${esc(prescriberName)},</p>
<p>Concordia Pharmacy has prepared a prior authorization (PA) request letter for your patient for
<strong>${esc(pa.medicationName)}</strong> and requires your electronic signature before it can be
submitted to the insurance payer.</p>
<p>Please click the button below to review the letter and sign electronically.
The link is valid for 72 hours.</p>
<div style="text-align:center;margin:32px 0;">
  <a href="${signUrl}" style="background:#1a5276;color:#fff;padding:14px 32px;border-radius:6px;
     text-decoration:none;font-size:12pt;font-weight:bold;display:inline-block;">
    Review &amp; Sign PA Letter
  </a>
</div>
<p style="font-size:10pt;color:#555;">If the button doesn&apos;t work, copy and paste this link
into your browser:<br>
<a href="${signUrl}" style="color:#1a5276;word-break:break-all;">${signUrl}</a></p>
<p style="font-size:10pt;color:#555;">This link will expire on <strong>${expiryStr}</strong>.</p>
<hr style="border:none;border-top:1px solid #ccc;margin:24px 0;">
<p style="font-size:9pt;color:#888;">Concordia Pharmacy &middot; 96-01 63rd Dr, Rego Park, NY 11374
&middot; (718) 830-8833<br>
If you did not expect this request, please contact us at the number above.</p>
</body></html>`;

        const emailResult = await se({
          to: body.prescriberEmail,
          subject: `Signature Required: PA for ${pa.medicationName}`,
          html: emailHtml,
          text: `Dear ${prescriberName},\n\nConcordia Pharmacy needs your signature on a prior authorization for ${pa.medicationName}.\n\nSign here: ${signUrl}\n\nThis link expires in 72 hours.\n\nConcordia Pharmacy\n(718) 830-8833`,
        });

        const updated = await storage.updatePriorAuthRequest(pa.id, {
          prescriberEmail: body.prescriberEmail,
          signatureTokenHash: tokenHash,
          signatureTokenExpiresAt: expiresAt,
          signatureRequestedAt: new Date(),
          signatureStatus: "requested",
          status: "awaiting_signature",
        } as any);

        await storage.createAuditLog({
          userId: pa.userId,
          actionType: "update",
          entityType: "prior_auth_request" as any,
          entityId: pa.id,
          newValue: {
            action: "signature_requested",
            prescriberEmail: body.prescriberEmail,
            emailSent: emailResult.ok,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] || null,
        });

        res.json({ pa: updated, emailSent: emailResult.ok, error: emailResult.error });
      } catch (error) {
        console.error("[PA Signature] Request error:", error);
        if (error instanceof Error && error.name === "ZodError") {
          return res
            .status(400)
            .json({ message: "Invalid request", details: (error as any).errors });
        }
        res.status(500).json({ message: "Failed to send signature request" });
      }
    }
  );

  // ── GET /api/pa-sign/:token/details ───────────────────────────────────────
  // Public — the prescriber's signature page fetches PA details using their token.
  app.get("/api/pa-sign/:token/details", async (req, res) => {
    try {
      const tokenHash = createHash("sha256")
        .update(req.params.token)
        .digest("hex");
      const pa = await storage.getPriorAuthRequestBySignatureToken(tokenHash);
      if (!pa) {
        return res.status(404).json({
          message:
            "This signature link is invalid or has expired. Contact Concordia Pharmacy at (718) 830-8833 for a new link.",
        });
      }
      const user = await storage.getUser(pa.userId).catch(() => null);
      res.json({
        medicationName: pa.medicationName,
        patientFirstName: (user as any)?.firstName ?? "Your patient",
        prescriberName: pa.prescriberName ?? null,
        letterHtml: pa.letterHtml ?? "",
        letterText: pa.letterText ?? "",
      });
    } catch (error) {
      console.error("[PA Signature] Details error:", error);
      res.status(500).json({ message: "Failed to load signature details" });
    }
  });

  // ── POST /api/pa-sign/:token/submit ───────────────────────────────────────
  // Public — prescriber submits their drawn/typed signature.
  app.post("/api/pa-sign/:token/submit", async (req, res) => {
    try {
      const schema = z.object({
        // Strict allow-list: PNG base64 data URL only; no other MIME type or URI scheme
        signatureDataUrl: z
          .string()
          .regex(
            /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/,
            "signatureDataUrl must be a valid PNG base64 data URL"
          )
          .max(400_000, "Signature image exceeds maximum allowed size"),
        signerName: z.string().min(1, "Signer name required").max(200),
      });
      const body = schema.parse(req.body);

      // Belt-and-suspenders: service-level validation also throws on bad input
      validateSignatureDataUrl(body.signatureDataUrl);

      const tokenHash = createHash("sha256")
        .update(req.params.token)
        .digest("hex");

      const signedAt = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // Read-only lookup to obtain the base letter HTML for embedding
      const paForLetter =
        await storage.getPriorAuthRequestBySignatureToken(tokenHash);
      if (!paForLetter) {
        return res.status(404).json({
          message: "This signature link is invalid or has expired.",
        });
      }

      const signedLetterHtml = embedSignatureInHtml(
        paForLetter.letterHtml ?? "",
        body.signatureDataUrl,
        body.signerName,
        signedAt
      );

      // Single conditional UPDATE — atomically consumes the token and writes the
      // signed letter.  Returns null when another request already cleared the token.
      const updated = await storage.submitSignatureAtomically({
        tokenHash,
        signedLetterHtml,
        signatureReceivedAt: new Date(),
      });

      if (!updated) {
        return res.status(409).json({
          message:
            "This signature has already been submitted. Please contact Concordia Pharmacy at (718) 830-8833 if you need assistance.",
        });
      }

      // Non-blocking confirmation email to pharmacy team
      const adminEmail =
        process.env.ADMIN_NOTIFICATION_EMAIL || "rx@concordianyc.com";
      se({
        to: adminEmail,
        subject: `PA Signature Received — ${paForLetter.medicationName}`,
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;">
<h2 style="color:#1a7a4a;">&#10003; PA Signature Received</h2>
<p>The prescriber has signed the prior authorization letter for
<strong>${esc(paForLetter.medicationName)}</strong>.</p>
<table style="border-collapse:collapse;width:100%;font-size:11pt;">
  <tr><td style="padding:4px 8px;color:#555;width:160px;">Signed by</td>
      <td style="padding:4px 8px;font-weight:bold;">${esc(body.signerName)}</td></tr>
  <tr><td style="padding:4px 8px;color:#555;">Medication</td>
      <td style="padding:4px 8px;">${esc(paForLetter.medicationName)}</td></tr>
  <tr><td style="padding:4px 8px;color:#555;">Signed at</td>
      <td style="padding:4px 8px;">${esc(signedAt)}</td></tr>
</table>
<p>Log in to the admin dashboard to download the signed letter and submit to the payer.</p>
<p style="font-size:9pt;color:#888;">Concordia Pharmacy &middot; (718) 830-8833</p>
</body></html>`,
        text: `PA Signature Received\n\nSigned by: ${body.signerName}\nMedication: ${paForLetter.medicationName}\nSigned at: ${signedAt}\n\nLog in to admin dashboard.`,
      }).catch((e: unknown) =>
        console.error("[PA Signature] Confirmation email failed:", e)
      );

      res.json({ ok: true });
    } catch (error) {
      console.error("[PA Signature] Submit error:", error);
      if (error instanceof Error && error.name === "ZodError") {
        return res
          .status(400)
          .json({ message: "Invalid submission", details: (error as any).errors });
      }
      if (
        error instanceof Error &&
        (error.message.includes("signatureDataUrl") ||
          error.message.includes("PNG"))
      ) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to submit signature" });
    }
  });

  // ── POST /api/admin/pa-requests/:id/void-signature ────────────────────────
  // Admin voids a received signature so the PA can be re-signed or revised.
  app.post(
    "/api/admin/pa-requests/:id/void-signature",
    isAdmin,
    async (req, res) => {
      try {
        const pa = await storage.getPriorAuthRequest(req.params.id);
        if (!pa) return res.status(404).json({ message: "Not found" });

        const updated = await storage.updatePriorAuthRequest(pa.id, {
          signedLetterHtml: null,
          signatureTokenHash: null,
          signatureTokenExpiresAt: null,
          signatureStatus: "voided",
          status: "pending_submission",
        } as any);

        await storage.createAuditLog({
          userId: pa.userId,
          actionType: "update",
          entityType: "prior_auth_request" as any,
          entityId: pa.id,
          newValue: { action: "signature_voided" },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"] || null,
        });

        res.json(updated);
      } catch (error) {
        console.error("[PA Signature] Void error:", error);
        res.status(500).json({ message: "Failed to void signature" });
      }
    }
  );
}
