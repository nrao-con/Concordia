import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, type IStorage } from "./storage";
import { ensureDoctorPartnersSchemaAndSeed } from "./seed";
import { setupAuth, isAuthenticated, isAdmin, resolveUser, getSession, getAuth } from "./clerkAuth";
import { IdentityLinkRequiredError, resolveCanonicalPatientIdentity } from "./canonicalPatientIdentity";
import { registerPublicMcp } from "./public-mcp";
import { insertPrescriptionSchema, insertProductSchema, insertCartItemSchema, AUDIT_ACTION_TYPES, AUDIT_ENTITY_TYPES, type OrderWithItems, type Prescription, insertPatientDocumentSchema, insertPatientRequestSchema, insertBlisterDoseLogSchema, insertBlisterReminderSchema, insertChangeLogSchema, insertPatientDoctorSchema, patientAttendants, blisterPackPatients, blisterDoseLogs, prescriptions, users, cartItems, orderItems, orders as ordersTable, syncOutbox, specialtyMedications, specialtyFulfillmentRequests, insertSpecialtyFulfillmentRequestSchema, ltcFacilityLeads, insertLtcFacilityLeadSchema, savingsRequests, insertSavingsRequestSchema, prescriptionTransferRequests, insertDoctorPartnerSchema, insertDoctorMatchLeadSchema, blogPosts, products as productsTable, fluShotAppointments, conversionLeads, doctorMatchLeads, insuranceAssistanceRequests } from "@shared/schema";
import { db } from "./db";
import { eq, gt, and, isNull, or, desc, sql, ilike, ne } from "drizzle-orm";
import { createHash, randomUUID, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";
import { logAudit, auditMiddleware } from "./auditLogger";
import bcrypt from "bcryptjs";
import { ObjectStorageService, ObjectNotFoundError, objectStorageClient, parseObjectPath } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import multer from "multer";
import * as PointsService from "./points-service";
import { processMixedRequest } from "./mixed-request-service";
import { registerFluShotAppointmentRoutes } from "./flu-shot-routes";
import { notifyFluShotAppointment } from "./flu-shot-notifications";
import { registerSeasonalThemeRoutes } from "./seasonal-theme-routes";
import { registerStaffInventoryRoutes } from "./staff-inventory-routes";
import { reconcileStaffCatalog, getStaffShopProducts } from "./staff-catalog";
import { registerShopOrderRequests, handleAppShopRequest } from "./shop-order-requests";
import { shopPhoneSchema, shopAddressSelectionSchema } from "@shared/shop-request";
import { deliverStaffWebhook, STAFF_ORDER_WEBHOOK } from "./staff-order-delivery";
import { processGuestCheckout } from "./guest-checkout-service";
import { verifyDeliveryAddress } from "./address-verification";
import { getAvailableProductQuantity } from "@shared/cart-utils";
import { classifyChatAction, getChatActionTrainingSummary } from "./chat-action-model";
import { recordQualifyingCompletedRefill, recordReversedRefill } from "./refill-credit-service";
import { conciergeSourcingInquirySchema, deriveAuthenticatedPatientId, sanitizeConciergeReviewText, validateConciergeLeadSubmission } from "./concierge-lead-schema";
import { claimRequest, completeRequest, ensureRequestIdempotencyTable, fingerprintRequest, normalizeIdempotencyKey, releaseUncompletedRequest } from "./request-idempotency";
import { PUBLIC_PAGES, SITE_URL } from "./public-pages";

function htmlEscape(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

import { pingIndexNow } from "./indexnow";
import { seedSpecialtyMedications } from "./seed-specialty";
import {
  isPrimeRxNativePayload,
  isPatientEvent,
  isRxEvent,
  isWorkflowEvent,
  extractPatientFromEvent,
  extractPrescriberFromEvent,
  extractDrugFromEvent,
  extractRxDataFromEvent,
  mapEventToWorkflowStatus,
  extractWorkflowTransition,
  type PrimeRxPayload,
} from "./primerx-webhook";
import { primeRxApi } from "./primerx-api";
import { parseSig } from "./sig-parser";
import { sendEmail, escapeHtml } from "./email";
import { sendSms } from "./sms";
import { resolvePatientIdentity, isFluShotTicketOwned, isInsuranceTicketOwned, resolvePatientByQuery, buildIdentityBlock } from "./patientIdentity";
import { backfillConcordiaIds } from "./concordiaId";
import { insertPatientConditionSchema, insertHealthJournalEntrySchema, patientConditions, healthJournalEntries } from "@shared/schema";
import { getConditionExplainer, getNextSteps, matchPrescriptionsToCondition } from "./care-navigator-service";
import { getDrugInfoByNdc, batchEnrichNdcs } from "./ndc-service";
import { createClinicalNote } from "./clinical-notes-service";
import { createPriorAuthRequest, generatePaLetter, buildPaHtml, generateAppealLetter, buildAppealHtml } from "./pa-service";
import { registerPaSignatureRoutes } from "./pa-signature-routes";
import { buildFhirBundle } from "./fhir-service";
import { generateOrderNumber } from "./order-number-util";
import { chatIdentityStatus, clearChatIdentity, requestChatIdentity, verifyChatIdentity } from "./chat-identity";
import { buildConcordiaCarePatientPayload } from "./concordiaCareIdentity";
import { getConcordiaCareApiKey, isPermanentConcordiaCareAuthFailure } from "./concordia-care-sync";
import { checkStaffStatusTransition } from "./staff-order-status";
import { BLISTER_OUTBOX_PATIENT_ID, getCreatedBlisterPackId, isPermanentBlisterSyncFailure, isValidBlisterCreatePayload, mapBlisterCreateMedications, postBlisterCreate, resolveBlisterSyncIdentity, type BlisterCreatePayload } from "./concordia-care-blister-sync";
import { PrimeRxOwnershipError, assertMedicationOwnership, assertRxOwner, operationalPatientHash, requiredPrimeRxPatientId, PRIMERX_OWNERSHIP_ERROR } from "./primerx-ownership";
import {
  ensureFraudAlertsTable,
  listFraudAlerts,
  reviewFraudAlert,
  recordFraudSignal,
  subscribeFraudAlerts,
} from "./fraud-alert-service";

// WebSocket connections for real-time updates
const adminConnections = new Set<WebSocket>();
const staffConnections = new Set<WebSocket>();

// Short-lived WebSocket tickets for staff browser clients (expires in 30 s)
const staffWsTickets = new Map<string, number>(); // ticket → expiry ms

// SSE clients for public real-time events (/api/public/events)
const sseClients = new Set<any>();

function broadcastPublicSSE(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try { res.write(payload); } catch { sseClients.delete(res); }
  });
}

// Broadcast update to all connected admin clients
function broadcastUpdate(channel: string, data: any) {
  const message = JSON.stringify({ channel, ...data });
  adminConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
  // Also broadcast order events to staff tablet connections and public SSE clients
  if (channel === "orders") {
    staffConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
    if (data.type === "new_order") {
      broadcastPublicSSE("order_placed", {
        orderNumber: data.order?.orderNumber,
        status: data.order?.status ?? "pending",
      });
    }
  }
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const objectStorageService = new ObjectStorageService();

// Rate limiter for admin PIN login (brute-force protection)
const adminPinRateLimiter = new Map<string, { count: number; lockoutUntil: number }>();
const ADMIN_PIN_MAX_ATTEMPTS = 5; // Max attempts per window
const ADMIN_PIN_WINDOW_MS = 15 * 60 * 1000; // 15-minute rolling window
const ADMIN_PIN_LOCKOUT_MS = 30 * 60 * 1000; // 30-minute lockout after exceeding limit

function checkAdminPinRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const record = adminPinRateLimiter.get(ip);
  if (!record) {
    return { allowed: true };
  }
  if (record.lockoutUntil > now) {
    return { allowed: false, retryAfterMs: record.lockoutUntil - now };
  }
  if (record.count >= ADMIN_PIN_MAX_ATTEMPTS) {
    // Window expired — reset
    adminPinRateLimiter.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordAdminPinFailure(ip: string): void {
  const now = Date.now();
  const record = adminPinRateLimiter.get(ip);
  if (!record) {
    adminPinRateLimiter.set(ip, { count: 1, lockoutUntil: 0 });
    return;
  }
  record.count += 1;
  if (record.count >= ADMIN_PIN_MAX_ATTEMPTS) {
    record.lockoutUntil = now + ADMIN_PIN_LOCKOUT_MS;
  }
}

function clearAdminPinFailures(ip: string): void {
  adminPinRateLimiter.delete(ip);
}

// Simple in-memory rate limiter for OTP requests
const otpRequestRateLimiter = new Map<string, { count: number; resetTime: number }>();
const OTP_REQUEST_RATE_LIMIT = 5; // Max 5 requests per minute
const OTP_REQUEST_RATE_WINDOW = 60 * 1000;

// Rate limiter for OTP verification attempts (prevent brute-force)
const otpVerifyRateLimiter = new Map<string, { count: number; resetTime: number; lockoutUntil?: number }>();
const OTP_VERIFY_RATE_LIMIT = 10; // Max 10 verification attempts per 10-minute window
const OTP_VERIFY_RATE_WINDOW = 10 * 60 * 1000; // 10 minutes
const OTP_LOCKOUT_DURATION = 15 * 60 * 1000; // 15-minute lockout after exceeding limit

function checkOtpRequestRateLimit(phoneNumber: string): boolean {
  const now = Date.now();
  const record = otpRequestRateLimiter.get(phoneNumber);
  
  if (!record || now > record.resetTime) {
    otpRequestRateLimiter.set(phoneNumber, { count: 1, resetTime: now + OTP_REQUEST_RATE_WINDOW });
    return true;
  }
  
  if (record.count >= OTP_REQUEST_RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

function checkOtpVerifyRateLimit(phoneNumber: string): { allowed: boolean; lockoutRemaining?: number } {
  const now = Date.now();
  const record = otpVerifyRateLimiter.get(phoneNumber);
  
  // Check if currently locked out
  if (record?.lockoutUntil && now < record.lockoutUntil) {
    return { allowed: false, lockoutRemaining: Math.ceil((record.lockoutUntil - now) / 1000) };
  }
  
  // Reset if window expired
  if (!record || now > record.resetTime) {
    otpVerifyRateLimiter.set(phoneNumber, { count: 1, resetTime: now + OTP_VERIFY_RATE_WINDOW });
    return { allowed: true };
  }
  
  // Check if exceeded limit - apply lockout
  if (record.count >= OTP_VERIFY_RATE_LIMIT) {
    record.lockoutUntil = now + OTP_LOCKOUT_DURATION;
    return { allowed: false, lockoutRemaining: Math.ceil(OTP_LOCKOUT_DURATION / 1000) };
  }
  
  record.count++;
  return { allowed: true };
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Array.from(otpRequestRateLimiter.entries()).forEach(([key, value]) => {
    if (now > value.resetTime) {
      otpRequestRateLimiter.delete(key);
    }
  });
  Array.from(otpVerifyRateLimiter.entries()).forEach(([key, value]) => {
    if (now > value.resetTime && (!value.lockoutUntil || now > value.lockoutUntil)) {
      otpVerifyRateLimiter.delete(key);
    }
  });
}, 5 * 60 * 1000);

// Helper to safely get patient ID from authenticated request
function getPatientId(req: any): string | null {
  // Caregiver acting on behalf of a patient — session-based
  if (req.session?.attendantId && req.session?.actingPatientId) {
    return req.session.actingPatientId;
  }
  // Clerk-authenticated patient (localUser set by isAuthenticated middleware)
  return (req as any).localUser?.id ?? null;
}

// Helper to assert patient context (throws 403 if PIN-only admin)
function assertPatientContext(req: any): string {
  const patientId = getPatientId(req);
  if (!patientId) {
    throw new Error("PATIENT_CONTEXT_REQUIRED");
  }
  return patientId;
}

function chatAuditMetadata(req: any, purpose: string, extra: Record<string, number> = {}) {
  const isCaregiver = Boolean(req.session?.attendantId && req.session?.actingPatientId);
  return {
    purpose,
    ...extra,
    actorType: isCaregiver ? "caregiver" : "patient",
    ...(isCaregiver ? { attendantId: String(req.session.attendantId) } : {}),
  };
}

// Simple rule-based chatbot response generator
async function generateBotResponse(message: string, userId: string, storage: IStorage): Promise<string> {
  const lowerMessage = message.toLowerCase();
  
  // Fetch user data for personalized responses
  const [user, prescriptions, orders] = await Promise.all([
    storage.getUser(userId),
    storage.getPrescriptionsByUserId(userId),
    storage.getOrdersByUserId(userId),
  ]);

  // Delivery status questions
  if (lowerMessage.includes("delivery") || lowerMessage.includes("shipping") || lowerMessage.includes("track")) {
    const recentOrders = orders.filter(o => o.status !== "cancelled").slice(0, 3);
    if (recentOrders.length === 0) {
      return "You don't have any recent orders to track. If you'd like to place an order, visit our shop to browse OTC products.";
    }
    let response = "Here's the status of your recent orders:\n\n";
    recentOrders.forEach(order => {
      response += `📦 Order #${order.orderNumber} - ${order.status}\n`;
      if (order.deliveryStatus && order.deliveryStatus !== "not_assigned") {
        response += `   Delivery: ${order.deliveryStatus}\n`;
      }
      if (order.trackingNumber) {
        response += `   Tracking: ${order.trackingNumber}\n`;
      }
    });
    return response;
  }

  // Refills questions
  if (lowerMessage.includes("refill")) {
    const activePrescriptions = prescriptions.filter(p => p.status === "active");
    if (activePrescriptions.length === 0) {
      return "You don't have any active prescriptions at the moment. If you need to add a prescription, please contact our pharmacy.";
    }
    let response = "Here are your refill details:\n\n";
    activePrescriptions.forEach(rx => {
      response += `💊 ${rx.medicationName} (${rx.dosage})\n`;
      response += `   Refills remaining: ${rx.refillsRemaining}\n`;
      if (rx.refillsRemaining === 0) {
        response += `   ⚠️ No refills left - please contact your doctor\n`;
      }
    });
    return response;
  }

  // Medication list questions
  if (lowerMessage.includes("medication") || lowerMessage.includes("prescription") || lowerMessage.includes("med")) {
    const activePrescriptions = prescriptions.filter(p => p.status === "active");
    if (activePrescriptions.length === 0) {
      return "You don't have any active prescriptions currently on file.";
    }
    let response = "Your current medications:\n\n";
    activePrescriptions.forEach(rx => {
      response += `💊 ${rx.medicationName}\n`;
      response += `   Dosage: ${rx.dosage}\n`;
      response += `   Instructions: ${rx.instructions || "Take as directed"}\n`;
      response += `   Refills: ${rx.refillsRemaining} remaining\n\n`;
    });
    return response;
  }

  // Dosage/how to take questions
  if (lowerMessage.includes("dosage") || lowerMessage.includes("how") && lowerMessage.includes("take")) {
    const activePrescriptions = prescriptions.filter(p => p.status === "active");
    if (activePrescriptions.length === 0) {
      return "You don't have any active prescriptions. Please specify which medication you're asking about.";
    }
    let response = "Dosage information for your medications:\n\n";
    activePrescriptions.forEach(rx => {
      response += `💊 ${rx.medicationName}\n`;
      response += `   Dosage: ${rx.dosage}\n`;
      response += `   Instructions: ${rx.instructions || "Take as directed by your doctor"}\n\n`;
    });
    response += "⚠️ Always follow your doctor's instructions. Contact your doctor if you have questions about how to take your medication.";
    return response;
  }

  // Drug interaction questions
  if (lowerMessage.includes("interaction") || lowerMessage.includes("together")) {
    const activePrescriptions = prescriptions.filter(p => p.status === "active");
    if (activePrescriptions.length <= 1) {
      return "You currently have one or fewer active medications. For drug interaction information, please consult your pharmacist or doctor.";
    }
    let response = "⚠️ **Important Drug Safety Information**\n\n";
    response += "You are currently taking:\n";
    activePrescriptions.forEach(rx => {
      response += `• ${rx.medicationName} (${rx.dosage})\n`;
    });
    response += "\n**Please consult your pharmacist or doctor for specific drug interaction information.** They can review your complete medication list and check for potential interactions.\n\n";
    response += "Call us at (555) 123-4567 to speak with a pharmacist.";
    return response;
  }

  // Copay questions
  if (lowerMessage.includes("copay") || lowerMessage.includes("co-pay") || lowerMessage.includes("cost")) {
    const activePrescriptions = prescriptions.filter(p => p.status === "active");
    if (activePrescriptions.length === 0) {
      return "You don't have any active prescriptions on file. Copay amounts depend on your insurance plan and the specific medication. Contact us at (718) 328-2833 for more information.";
    }
    let response = "💰 Copay Information:\n\n";
    response += "Your copay amounts depend on your insurance plan. Here are your current medications:\n\n";
    activePrescriptions.forEach(rx => {
      response += `💊 ${rx.medicationName} (${rx.dosage})\n`;
    });
    response += "\n📞 For exact copay amounts, please:\n";
    response += "• Check your insurance card for tier information\n";
    response += "• Call us at (718) 328-2833 - we can look up your specific copays\n";
    response += "• Visit the pharmacy with your insurance card\n\n";
    if (user?.insuranceProvider) {
      response += `Your insurance provider: ${user.insuranceProvider}`;
    } else {
      response += "💡 Tip: Add your insurance information to your profile for faster assistance.";
    }
    return response;
  }

  // Payment due / balance questions
  if (lowerMessage.includes("due") || lowerMessage.includes("balance") || lowerMessage.includes("owe") || lowerMessage.includes("outstanding") || lowerMessage.includes("payment")) {
    const pendingOrders = orders.filter(o => o.status === "pending");
    const processingOrders = orders.filter(o => o.status === "processing");
    
    if (pendingOrders.length === 0 && processingOrders.length === 0) {
      return "✅ Good news! You don't have any outstanding balances or pending payments at this time.\n\nIf you believe there's an issue with your account, please contact us at (718) 328-2833.";
    }
    
    let response = "💳 Payment Status:\n\n";
    
    if (pendingOrders.length > 0) {
      response += "**Pending Payments:**\n";
      pendingOrders.forEach(order => {
        response += `• Order #${order.orderNumber} - $${parseFloat(order.total).toFixed(2)}\n`;
      });
      response += "\n";
    }
    
    if (processingOrders.length > 0) {
      response += "**Orders Being Processed:**\n";
      processingOrders.forEach(order => {
        response += `• Order #${order.orderNumber} - $${parseFloat(order.total).toFixed(2)}\n`;
      });
    }
    
    response += "\n📞 Questions about your balance? Call us at (718) 328-2833.";
    return response;
  }

  // Insurance questions
  if (lowerMessage.includes("insurance") || lowerMessage.includes("coverage")) {
    return "For insurance questions, please use our 'No Insurance? Get Help Here' form on the homepage, or call us at (718) 328-2833. Our team can help you find affordable coverage options and assistance programs.";
  }

  // Hours/contact questions
  if (lowerMessage.includes("hour") || lowerMessage.includes("open") || lowerMessage.includes("contact") || lowerMessage.includes("phone")) {
    return "📞 Concordia Pharmacy Contact Information:\n\nPhone: (718) 328-2833\nHours: Mon-Fri 9AM-7PM, Sat 9AM-5PM, Sun Closed\nAddress: 898 East Tremont Ave, Bronx, NY 10460\n\nFor urgent questions, please call us during business hours.";
  }

  // Default response with helpful suggestions
  return "I can help you with:\n\n" +
    "• Prescriptions: new prescriptions, eligible refills, transfers, and refill synchronization\n" +
    "• Medication support: pharmacist review, blister packaging, reminders, and disposal guidance\n" +
    "• Orders: live-catalog shopping, delivery or pickup, and order tracking\n" +
    "• Coverage: insurance assistance, prior authorization, discounts, and specialty requests\n" +
    "• Health services: flu-shot scheduling, doctor directory help, and care-journal tools\n" +
    "• Ongoing care: caregiver access, patient documents, rewards, and facility inquiries\n\n" +
    "I can explain a service or point you to its secure workflow. Staff must confirm stock, prescription processing, coverage, pricing, addresses, and fulfillment times.";
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Durable claims prevent duplicate external side effects after client/network retries.
  try {
    await ensureRequestIdempotencyTable();
  } catch (error) {
    console.error("[Startup] Failed to ensure request idempotency table:", error);
  }
  // Auth middleware
  await setupAuth(app);
  registerPublicMcp(app);
  await ensureFraudAlertsTable();
  subscribeFraudAlerts((alert) => {
    broadcastUpdate("fraud-alerts", {
      type: alert.status === "open" ? "new" : "update",
      data: {
        id: alert.id,
        signalType: alert.signalType,
        severity: alert.severity,
        status: alert.status,
        occurredAt: alert.occurredAt,
      },
    });
  });

  // Chat recognition is intentionally independent of Clerk account access.
  app.get("/api/chat/identity", resolveUser, async (req: any, res) => {
    try {
      res.json(await chatIdentityStatus(req));
    } catch {
      res.json({ recognized: false, source: null });
    }
  });
  app.post("/api/chat/identity/request", async (req: any, res) => {
    try {
      res.status(202).json(await requestChatIdentity(req));
    } catch {
      // A response must not reveal a delivery, lookup, or storage failure.
      res.status(202).json({ accepted: true, challengeId: randomUUID(), message: "If eligible, a verification code has been sent." });
    }
  });
  app.post("/api/chat/identity/verify", async (req: any, res) => {
    try {
      const result = await verifyChatIdentity(req);
      res.status(result.verified ? 200 : 400).json(result);
    } catch {
      res.status(400).json({ verified: false, message: "Invalid or expired verification code." });
    }
  });
  app.delete("/api/chat/identity", async (req: any, res) => {
    try { await clearChatIdentity(req); } catch { /* clearing remains idempotent */ }
    res.status(204).end();
  });
  app.post("/api/chat/classify", async (req, res) => {
    const parsed = z.object({ text: z.string().trim().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "A short chat message is required." });
    return res.json(classifyChatAction(parsed.data.text));
  });
  app.get("/api/chat/classify/model", (_req, res) => {
    return res.json(getChatActionTrainingSummary());
  });

  // ── One-shot admin promotion (dedicated bootstrap key only) ─────────────
  app.post("/api/internal/set-admin", async (req: any, res) => {
    const key = req.headers["x-api-key"] as string | undefined;
    const bootstrapKey = process.env.ADMIN_BOOTSTRAP_KEY;
    if (!bootstrapKey) return res.status(503).json({ message: "Admin bootstrap is disabled" });
    if (!key || key !== bootstrapKey) return res.status(403).json({ message: "Forbidden" });
    const { email } = req.body as { email?: string };
    if (!email) return res.status(400).json({ message: "email required" });
    try {
      let user = await storage.getUserByEmail(email);
      if (!user) {
        // Pre-create the record so Clerk lazy-upsert will link to it on first sign-in
        const newId = crypto.randomUUID();
        await db.execute(sql`
          INSERT INTO users (id, email, role, created_at, updated_at)
          VALUES (${newId}, ${email}, 'admin', NOW(), NOW())
          ON CONFLICT (email) DO UPDATE SET role = 'admin', updated_at = NOW()
        `);
      } else {
        await db.execute(sql`UPDATE users SET role = 'admin', updated_at = NOW() WHERE email = ${email}`);
      }
      user = await storage.getUserByEmail(email);
      return res.json({ ok: true, id: user?.id, email: user?.email, role: user?.role });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Seed default earning rules on startup (only if none exist)
  try {
    await storage.seedDefaultEarningRules();
  } catch (error) {
    console.error("[Startup] Failed to seed earning rules:", error);
  }
  
  // Seed default rewards on startup (only if none exist)
  try {
    await storage.seedDefaultRewards();
  } catch (error) {
    console.error("[Startup] Failed to seed rewards:", error);
  }

  // Ensure wellness pack columns exist on prescription_transfer_requests
  try {
    await db.execute(sql`
      ALTER TABLE prescription_transfer_requests
      ADD COLUMN IF NOT EXISTS expected_med_count INTEGER,
      ADD COLUMN IF NOT EXISTS wellness_pack_eligible BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS pending_points INTEGER DEFAULT 500,
      ADD COLUMN IF NOT EXISTS pending_points_released BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS vitamins_included BOOLEAN DEFAULT FALSE
    `);
    // Backfill for legacy rows that were already rewarded under the old immediate
    // 1000-point model. We identify legacy rows by expected_med_count IS NULL —
    // all new transfer requests (created after this feature) always set
    // expected_med_count to an integer (defaulting to 0 when not provided).
    // This makes the condition safe to run on every startup restart.
    await db.execute(sql`
      UPDATE prescription_transfer_requests
      SET pending_points_released = TRUE
      WHERE reward_points_granted = TRUE
        AND pending_points_released = FALSE
        AND expected_med_count IS NULL
    `);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure wellness pack columns on transfer requests:", migrationError);
  }

  // Ensure source column exists on prescription_transfer_requests (app vs website)
  try {
    await db.execute(sql`
      ALTER TABLE prescription_transfer_requests
      ADD COLUMN IF NOT EXISTS source VARCHAR DEFAULT 'website'
    `);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure source column on transfer requests:", migrationError);
  }

  // Ensure specialty_medications clinical columns exist, then seed/reseed
  try {
    await db.execute(sql`
      ALTER TABLE specialty_medications
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS mechanism_of_action TEXT,
      ADD COLUMN IF NOT EXISTS common_side_effects TEXT[],
      ADD COLUMN IF NOT EXISTS typical_dosing TEXT,
      ADD COLUMN IF NOT EXISTS administration_route VARCHAR,
      ADD COLUMN IF NOT EXISTS storage_requirements VARCHAR,
      ADD COLUMN IF NOT EXISTS fda_approval_year INTEGER,
      ADD COLUMN IF NOT EXISTS black_box_warning BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS black_box_warning_text TEXT
    `);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure specialty medication clinical columns:", migrationError);
  }

  try {
    const allMeds = await db.select({ id: specialtyMedications.id, description: specialtyMedications.description }).from(specialtyMedications);
    const totalCount = allMeds.length;
    const missingClinical = allMeds.filter(m => !m.description).length;
    if (totalCount === 0) {
      console.log("[Seed] Seeding specialty medications...");
      await seedSpecialtyMedications();
      console.log("[Seed] Specialty medications seeded successfully.");
    } else if (missingClinical > 0) {
      console.log(`[Seed] ${missingClinical}/${totalCount} specialty medications missing clinical data, re-seeding...`);
      await db.delete(specialtyMedications);
      await seedSpecialtyMedications();
      console.log("[Seed] Specialty medications re-seeded with clinical data.");
    } else {
      console.log(`[Seed] All ${totalCount} specialty medications have clinical data, skipping seed.`);
    }
  } catch (error) {
    console.error("[Startup] Failed to seed specialty medications:", error);
  }

  // Ensure blog_posts.slug column exists and backfill existing posts
  try {
    await db.execute(sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS slug VARCHAR UNIQUE`);
    await db.execute(sql`
      UPDATE blog_posts 
      SET slug = id || '-' || lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
      WHERE slug IS NULL
    `);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure blog_posts slug column:", migrationError);
  }

  // Ensure contact_submissions table exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        phone VARCHAR,
        message TEXT NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'new'`);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure contact_submissions table:", migrationError);
  }

  // Ensure page_views table exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        path VARCHAR NOT NULL,
        referrer VARCHAR,
        user_agent VARCHAR,
        viewed_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE page_views ADD COLUMN IF NOT EXISTS user_agent VARCHAR`);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure page_views table:", migrationError);
  }

  // Ensure doctor_partners + doctor_match_leads schema and seed defaults
  await ensureDoctorPartnersSchemaAndSeed();

  // Back-fill concordiaId for any existing users that don't have one yet
  backfillConcordiaIds().catch((err) => console.error("[Startup] concordiaId backfill failed:", err));

  // Care Navigator: ensure new tables exist + audit_entity_type has new values
  try {
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'condition_status') THEN
          CREATE TYPE condition_status AS ENUM ('active', 'resolved');
        END IF;
      END $$
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS patient_conditions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        condition_name VARCHAR NOT NULL,
        icd10_code VARCHAR,
        diagnosed_at TIMESTAMP,
        notes TEXT,
        status condition_status NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS health_journal_entries (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        condition_id VARCHAR REFERENCES patient_conditions(id) ON DELETE SET NULL,
        entry_date TIMESTAMP NOT NULL DEFAULT NOW(),
        symptom_severity INTEGER,
        mood INTEGER,
        energy_level INTEGER,
        side_effects_text TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS condition_explainer_cache (
        id SERIAL PRIMARY KEY,
        condition_key VARCHAR NOT NULL UNIQUE,
        response_json JSONB NOT NULL,
        generated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    // Extend the audit_entity_type enum with new values (safe — IF NOT EXISTS)
    await db.execute(sql`ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'patient_condition'`);
    await db.execute(sql`ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'health_journal_entry'`);
    await db.execute(sql`ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'otc_card'`);
    await db.execute(sql`ALTER TYPE audit_entity_type ADD VALUE IF NOT EXISTS 'doctor'`);
  } catch (migrationError) {
    console.error("[Startup] Failed to ensure Care Navigator tables:", migrationError);
  }

  // Admin API routes are available in all environments — protected by PIN session via /api/admin/login

  // Audit logging middleware for HIPAA compliance
  app.use(auditMiddleware);

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "",
        "Disallow: /admin",
        "Disallow: /admin-login",
        "Disallow: /api/",
        "Disallow: /cart",
        "Disallow: /checkout",
        "Disallow: /express-checkout",
        "",
        `Sitemap: ${SITE_URL}/sitemap.xml`,
      ].join("\n"),
    );
  });

  app.get("/sitemap.xml", async (_req, res) => {
    const today = new Date().toISOString().split("T")[0];

    let posts: any[] = [];
    try {
      posts = await storage.getAllPublishedBlogPosts();
    } catch (err) {
      console.error("Sitemap: could not load blog posts, serving static pages only:", err);
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of PUBLIC_PAGES) {
      xml += "  <url>\n";
      xml += `    <loc>${SITE_URL}${page.path}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += "  </url>\n";
    }

    for (const post of posts) {
      const slug = post.slug || String(post.id);
      const lastmodSource = post.updatedAt ?? post.publishedAt ?? post.createdAt;
      const lastmod = lastmodSource
        ? new Date(lastmodSource).toISOString().split("T")[0]
        : today;
      xml += "  <url>\n";
      xml += `    <loc>${SITE_URL}/blog/${slug}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += "    <changefreq>monthly</changefreq>\n";
      xml += "    <priority>0.6</priority>\n";
      xml += "  </url>\n";
    }

    xml += "</urlset>";
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(xml);
  });

  // Auth routes
  // Read-only identity bridge for the signed-in patient. No API key, contact
  // matching, attendant delegation, or client-provided patient identifier.
  app.get("/api/patient/canonical-identity", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const { userId } = getAuth(req);
      if (!userId) return res.status(401).json({ code: "unauthorized" });
      const identity = await resolveCanonicalPatientIdentity(userId, (subject) => storage.getUserByClerkId(subject));
      if (!identity) return res.status(404).json({ code: "identity_link_required" });
      return res.json(identity);
    } catch (error) {
      if (error instanceof IdentityLinkRequiredError) {
        return res.status(409).json({ code: "identity_link_required" });
      }
      console.error("[Canonical Identity] Resolution failed", error);
      return res.status(500).json({ code: "identity_unavailable" });
    }
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(200).json(null);
      }
      const user = (req as any).localUser ?? await storage.getUser(patientId);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ─── Patient Identity Block ──────────────────────────────────────────────
  // Accepts any identifier: CP-XXXXXX, email, phone, concordiaCareId, internalId
  // Protected: admin session OR STAFF_API_KEY header
  function isIdentityBlockAuthorized(req: any): boolean {
    // Clerk admin check (from JWT claims — sync)
    try {
      const { userId, sessionClaims } = getAuth(req);
      if (userId && (sessionClaims?.metadata as any)?.role === "admin") return true;
    } catch { /* Clerk not configured */ }
    // STAFF_API_KEY header
    const staffKey = process.env.STAFF_API_KEY;
    const provided = req.headers["x-api-key"] as string | undefined;
    return !!(staffKey && provided && provided === staffKey);
  }

  app.get("/api/patient/identity-block", async (req: any, res) => {
    if (!isIdentityBlockAuthorized(req)) return res.status(401).json({ message: "Unauthorized" });
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) return res.status(400).json({ message: "Query parameter 'q' is required" });
    try {
      const patient = await resolvePatientByQuery(q, storage);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      return res.json(buildIdentityBlock(patient));
    } catch (err) {
      console.error("[IdentityBlock] Error:", err);
      return res.status(500).json({ message: "Failed to resolve patient identity" });
    }
  });

  app.get("/api/patient/identity-block/:concordiaId", async (req: any, res) => {
    if (!isIdentityBlockAuthorized(req)) return res.status(401).json({ message: "Unauthorized" });
    try {
      const patient = await resolvePatientByQuery(req.params.concordiaId, storage);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      return res.json(buildIdentityBlock(patient));
    } catch (err) {
      console.error("[IdentityBlock] Error:", err);
      return res.status(500).json({ message: "Failed to resolve patient identity" });
    }
  });

  // Admin authentication is now handled by Clerk — see /admin-login frontend page
  app.post('/api/admin/login', (_req, res) => {
    res.status(410).json({ success: false, message: "Admin PIN login removed. Sign in via Clerk at /admin-login." });
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.json({ success: true, message: "Admin logout successful" });
  });

  // Phone OTP Authentication
  app.post('/api/auth/phone/request-otp', async (req, res) => { return res.status(410).json({ message: "Gone: this endpoint was replaced by Clerk authentication. Use the sign-in page." }); });

  app.post('/api/auth/phone/verify-otp', async (req, res) => { return res.status(410).json({ message: "Gone: this endpoint was replaced by Clerk authentication. Use the sign-in page." }); });

  async function migratePrimeRxDataToAppUser(appUserId: string, primeRxProfileId: string) {
    try {
      const existingRx = await storage.getPrescriptionsByUserId(primeRxProfileId);
      let migratedRx = 0;
      for (const rx of existingRx) {
        try {
          await storage.updatePrescription(rx.id, { userId: appUserId });
          migratedRx++;
        } catch (e) { /* skip duplicates */ }
      }

      const existingDoctors = await storage.getDoctorsByPatient(primeRxProfileId);
      let migratedDocs = 0;
      for (const doc of existingDoctors) {
        const appDoctors = await storage.getDoctorsByPatient(appUserId);
        const alreadyLinked = appDoctors.some((d: { id: number }) => d.id === doc.id);
        if (!alreadyLinked) {
          try {
            await storage.updateDoctor(doc.id, { userId: appUserId } as Partial<typeof doc>);
            migratedDocs++;
          } catch (e) { /* skip duplicates */ }
        }
      }

      if (migratedRx > 0 || migratedDocs > 0) {
        console.log(`[App Match] Migrated ${migratedRx} prescription(s) and ${migratedDocs} doctor(s) from PrimeRx profile ${primeRxProfileId} to app user ${appUserId}`);
      }
    } catch (e) {
      console.log(`[App Match] Data migration error:`, e);
    }
  }

  // Username/Password Authentication
  app.post('/api/auth/login', async (req, res) => { return res.status(410).json({ message: "Gone: this endpoint was replaced by Clerk authentication. Use the sign-in page." }); });

  // Register with username/password
  app.post('/api/auth/register', async (req, res) => { return res.status(410).json({ message: "Gone: this endpoint was replaced by Clerk authentication. Use the sign-in page." }); });

  // Patient logout — actual JWT invalidation handled by Clerk client-side
  app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true, message: "Logged out successfully" });
  });

  app.get('/api/admin/check', async (req: any, res) => {
    try {
      const { userId, sessionClaims } = getAuth(req);
      if (!userId) return res.json({ isAdmin: false });
      const role = (sessionClaims?.metadata as any)?.role as string | undefined;
      if (role === "admin") return res.json({ isAdmin: true });
      const user = await storage.getUserByClerkId(userId);
      return res.json({ isAdmin: user?.role === "admin" });
    } catch {
      return res.json({ isAdmin: false });
    }
  });

  // Clerk webhook — sync user.created / user.updated events to local users table
  app.post('/api/webhooks/clerk', async (req: any, res) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(503).json({ message: "Webhook secret not configured" });
    try {
      const { Webhook } = await import('svix');
      const wh = new Webhook(webhookSecret);
      const payload = wh.verify(req.rawBody as Buffer, {
        'svix-id': req.headers['svix-id'] as string,
        'svix-timestamp': req.headers['svix-timestamp'] as string,
        'svix-signature': req.headers['svix-signature'] as string,
      }) as any;
      const { id: clerkId, email_addresses, first_name, last_name, image_url } = payload.data;
      const email = email_addresses?.[0]?.email_address;
      if (payload.type === 'user.created' || payload.type === 'user.updated') {
        const localUser = await storage.upsertUserByClerkId(clerkId, {
          email,
          firstName: first_name || undefined,
          lastName: last_name || undefined,
          profileImageUrl: image_url || undefined,
        });
        if (payload.type === 'user.created' && localUser?.id) {
          try {
            const displayName = [first_name, last_name].filter(Boolean).join(' ') || email || 'Unknown';
            await storage.createPatientRequest({
              patientId: localUser.id,
              type: 'general',
              status: 'new_from_app',
              message: `[NEW_SIGNUP] New patient account created — ${displayName} (${email || 'no email'}). Consider inviting them to download the ConcordiaCare app.`,
              priority: 5,
            });
          } catch (err: any) {
            console.warn('[Clerk webhook] Could not create new-signup patient request:', err.message);
          }
          void (async () => {
            await pushPatientToApp(localUser, "created");
          })();
        }
      }
      res.json({ received: true });
    } catch (error: any) {
      if (error instanceof IdentityLinkRequiredError) {
        console.warn("[Clerk webhook] Identity review required; no account was linked");
        return res.json({ received: true, status: "identity_link_required" });
      }
      console.error('[Clerk webhook] Error:', error.message);
      res.status(400).json({ message: "Webhook verification failed" });
    }
  });

  // Patient-initiated reconciliation. Identity is always loaded from the
  // authenticated local user; request body fields are intentionally ignored.
  app.post("/api/profile/sync-concordia-care", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) return res.status(401).json({ success: false, status: "unavailable", message: "Patient authentication required" });
      const user = await storage.getUser(patientId);
      if (!user || user.role !== "patient") {
        return res.status(403).json({ success: false, status: "unavailable", message: "Patient access required" });
      }

      const result = await pushPatientToApp(user, "updated");
      if (result === "conflict") {
        return res.status(409).json({ success: false, status: "conflict", message: "ConcordiaCare account link conflict" });
      }
      if (result === "unavailable") {
        return res.status(503).json({ success: false, status: "unavailable", message: "ConcordiaCare sync is unavailable" });
      }
      if (result === "queued") {
        return res.status(202).json({ success: true, status: "queued", message: "Your profile sync was queued for delivery" });
      }
      return res.json({ success: true, status: "success", message: "Your profile was synced with ConcordiaCare" });
    } catch {
      return res.status(503).json({ success: false, status: "unavailable", message: "ConcordiaCare sync is temporarily unavailable" });
    }
  });

  // Prescription routes (patient)
  app.get("/api/prescriptions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const prescriptions = await storage.getPrescriptionsByUserId(userId);
      res.json(prescriptions);
    } catch (error) {
      console.error("Error fetching prescriptions:", error);
      res.status(500).json({ message: "Failed to fetch prescriptions" });
    }
  });

  app.post("/api/prescriptions/refill", isAuthenticated, async (req: any, res) => {
    try {
      const idempotencyKey = normalizeIdempotencyKey(req.header("Idempotency-Key"));
      if (!idempotencyKey) {
        return res.status(400).json({ message: "A valid Idempotency-Key header is required" });
      }
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      
      // Validate request body with Zod
      const { prescriptionId, priority, notes } = z.object({
        prescriptionId: z.string().uuid(),
        priority: z.enum(["normal", "urgent"]).optional().default("normal"),
        notes: z.string().optional(),
      }).parse(req.body);

      const prescription = await storage.getPrescription(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ message: "Prescription not found" });
      }

      if (prescription.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      if (prescription.refillsRemaining <= 0) {
        return res.status(400).json({ message: "No refills remaining" });
      }
      const idempotency = await claimRequest(`patient-refill:${userId}`, idempotencyKey, { prescriptionId, priority, notes });
      if (idempotency?.kind === "mismatch") {
        return res.status(409).json({ message: "Idempotency-Key was already used with a different request", correlationId: idempotency.correlationId });
      }
      if (idempotency?.kind === "duplicate") return res.status(idempotency.statusCode).json(idempotency.body);

      // Determine if this is a caregiver request
      const isCaregiver = (req.session as any)?.attendantId !== undefined;
      const attendantId = (req.session as any)?.attendantId;

      await storage.updatePrescriptionStatus(prescriptionId, "pending_refill");
      
      // Create urgent refill request record for admin dashboard
      await storage.createUrgentRefillRequest({
        prescriptionId,
        patientId: userId,
        requestedBy: isCaregiver ? String(attendantId) : userId,
        requestedByType: isCaregiver ? "caregiver" : "patient",
        priority: priority || "normal",
        notes: notes || undefined,
      });

       const responseBody = { message: "Refill request submitted successfully", correlationId: idempotency?.correlationId };
       await completeRequest(`patient-refill:${userId}`, idempotencyKey, 200, responseBody);
       res.json(responseBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error requesting refill:", error);
      res.status(500).json({ message: "Failed to request refill" });
    }
  });

  // Product routes
  app.get("/api/products", isAuthenticated, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await reconcileStaffCatalog();
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Admin product routes
  app.post("/api/admin/products", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validated);
      res.json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/admin/products/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      
      // Validate price if present - ensure it's a positive number
      const updateSchema = insertProductSchema.partial().extend({
        price: z.string()
          .regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid decimal number")
          .refine((val) => parseFloat(val) > 0, "Price must be greater than 0")
          .optional(),
      });
      
      const validated = updateSchema.parse(req.body);
      // Fetch current state before update to detect false→true inStock transitions
      const prevProduct = await storage.getProduct(id).catch(() => null);
      const updated = await storage.updateProduct(id, validated);
      
      if (!updated) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Notify public SSE clients of the product change
      if (updated.status === "active" && !updated.requiresPrescription) {
        broadcastPublicSSE("product_updated", {
          id: updated.id,
          name: updated.name,
          price: updated.price,
          stockQuantity: updated.stockQuantity,
          inStock: updated.inStock,
          category: updated.category,
        });
        // Fire restock notifications only on a false→true inStock transition
        if (updated.inStock && prevProduct && !prevProduct.inStock) {
          fireRestockNotifications(updated.id, updated.category, updated.name).catch(() => {});
        }
      } else if (updated.status !== "active") {
        broadcastPublicSSE("product_hidden", { id: updated.id });
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete("/api/admin/products/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      await db.delete(cartItems).where(eq(cartItems.productId, id));
      await db.delete(orderItems).where(eq(orderItems.productId, id));
      await storage.deleteProduct(id);
      broadcastPublicSSE("product_deleted", { id });
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product ID", errors: error.errors });
      }
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Bulk import products from CSV
  app.post("/api/admin/products/bulk-import", isAuthenticated, isAdmin, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString("utf-8");
      const lines = csvContent.split("\n").filter((line: string) => line.trim());
      
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file must have a header row and at least one data row" });
      }

      const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase());
      const requiredHeaders = ["name", "price", "category"];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        return res.status(400).json({ 
          message: `Missing required columns: ${missingHeaders.join(", ")}. Required: name, price, category` 
        });
      }

      const products: any[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v: string) => v.trim().replace(/^["']|["']$/g, ""));
        
        if (values.length < headers.length) {
          errors.push(`Row ${i + 1}: Not enough columns`);
          continue;
        }

        const row: any = {};
        headers.forEach((header: string, idx: number) => {
          row[header] = values[idx];
        });

        if (!row.name || !row.price || !row.category) {
          errors.push(`Row ${i + 1}: Missing required fields (name, price, or category)`);
          continue;
        }

        const price = parseFloat(row.price);
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${i + 1}: Invalid price "${row.price}"`);
          continue;
        }

        const category = row.category.toLowerCase().trim();
        if (!category || category.length < 2) {
          errors.push(`Row ${i + 1}: Category "${row.category}" is too short or empty`);
          continue;
        }

        products.push({
          name: row.name,
          description: row.description || null,
          price: price.toFixed(2),
          category,
          stockQuantity: parseInt(row.stockquantity || row.stock || "0") || 0,
          stockThreshold: parseInt(row.stockthreshold || row.threshold || "10") || 10,
          imageUrl: row.imageurl || row.image || null,
          ndc: row.ndc || null,
          inStock: true,
          requiresPrescription: ["rx", "weight-management", "diabetes", "heart-vitality", "mens-womens-health"].includes(category),
        });
      }

      if (products.length === 0) {
        return res.status(400).json({ 
          message: "No valid products found in CSV",
          errors 
        });
      }

      // Insert products as drafts for review before going live
      const batchId = `csv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const sourceLabel = req.file.originalname || "CSV upload";
      let created = 0;
      for (const product of products) {
        try {
          await storage.createProduct({
            ...product,
            status: "draft",
            importBatchId: batchId,
            importSource: sourceLabel,
            showOnWebsite: false,
            showInApp: false,
            inStock: false,
          });
          created++;
        } catch (err) {
          errors.push(`Failed to create "${product.name}": ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      res.json({
        message: `${created} product(s) added to the review queue. Approve them in the Pending Review tab to publish.`,
        created,
        total: products.length,
        batchId,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Error bulk importing products:", error);
      res.status(500).json({ message: "Failed to import products" });
    }
  });

  // Products below threshold for reorder list
  app.get("/api/admin/products/below-threshold", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const products = await storage.getProductsBelowThreshold();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products below threshold:", error);
      res.status(500).json({ message: "Failed to fetch products below threshold" });
    }
  });

  // One-shot endpoint: re-activates staff-synced products that have stock but
  // were hidden because the staff app returned an empty catalog during a poll.
  // Safe to call multiple times — only touches inactive products with in_stock=true.
  app.post("/api/admin/products/restore-synced", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        UPDATE products
        SET status = 'active', show_on_website = true
        WHERE external_id IS NOT NULL
          AND in_stock = true
          AND stock_quantity > 0
          AND status = 'inactive'
      `);
      const count = (result as any).rowCount ?? (result as any).count ?? 0;
      console.log(`[Admin] restore-synced: re-activated ${count} products`);
      res.json({ restored: count, message: `Re-activated ${count} staff-synced product(s)` });
    } catch (error) {
      console.error("Error restoring synced products:", error);
      res.status(500).json({ message: "Failed to restore products" });
    }
  });

  // Product sales analysis endpoint
  app.get("/api/admin/products/sales-analysis", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const salesData = await storage.getProductSalesAnalysis();
      res.json(salesData);
    } catch (error) {
      console.error("Error fetching sales analysis:", error);
      res.status(500).json({ message: "Failed to fetch sales analysis" });
    }
  });

  // ==========================================
  // DRAFT PRODUCT WORKFLOW (Task #163)
  // ==========================================

  // Get all draft products pending review
  app.get("/api/admin/products/drafts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const drafts = await storage.getDraftProducts();
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching draft products:", error);
      res.status(500).json({ message: "Failed to fetch draft products" });
    }
  });

  // Shared helper: trigger immediate ConcordiaCare product sync, queue to outbox on failure.
  // /api/external/sync-products is the ConcordiaCare endpoint for a full product catalog refresh.
  async function triggerProductSync(): Promise<"synced" | "queued" | "skipped"> {
    const config = getConcordiaCareConfig();
    if (!config) return "skipped";
    const endpoint = `${config.baseUrl}/api/external/sync-products`;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) return "synced";
      if (isPermanentConcordiaCareAuthFailure(resp.status)) {
        console.error(`[ProductPublish] ConcordiaCare authentication failed (${resp.status}); verify the shared integration secret`);
        return "skipped";
      }
      await queueToOutbox(endpoint, "POST", {});
      return "queued";
    } catch (err) {
      console.error("[ProductPublish] Sync failed, queuing for retry:", err instanceof Error ? err.message : err);
      await queueToOutbox(endpoint, "POST", {});
      return "queued";
    }
  }

  // Publish a single draft product (set active + sync mobile)
  app.post("/api/admin/products/:id/publish", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const count = await storage.publishDraftProducts([id]);
      if (count === 0) {
        return res.status(404).json({ message: "Draft product not found" });
      }
      const syncStatus = await triggerProductSync();
      res.json({ success: true, published: count, syncStatus });
      void pingIndexNow(["https://concordianyc.com/shop"]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      console.error("Error publishing draft product:", error);
      res.status(500).json({ message: "Failed to publish product" });
    }
  });

  // Publish all (or a filtered batch of) draft products + trigger mobile sync.
  // Supports filtering by importBatchId (canonical batch key) or explicit ids array.
  app.post("/api/admin/products/publish-all-drafts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ids, importBatchId } = z.object({
        ids: z.array(z.string().uuid()).optional(),
        importBatchId: z.string().optional(),
      }).parse(req.body);
      const count = await storage.publishDraftProducts(ids, importBatchId);
      const syncStatus = count > 0 ? await triggerProductSync() : "skipped";
      const syncMsg = syncStatus === "synced" ? " Mobile app synced." : syncStatus === "queued" ? " Mobile sync queued for retry." : "";
      res.json({ success: true, published: count, syncStatus, message: `${count} product(s) published.${syncMsg}` });
      if (count > 0) void pingIndexNow(["https://concordianyc.com/shop"]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request body", errors: error.errors });
      }
      console.error("Error publishing all drafts:", error);
      res.status(500).json({ message: "Failed to publish draft products" });
    }
  });

  // Alias: publish-batch (canonical spec route) → same as publish-all-drafts.
  // Accepts importBatchId to target a specific import batch, or ids for explicit product selection.
  app.post("/api/admin/products/publish-batch", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const body = z.object({
        ids: z.array(z.string().uuid()).optional(),
        importBatchId: z.string().optional(),
      }).parse(req.body);
      const count = await storage.publishDraftProducts(body.ids, body.importBatchId);
      const syncStatus = count > 0 ? await triggerProductSync() : "skipped";
      const syncMsg = syncStatus === "synced" ? " Mobile app synced." : syncStatus === "queued" ? " Mobile sync queued for retry." : "";
      res.json({ success: true, published: count, syncStatus, message: `${count} product(s) published.${syncMsg}` });
      if (count > 0) void pingIndexNow(["https://concordianyc.com/shop"]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request body", errors: error.errors });
      }
      console.error("Error publishing batch:", error);
      res.status(500).json({ message: "Failed to publish batch" });
    }
  });

  // Export inventory as CSV or PDF
  app.get("/api/admin/products/export", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "csv";
      const allProducts = await storage.getAllProducts();
      // Export only published/live products: explicit status=active and visible on at least one channel
      const active = allProducts.filter((p: any) => p.status === "active" && (p.showOnWebsite || p.showInApp));

      if (format === "pdf") {
        const PDFDocument = (await import("pdfkit")).default;
        const doc = new PDFDocument({ margin: 40, size: "LETTER" });
        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="concordia-inventory-${dateStr}.pdf"`);
        doc.pipe(res);

        // Title
        doc.fontSize(18).font("Helvetica-Bold").text("Concordia Pharmacy", { align: "center" });
        doc.fontSize(12).font("Helvetica").text("Inventory Export Report", { align: "center" });
        doc.fontSize(9).fillColor("#666").text(`Generated: ${new Date().toLocaleString()}  |  Total products: ${active.length}`, { align: "center" });
        doc.fillColor("#000").moveDown(1);

        // Table header
        const colX = [40, 240, 310, 380, 440];
        const colW = [195, 65, 65, 55, 80];
        const headers = ["Product Name", "Category", "Price", "Stock", "NDC"];
        doc.fontSize(9).font("Helvetica-Bold");
        headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: colW[i], continued: i < headers.length - 1 }));
        doc.moveDown(0.3);
        doc.moveTo(40, doc.y).lineTo(520, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.3);

        // Rows
        doc.font("Helvetica").fontSize(8);
        for (const p of active) {
          if (doc.y > 700) { doc.addPage(); }
          const y = doc.y;
          doc.text(p.name.substring(0, 38), colX[0], y, { width: colW[0] });
          doc.text(p.category, colX[1], y, { width: colW[1] });
          doc.text(`$${p.price}`, colX[2], y, { width: colW[2] });
          doc.text(String(p.stockQuantity), colX[3], y, { width: colW[3] });
          doc.text(p.ndc || "—", colX[4], y, { width: colW[4] });
          doc.moveDown(0.6);
        }

        doc.end();
        return;
      }

      // Default: CSV
      const rows = [
        "name,price,category,description,stockQuantity,stockThreshold,ndc,inStock,showOnWebsite,showInApp",
        ...active.map((p: any) => [
          `"${(p.name || "").replace(/"/g, '""')}"`,
          p.price,
          p.category,
          `"${(p.description || "").replace(/"/g, '""')}"`,
          p.stockQuantity,
          p.stockThreshold,
          p.ndc || "",
          p.inStock ? "true" : "false",
          p.showOnWebsite ? "true" : "false",
          p.showInApp ? "true" : "false",
        ].join(",")),
      ];
      const csv = rows.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="concordia-inventory-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    } catch (error) {
      console.error("Error exporting products:", error);
      res.status(500).json({ message: "Failed to export products" });
    }
  });

  // Low stock products for real-time inventory sync
  app.get("/api/admin/inventory/low-stock", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const lowStockProducts = await storage.getLowStockProducts();
      res.json(lowStockProducts);
    } catch (error) {
      console.error("Error fetching low stock products:", error);
      res.status(500).json({ message: "Failed to fetch low stock products" });
    }
  });

  // Vendor management routes
  app.get("/api/admin/vendors", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const vendorsList = await storage.getAllVendors();
      res.json(vendorsList);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.post("/api/admin/vendors", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validatedData = z.object({
        name: z.string().min(1),
        code: z.enum(["mckesson", "kinray", "smart_source", "master", "integralrx", "other"]),
        accountNumber: z.string().optional(),
        apiEndpoint: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      const vendor = await storage.createVendor(validatedData);
      res.status(201).json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vendor data", errors: error.errors });
      }
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.patch("/api/admin/vendors/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const updates = z.object({
        name: z.string().min(1).optional(),
        accountNumber: z.string().optional(),
        apiEndpoint: z.string().optional(),
        isActive: z.boolean().optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      const vendor = await storage.updateVendor(id, updates);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating vendor:", error);
      res.status(500).json({ message: "Failed to update vendor" });
    }
  });

  // Vendor price comparison by NDC
  app.get("/api/admin/vendor-prices/:ndc", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ndc } = z.object({ ndc: z.string().min(8).max(14) }).parse(req.params);
      const prices = await storage.getVendorPricesByNdc(ndc);
      res.json(prices);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid NDC/barcode format (must be 8-14 characters)", errors: error.errors });
      }
      console.error("Error fetching vendor prices:", error);
      res.status(500).json({ message: "Failed to fetch vendor prices" });
    }
  });

  // Reorder items routes
  app.get("/api/admin/reorder-items", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const items = await storage.getReorderItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching reorder items:", error);
      res.status(500).json({ message: "Failed to fetch reorder items" });
    }
  });

  app.post("/api/admin/reorder-items", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validatedData = z.object({
        productId: z.string().min(1),
        ndc: z.string().optional(),
        quantityNeeded: z.number().int().positive(),
        preferredVendor: z.enum(["mckesson", "kinray", "smart_source", "master", "integralrx", "other"]).optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      const item = await storage.createReorderItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating reorder item:", error);
      res.status(500).json({ message: "Failed to create reorder item" });
    }
  });

  app.patch("/api/admin/reorder-items/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const updates = z.object({
        quantityNeeded: z.number().int().positive().optional(),
        preferredVendor: z.enum(["mckesson", "kinray", "smart_source", "master", "integralrx", "other"]).optional(),
        status: z.string().optional(),
        orderedFrom: z.enum(["mckesson", "kinray", "smart_source", "master", "integralrx", "other"]).optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      const item = await storage.updateReorderItem(id, updates);
      if (!item) {
        return res.status(404).json({ message: "Reorder item not found" });
      }
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating reorder item:", error);
      res.status(500).json({ message: "Failed to update reorder item" });
    }
  });

  app.delete("/api/admin/reorder-items/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      await storage.deleteReorderItem(id);
      res.json({ message: "Reorder item deleted successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid ID", errors: error.errors });
      }
      console.error("Error deleting reorder item:", error);
      res.status(500).json({ message: "Failed to delete reorder item" });
    }
  });

  // Cart routes
  app.get("/api/cart", isAuthenticated, async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const visible = new Set((await getStaffShopProducts()).map(p => p.id));
      const cartItems = await storage.getCartItemsByUserId(userId);
      res.json(cartItems.map(item => item.product && !visible.has(item.product.id)
        ? { ...item, product: { ...item.product, inStock: false, stockQuantity: 0, showOnWebsite: false } }
        : item));
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      
      // Validate request body with Zod
      const validatedData = insertCartItemSchema.extend({
        quantity: z.number().int().positive().min(1),
      }).parse({
        ...req.body,
        userId,
      });

      if (!validatedData.productId) {
        return res.status(400).json({ message: "Product ID is required" });
      }
      
      const product = (await getStaffShopProducts()).find(p => p.id === validatedData.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!product.inStock) {
        return res.status(400).json({ message: "Product is out of stock" });
      }

      const availableQuantity = getAvailableProductQuantity(product);
      const existingCartItems = await storage.getCartItemsByUserId(userId);
      const existingQuantity =
        existingCartItems.find(
          (item) =>
            item.itemType === "product" &&
            item.productId === validatedData.productId,
        )?.quantity ?? 0;
      const requestedTotal = existingQuantity + validatedData.quantity;

      if (requestedTotal > availableQuantity) {
        return res.status(400).json({
          message:
            existingQuantity > 0
              ? `Only ${availableQuantity} available; you already have ${existingQuantity} in your cart`
              : `Only ${availableQuantity} available`,
        });
      }

      const cartItem = await storage.addToCart(validatedData);
      
      res.json(cartItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error adding to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Add prescription to cart (hybrid cart)
  app.post("/api/cart/prescription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      
      // Validate request body
      const { prescriptionId, copayAmount } = z.object({
        prescriptionId: z.string().uuid(),
        copayAmount: z.string().optional(),
      }).parse(req.body);

      // Verify prescription exists and belongs to user
      const prescription = await storage.getPrescription(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ message: "Prescription not found" });
      }

      if (prescription.userId !== userId) {
        return res.status(403).json({ message: "You can only add your own prescriptions to cart" });
      }

      // Check if prescription is refillable
      if (prescription.status !== 'active' || prescription.refillsRemaining <= 0) {
        return res.status(400).json({ message: "This prescription is not available for refill" });
      }

      const cartItem = await storage.addPrescriptionToCart(userId, prescriptionId, copayAmount);
      
      res.json(cartItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error adding prescription to cart:", error);
      res.status(500).json({ message: "Failed to add prescription to cart" });
    }
  });

  app.patch("/api/cart/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      // Validate ID parameter
      const { id } = z.object({
        id: z.string().uuid(),
      }).parse(req.params);
      
      // Validate quantity with Zod
      const { quantity } = z.object({
        quantity: z.number().int().positive().min(1),
      }).parse(req.body);

      const userCartItems = await storage.getCartItemsByUserId(userId);
      const cartItem = userCartItems.find((item) => item.id === id);
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }

      if (cartItem.itemType === "product") {
        if (!cartItem.product) {
          return res.status(404).json({ message: "Product not found" });
        }
        const availableQuantity = getAvailableProductQuantity(cartItem.product);
        if (availableQuantity <= 0) {
          return res.status(400).json({ message: "Product is out of stock" });
        }
        if (quantity > availableQuantity) {
          return res.status(400).json({
            message: `Only ${availableQuantity} available`,
          });
        }
      }

      const updated = await storage.updateCartItemQuantity(id, quantity);
      if (!updated) {
        return res.status(404).json({ message: "Cart item not found" });
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      
      // Validate ID parameter
      const { id } = z.object({
        id: z.string().uuid(),
      }).parse(req.params);
      
      // Verify item exists and belongs to user
      const cartItems = await storage.getCartItemsByUserId(userId);
      const itemExists = cartItems.some(item => item.id === id);
      
      if (!itemExists) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      await storage.removeFromCart(id);
      res.json({ message: "Item removed from cart" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  const verifiedAddressSelectionSchema = z.object({
    label: z.string().min(1),
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().regex(/^\d{5}$/),
    lat: z.number().finite().min(-90).max(90),
    lon: z.number().finite().min(-180).max(180),
    osmType: z.string().optional(),
    osmId: z.number().finite().optional(),
  });

  // Online checkout is disabled. Keep a deliberate failure instead of creating unpaid orders.
  registerShopOrderRequests(app, isAuthenticated, getPatientId, (orderId) => {
    broadcastUpdate("orders", { type: "new_order_request", orderId });
  });

  app.post("/api/checkout", isAuthenticated, (_req, res) => {
    return res.status(503).json({ message: "Online checkout is unavailable. Your cart is saved; contact the pharmacy for help." });
  });

  // Mixed requests deliberately create two independent destination submissions.
  // This endpoint is the only path allowed to combine an owned prescription
  // selection with OTC catalog products.
  app.post("/api/mixed-request", isAuthenticated, async (req: any, res) => {
    const userId = getPatientId(req);
    if (!userId) return res.status(401).json({ message: "Patient authentication required" });
    const parsed = z.object({
      prescriptionIds: z.array(z.string().min(1)).max(20).optional().default([]),
      products: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(100) })).max(50).optional().default([]),
      deliveryMethod: z.enum(["pickup", "delivery"]).default("pickup"),
      shippingAddress: z.string().optional(),
      shippingAddressUnit: z.string().trim().max(100).optional(),
      shippingAddressVerification: verifiedAddressSelectionSchema.optional(),
      pickupSlot: z.string().trim().max(100).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid mixed request", errors: parsed.error.errors });
    if (parsed.data.deliveryMethod === "delivery") {
      const addressVerification = await verifyDeliveryAddress(
        parsed.data.shippingAddress,
        parsed.data.shippingAddressVerification,
      );
      if (!addressVerification.valid) return res.status(400).json({ message: addressVerification.message });
    }
    const key = normalizeIdempotencyKey(String(req.get("Idempotency-Key") || ""));
    if (!key) return res.status(400).json({ message: "A valid Idempotency-Key header is required" });
    const claim = await claimRequest(`mixed-request:${userId}`, key, parsed.data);
    if (!claim) return res.status(400).json({ message: "Invalid idempotency key" });
    if (claim.kind === "mismatch") return res.status(409).json({ message: "Idempotency key was already used for different request", correlationId: claim.correlationId });
    if (claim.kind === "duplicate") return res.status(claim.statusCode).json(claim.body);
    const result = await processMixedRequest(userId, parsed.data, storage, claim.correlationId);
    if (!result.ok) {
      const body = { message: result.message, correlationId: claim.correlationId };
      await completeRequest(`mixed-request:${userId}`, key, result.status, body);
      return res.status(result.status).json(body);
    }
    const body = {
      correlationId: result.correlationId,
      pharmacyRequest: result.pharmacyRequest,
      groceryRequest: result.groceryRequest,
      order: result.order,
    };
    const status = result.pharmacyRequest === "integration_failed" || result.groceryRequest === "integration_failed" ? 502 : 202;
    await completeRequest(`mixed-request:${userId}`, key, status, body);
    return res.status(status).json(body);
  });

  // Rate limiter for guest checkout (prevent abuse)
  const guestCheckoutRateLimiter = new Map<string, { count: number; resetTime: number }>();
  const GUEST_CHECKOUT_RATE_LIMIT = 5;
  const GUEST_CHECKOUT_RATE_WINDOW = 60 * 60 * 1000; // 1 hour

  // Guest Express Checkout (no auth required — OTC items only)
  app.post("/api/checkout/guest", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const rateRecord = guestCheckoutRateLimiter.get(clientIp);
      if (rateRecord && now < rateRecord.resetTime) {
        if (rateRecord.count >= GUEST_CHECKOUT_RATE_LIMIT) {
          return res.status(429).json({ message: "Too many checkout attempts. Please try again later." });
        }
        rateRecord.count++;
      } else {
        guestCheckoutRateLimiter.set(clientIp, { count: 1, resetTime: now + GUEST_CHECKOUT_RATE_WINDOW });
      }

      const body = z.object({
        items: z.array(z.object({
          productId: z.string(),
          quantity: z.number().int().positive(),
        })).min(1),
        guestName: z.string().min(2),
        guestPhone: shopPhoneSchema,
        guestEmail: z.preprocess(
          (v) => (typeof v === "string" ? v.trim() || undefined : v == null ? undefined : v),
          z.string().email().optional()
        ),
        deliveryMethod: z.enum(["pickup", "delivery"]),
        shippingAddress: z.string().optional(),
        shippingAddressUnit: z.string().trim().max(100).optional(),
        shippingAddressVerification: verifiedAddressSelectionSchema.optional(),
        paymentMethod: z.enum(["apple_pay", "google_pay", "credit_card", "cash"]),
        notes: z.string().optional(),
      }).refine(
        (data) =>
          data.deliveryMethod !== "delivery" ||
          Boolean(data.shippingAddress && data.shippingAddressVerification),
        {
          message: "Select a verified delivery address from the map suggestions",
          path: ["shippingAddress"],
        }
      ).parse(req.body);

      if (body.paymentMethod !== "cash") {
        return res.status(503).json({ message: "Online payments are unavailable. Submit an unpaid pickup or delivery request." });
      }

      const guestIdempotencyKey = normalizeIdempotencyKey(
        String(req.get("Idempotency-Key") || req.get("X-Idempotency-Key") || "")
      );
      if (!guestIdempotencyKey) {
        return res.status(400).json({ message: "A valid Idempotency-Key header is required" });
      }
      // Modern random keys survive IP changes; leave legacy uncertain keys in
      // their original scope instead of migrating/replaying historical requests.
      const guestScope = guestIdempotencyKey.startsWith("shop-request-")
        ? "guest-shop-request" : `guest-checkout:${clientIp}`;
      let guestCorrelationId: string | null = null;
      {
        const claim = await claimRequest(guestScope, guestIdempotencyKey, body);
        if (!claim) return res.status(400).json({ message: "Invalid idempotency key" });
        guestCorrelationId = claim.correlationId;
        if (claim.kind === "mismatch") {
          return res.status(409).json({ message: "Idempotency key was already used for different checkout data", correlationId: claim.correlationId });
        }
        if (claim.kind === "duplicate") return res.status(claim.statusCode).json(claim.body);
      }
      const result = await processGuestCheckout({
        items: body.items,
        guestName: body.guestName,
        guestPhone: body.guestPhone,
        guestEmail: body.guestEmail || null,
        deliveryMethod: body.deliveryMethod,
        shippingAddress: body.shippingAddress || null,
        shippingAddressUnit: body.shippingAddressUnit || null,
        shippingAddressVerification: body.shippingAddressVerification || null,
        paymentMethod: body.paymentMethod,
        notes: body.notes || null,
        correlationId: guestCorrelationId,
      }, storage);

      if (!result.ok) {
        if (guestIdempotencyKey) {
          await releaseUncompletedRequest(guestScope, guestIdempotencyKey);
        }
        return res.status(result.status).json({ message: result.message });
      }

      const { order, orderNumber, subtotal } = result;

      await logAudit({
        req,
        actionType: "create",
        entityType: "order",
        entityId: order.id,
        newValue: { orderNumber, type: "otc_guest", total: subtotal, guestEmail: body.guestEmail },
      });

      broadcastUpdate("orders", { type: "new_order", order: { ...order, isGuest: true } });

      // Create a pharmacy alert so the staff app sees this order on its next /api/external/alerts poll
      storage.createPharmacyAlert({
        title: "New Web Order Request",
        message: `Order ${orderNumber} [correlation:${guestCorrelationId || "none"}] from ${body.guestName} \u00b7 ${body.items.length} item(s) \u00b7 ${body.deliveryMethod} \u00b7 ${body.paymentMethod}`,
        type: "info",
        priority: "high",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).catch((err: unknown) => console.error("[order-alert] guest checkout alert failed:", err instanceof Error ? err.message : err));

      const guestResponse = {
        message: result.staffHandoff === "confirmed"
          ? "Order request saved; Staff acknowledged receipt only. Stock is not reserved or guaranteed. No payment has been taken. Wait for pickup confirmation."
          : "Order request saved. Staff receipt needs confirmation. No payment has been taken. Do not submit it again; contact the pharmacy with your request number.",
        requestOnly: true,
        reservationStatus: "unverified",
        paymentStatus: order.paymentStatus,
        staffHandoff: result.staffHandoff,
        orderNumber: order.orderNumber,
        orderId: order.id,
        deliveryMethod: body.deliveryMethod,
        shippingAddress: order.shippingAddress,
        paymentMethod: body.paymentMethod,
        correlationId: guestCorrelationId,
      };
      if (guestIdempotencyKey) {
        await completeRequest(guestScope, guestIdempotencyKey, 200, guestResponse);
      }
      res.json(guestResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error during guest checkout:", error);
      res.status(500).json({ message: "Failed to process checkout" });
    }
  });

  app.get("/api/checkout/payment-status/:checkoutId", (_req, res) => {
    return res.status(410).json({ message: "Online checkout is no longer available." });
  });

  // 4th-Month Loyalty Milestone Status
  app.get("/api/loyalty/milestone-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const createdAt = user.createdAt ? new Date(user.createdAt) : null;
      if (!createdAt) {
        return res.json({ eligible: false, reason: "no_membership_date", monthsActive: 0, hasPrescriptions: false });
      }

      const now = new Date();
      const monthsDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());

      const prescriptionsList = await storage.getPrescriptionsByUserId(userId);
      const hasPrescriptions = prescriptionsList.length > 0;

      const eligible = monthsDiff >= 3 && hasPrescriptions;

      // One-time milestone — deterministic idempotency key check
      const alreadyClaimed = await storage.checkIdempotencyKey(`milestone_4th_month_${userId}`);

      res.json({
        eligible: eligible && !alreadyClaimed,
        monthsActive: monthsDiff,
        hasPrescriptions,
        alreadyClaimed,
        rewards: eligible && !alreadyClaimed ? [
          { type: "free_item", label: "Free OTC Item (up to $15)", description: "Pick any OTC item up to $15 — on us" },
          { type: "discount_10", label: "10% Off Next Order", description: "Get 10% off your next purchase" },
        ] : [],
      });
    } catch (error) {
      console.error("Error checking milestone status:", error);
      res.status(500).json({ message: "Failed to check milestone status" });
    }
  });

  // Claim 4th-month loyalty reward
  app.post("/api/loyalty/milestone-claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { rewardType } = z.object({
        rewardType: z.enum(["free_item", "discount_10"]),
      }).parse(req.body);

      const user = await storage.getUser(userId);
      if (!user || !user.createdAt) {
        return res.status(400).json({ message: "Ineligible for milestone reward" });
      }

      const now = new Date();
      const createdAt = new Date(user.createdAt);
      const monthsDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());

      if (monthsDiff < 3) {
        return res.status(400).json({ message: "You need at least 3 months of membership to claim this reward" });
      }

      const prescriptionsList = await storage.getPrescriptionsByUserId(userId);
      if (prescriptionsList.length === 0) {
        return res.status(400).json({ message: "At least one prescription on file is required" });
      }

      // One-time milestone — deterministic idempotency key check
      const alreadyClaimed = await storage.checkIdempotencyKey(`milestone_4th_month_${userId}`);
      if (alreadyClaimed) {
        return res.status(400).json({ message: "You have already claimed your 4th-month milestone reward" });
      }

      const bonusPoints = rewardType === "free_item" ? 1500 : 500;
      const description = rewardType === "free_item"
        ? "4th-month milestone: Free OTC item (up to $15)"
        : "4th-month milestone: 10% off next order";

      const awardResult = await PointsService.awardPoints({
        userId,
        actionType: "membership_milestone",
        points: bonusPoints,
        description,
        referenceType: "milestone",
        referenceId: `milestone_4th_month`,
        metadata: { rewardType },
        idempotencyKey: `milestone_4th_month_${userId}`,
      });

      if (!awardResult) {
        return res.status(409).json({ message: "Milestone reward was already claimed (duplicate)" });
      }

      await logAudit({
        req,
        actionType: "create",
        entityType: "reward",
        entityId: userId,
        newValue: { action: "milestone_claim", rewardType, bonusPoints },
      });

      res.json({
        message: "Milestone reward claimed successfully!",
        rewardType,
        bonusPoints,
        description,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error claiming milestone:", error);
      res.status(500).json({ message: "Failed to claim milestone reward" });
    }
  });

  // Admin: Get milestone-eligible patients
  app.get("/api/admin/milestone-eligible", isAdmin, async (req: any, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const now = new Date();
      const eligible: any[] = [];

      for (const user of allUsers) {
        if (!user.createdAt || user.role === "admin") continue;
        const createdAt = new Date(user.createdAt);
        const monthsDiff = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
        if (monthsDiff < 3) continue;

        const prescriptionsList = await storage.getPrescriptionsByUserId(user.id);
        if (prescriptionsList.length === 0) continue;

        const claimed = await storage.checkIdempotencyKey(`milestone_4th_month_${user.id}`);

        eligible.push({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phoneNumber,
          monthsActive: monthsDiff,
          prescriptionCount: prescriptionsList.length,
          claimed,
          memberSince: user.createdAt,
        });
      }

      res.json(eligible);
    } catch (error) {
      console.error("Error getting milestone eligible patients:", error);
      res.status(500).json({ message: "Failed to get milestone eligible patients" });
    }
  });

  // Order routes
  app.get("/api/orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const orders = await storage.getOrdersByUserId(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Loyalty routes
  app.get("/api/loyalty/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const transactions = await storage.getLoyaltyTransactionsByUserId(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching loyalty transactions:", error);
      res.status(500).json({ message: "Failed to fetch loyalty transactions" });
    }
  });

  // Admin routes
  app.get("/api/admin/prescriptions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const prescriptions = await storage.getAllPrescriptions();
      res.json(prescriptions);
    } catch (error) {
      console.error("Error fetching all prescriptions:", error);
      res.status(500).json({ message: "Failed to fetch prescriptions" });
    }
  });

  app.post("/api/admin/prescriptions/approve-refill", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Validate request body with Zod
      const { prescriptionId } = z.object({
        prescriptionId: z.string().uuid(),
      }).parse(req.body);

      const prescription = await storage.getPrescription(prescriptionId);
      if (!prescription) {
        return res.status(404).json({ message: "Prescription not found" });
      }

      if (prescription.status !== "pending_refill") {
        return res.status(400).json({ message: "Prescription is not pending refill" });
      }

      if (prescription.refillsRemaining <= 0) {
        return res.status(400).json({ message: "No refills remaining" });
      }

      // Update prescription
      await storage.updatePrescriptionStatus(prescriptionId, "active");

      res.json({ message: "Refill approved successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error approving refill:", error);
      res.status(500).json({ message: "Failed to approve refill" });
    }
  });

  // Update prescription workflow status
  app.patch("/api/admin/prescriptions/:id/workflow-status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Validate ID parameter
      const { id } = z.object({
        id: z.string().uuid(),
      }).parse(req.params);

      // Validate request body
      const { workflowStatus } = z.object({
        workflowStatus: z.enum(["received", "typing", "billing", "billed", "ready_for_delivery", "out_for_delivery", "delivered"]),
      }).parse(req.body);

      const prescription = await storage.getPrescription(id);
      if (!prescription) {
        return res.status(404).json({ message: "Prescription not found" });
      }

      await storage.updatePrescriptionWorkflowStatus(id, workflowStatus);

      // Log the status update
      await storage.createSyncLog({
        syncType: "status_update",
        primeRxId: prescription.primeRxId || undefined,
        prescriptionId: id,
        status: "success",
        syncData: { workflowStatus, updatedAt: new Date() },
      });

      // Push status to ConcordiaCare app (fire-and-forget)
      void (async () => {
        let patientEmail: string | null = null;
        let concordiaCareUserId: string | null = null;
        if (prescription.userId) {
          try {
            const patient = await storage.getUser(prescription.userId);
            patientEmail = patient?.email ?? null;
            concordiaCareUserId = patient?.concordiaCareUserId ?? null;
          } catch (_) {}
        }
        await pushRxStatusToApp({
          rxNumber: prescription.rxNumber,
          medicationName: prescription.medicationName,
          workflowStatus,
          queueName: prescription.queueName,
          patientEmail,
          concordiaCareUserId,
        });
      })();

      res.json({ message: "Workflow status updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating workflow status:", error);
      res.status(500).json({ message: "Failed to update workflow status" });
    }
  });

  // Get prescriptions by workflow status
  app.get("/api/admin/prescriptions/workflow/:status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { status } = req.params;
      const validStatuses = ["received", "typing", "billing", "billed", "ready_for_delivery", "out_for_delivery", "delivered"];
      
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid workflow status" });
      }

      const prescriptions = await storage.getPrescriptionsByWorkflowStatus(status);
      res.json(prescriptions);
    } catch (error) {
      console.error("Error fetching prescriptions by workflow status:", error);
      res.status(500).json({ message: "Failed to fetch prescriptions" });
    }
  });

  // Get prescriptions for a specific user (scoped, HIPAA-compliant)
  app.get("/api/admin/users/:id/prescriptions", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Validate user ID parameter (string, not UUID - Replit Auth uses sub claim as ID)
      const { id } = z.object({
        id: z.string().min(1),
      }).parse(req.params);

      // Verify user exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch prescriptions for this specific user
      const prescriptions = await storage.getPrescriptionsByUserId(id);

      // Audit log: Admin viewed patient PHI (HIPAA compliance)
      await logAudit({
        req,
        actionType: "view",
        entityType: "prescription",
        entityId: id,
        newValue: { 
          action: "view_patient_prescriptions",
          adminId: (req as any).user?.claims?.sub,
          adminEmail: (req as any).user?.claims?.email,
          patientId: id,
          patientEmail: user.email,
          viewedCount: prescriptions.length,
          purpose: "customer_profile_view",
          timestamp: new Date().toISOString(),
        },
      });

      res.json(prescriptions);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user ID", errors: error.errors });
      }
      console.error("Error fetching user prescriptions:", error);
      res.status(500).json({ message: "Failed to fetch prescriptions" });
    }
  });

  // Get orders for a specific user (scoped, HIPAA-compliant)
  app.get("/api/admin/users/:id/orders", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Validate user ID parameter (string, not UUID - Replit Auth uses sub claim as ID)
      const { id } = z.object({
        id: z.string().min(1),
      }).parse(req.params);

      // Verify user exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch orders for this specific user
      const orders = await storage.getOrdersByUserId(id);

      // Audit log: Admin viewed patient PHI (HIPAA compliance)
      await logAudit({
        req,
        actionType: "view",
        entityType: "order",
        entityId: id,
        newValue: { 
          action: "view_patient_orders",
          adminId: (req as any).user?.claims?.sub,
          adminEmail: (req as any).user?.claims?.email,
          patientId: id,
          patientEmail: user.email,
          viewedCount: orders.length,
          purpose: "customer_profile_view",
          timestamp: new Date().toISOString(),
        },
      });

      res.json(orders);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user ID", errors: error.errors });
      }
      console.error("Error fetching user orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get caregiver/home attendant for a specific patient (admin view)
  app.get("/api/admin/users/:id/attendant", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().min(1),
      }).parse(req.params);

      // Verify user exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch caregiver/attendant link for this patient
      const link = await storage.getPatientAttendant(id);

      // Audit log: Admin viewed patient caregiver contact (HIPAA compliance)
      await logAudit({
        req,
        actionType: "view",
        entityType: "caregiver_contact",
        entityId: id,
        newValue: { 
          action: "view_patient_caregiver",
          adminId: (req as any).user?.claims?.sub,
          adminEmail: (req as any).user?.claims?.email,
          patientId: id,
          patientEmail: user.email,
          hasCaregiver: !!link,
          purpose: "customer_profile_view",
          timestamp: new Date().toISOString(),
        },
      });

      if (!link) {
        return res.json({ hasAttendant: false });
      }

      res.json({
        hasAttendant: true,
        attendant: {
          id: link.attendant.id,
          firstName: link.attendant.firstName,
          lastName: link.attendant.lastName,
          phoneNumber: link.attendant.phoneNumber,
          email: link.attendant.email,
          agencyName: link.attendant.agencyName,
        },
        relationship: {
          relationshipType: link.relationshipType,
          linkedAt: link.createdAt,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user ID", errors: error.errors });
      }
      console.error("Error fetching user attendant:", error);
      res.status(500).json({ message: "Failed to fetch caregiver info" });
    }
  });

  // ===== SPECIALTY MEDICATIONS =====
  app.get("/api/specialty-medications", async (_req, res) => {
    try {
      const meds = await db.select().from(specialtyMedications).orderBy(specialtyMedications.name);
      res.json(meds);
    } catch (error) {
      console.error("Error fetching specialty medications:", error);
      res.status(500).json({ message: "Failed to fetch specialty medications" });
    }
  });

  app.get("/api/specialty-medications/search", async (req, res) => {
    try {
      const query = String(req.query.q || "").toLowerCase();
      if (!query || query.length < 2) return res.json([]);
      const allMeds = await db.select().from(specialtyMedications).orderBy(specialtyMedications.name);
      const filtered = allMeds.filter(m =>
        m.name.toLowerCase().includes(query) ||
        (m.genericName && m.genericName.toLowerCase().includes(query)) ||
        (m.brandName && m.brandName.toLowerCase().includes(query))
      );
      res.json(filtered);
    } catch (error) {
      console.error("Error searching specialty medications:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // ===== SPECIALTY FULFILLMENT REQUESTS =====
  const externalSpecialtyRequestSchema = z.object({
    externalRequestId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
    medicationId: z.number().int().positive().optional(),
    medicationName: z.string().trim().min(1).max(255),
    patientName: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(7).max(32),
    email: z.string().email().optional(),
    prescriberName: z.string().trim().min(1).max(255),
    requestType: z.enum(["new_prescription", "transfer", "e_script"]),
    notes: z.string().max(4000).optional(),
    patientId: z.string().trim().min(1).optional(),
    concordiaCareUserId: z.string().trim().min(1).optional(),
  });

  function requireConcordiaCareApiKey(req: Request, res: Response, next: NextFunction) {
    const expected = process.env.CONCORDIA_RX_API_KEY;
    if (!expected) return res.status(503).json({ message: "Mobile app connection is not configured" });
    const provided = req.header("X-API-KEY");
    if (!provided || provided !== expected) return res.status(401).json({ message: "Invalid or missing API key" });
    next();
  }

  function requireStaffAppApiKey(req: Request, res: Response, next: NextFunction) {
    const expected = process.env.STAFF_API_KEY;
    if (!expected) return res.status(503).json({ message: "Staff app connection is not configured" });
    const provided = req.header("X-API-KEY");
    if (!provided || provided !== expected) return res.status(401).json({ message: "Invalid or missing API key" });
    next();
  }

  async function createExternalSpecialtyRequest(
    req: Request,
    res: Response,
    source: "mobile_app" | "staff_app",
  ) {
    const parsed = externalSpecialtyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const input = parsed.data;
    if (source === "mobile_app" && !input.concordiaCareUserId) {
      return res.status(400).json({ message: "concordiaCareUserId is required for mobile requests" });
    }

    let patientId: string | null = null;
    if (source === "mobile_app") {
      const patient = await storage.getUserByConcordiaCareUserId(input.concordiaCareUserId!);
      if (!patient || patient.role !== "patient") return res.status(404).json({ message: "Patient link not found" });
      patientId = patient.id;
    } else if (input.patientId) {
      const patient = await storage.getUser(input.patientId);
      if (!patient || patient.role !== "patient") return res.status(404).json({ message: "Patient not found" });
      patientId = patient.id;
    }

    const requestFingerprint = fingerprintRequest(input);
    const correlationId = createHash("sha256")
      .update(`specialty-request:${source}:${input.externalRequestId}`)
      .digest("hex")
      .slice(0, 32);
    const [inserted] = await db
      .insert(specialtyFulfillmentRequests)
      .values({
        medicationId: input.medicationId,
        medicationName: input.medicationName,
        patientName: input.patientName,
        phone: input.phone,
        email: input.email,
        prescriberName: input.prescriberName,
        requestType: input.requestType,
        notes: input.notes,
        userId: patientId,
        source,
        externalRequestId: input.externalRequestId,
        requestFingerprint,
      })
      .onConflictDoNothing({
        target: [specialtyFulfillmentRequests.source, specialtyFulfillmentRequests.externalRequestId],
      })
      .returning();

    if (!inserted) {
      const [existing] = await db
        .select()
        .from(specialtyFulfillmentRequests)
        .where(and(
          eq(specialtyFulfillmentRequests.source, source),
          eq(specialtyFulfillmentRequests.externalRequestId, input.externalRequestId),
        ))
        .limit(1);
      if (!existing) return res.status(409).json({ message: "Request is already being processed", correlationId });
      if (existing.requestFingerprint !== requestFingerprint) {
        return res.status(409).json({
          message: "externalRequestId was already used with different request data",
          correlationId,
        });
      }
      return res.status(201).json({
        requestId: existing.id,
        externalRequestId: existing.externalRequestId,
        source: existing.source,
        status: existing.status,
        correlationId,
      });
    }

    const request = inserted;
    const body = {
      requestId: request.id,
      externalRequestId: request.externalRequestId,
      source: request.source,
      status: request.status,
      correlationId,
    };
    broadcastUpdate("specialty-requests", { type: "new", data: request });
    await storage.createPharmacyAlert({
      type: "specialty_request",
      title: `New specialty request from ${source === "mobile_app" ? "mobile" : "staff"} app`,
      message: `${request.patientName} requested ${request.medicationName} [id:${request.id}]`,
      priority: "high",
    }).catch(() => {});
    return res.status(201).json(body);
  }

  app.post("/api/specialty-fulfillment-requests", resolveUser, async (req: any, res) => {
    try {
      const parsed = insertSpecialtyFulfillmentRequestSchema.parse(req.body);
      const patientId = getPatientId(req);
      const data = {
        ...parsed,
        userId: patientId ?? null,
        source: "website",
        externalRequestId: null,
      };
      const [request] = await db.insert(specialtyFulfillmentRequests).values(data).returning();
      broadcastUpdate("specialty-requests", { type: "new", data: request });
      res.status(201).json(request);

      // Notify pharmacy team — fire-and-forget
      setImmediate(async () => {
        try {
          let emailRecipients: string[] = [];
          let smsRecipients: string[] = [];
          try {
            const dbRecipients = await storage.getNotificationRecipients("specialty_request");
            emailRecipients = dbRecipients.filter((r) => r.isActive && r.channel === "email").map((r) => r.address);
            smsRecipients = dbRecipients.filter((r) => r.isActive && r.channel === "sms").map((r) => r.address);
          } catch (_) {}
          if (emailRecipients.length === 0) {
            emailRecipients = (process.env.PHARMACY_TEAM_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
          }
          if (smsRecipients.length === 0) {
            smsRecipients = (process.env.PHARMACY_TEAM_SMS || "").split(",").map((s) => s.trim()).filter(Boolean);
          }

          const requestTypeLabel: Record<string, string> = {
            new_prescription: "New prescription",
            transfer: "Transfer",
            e_script: "E-script",
          };
          const rows: Array<[string, string]> = [
            ["Patient name", request.patientName],
            ["Phone", request.phone],
            ["Email", request.email || "—"],
            ["Medication", request.medicationName],
            ["Request type", requestTypeLabel[request.requestType] ?? request.requestType],
            ["Prescriber", request.prescriberName],
            ["Notes", request.notes || "—"],
            ["Request ID", String(request.id)],
          ];

          if (emailRecipients.length > 0) {
            const html = `
              <div style="font-family:Arial,sans-serif;color:#111;">
                <h2 style="margin:0 0 12px;">New specialty medication request</h2>
                <p style="margin:0 0 16px;">A patient submitted a specialty fulfillment request via the Concordia website.</p>
                <table style="border-collapse:collapse;font-size:14px;">
                  ${rows.map(([label, value]) => `
                    <tr>
                      <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td>
                      <td style="padding:6px 0;">${escapeHtml(String(value))}</td>
                    </tr>`).join("")}
                </table>
                <p style="margin-top:24px;color:#777;font-size:12px;">View the full record in Admin → Specialty Requests.</p>
              </div>`;
            const text = ["New specialty medication request", "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
            const result = await sendEmail({
              to: emailRecipients,
              subject: `New specialty request — ${request.patientName} (${request.medicationName})`,
              html,
              text,
              replyTo: request.email || undefined,
            });
            if (!result.ok) console.error("[SpecialtyRequest] sendEmail failed:", result.error);
          } else {
            console.warn("[SpecialtyRequest] No email recipients configured; skipping email");
          }

          if (smsRecipients.length > 0) {
            const smsBody = `New specialty request from ${request.patientName} (${request.phone}) for ${request.medicationName}. Type: ${requestTypeLabel[request.requestType] ?? request.requestType}. ID #${request.id}.`;
            const smsResult = await sendSms({ to: smsRecipients, body: smsBody });
            if (!smsResult.ok) console.error("[SpecialtyRequest] sendSms failed:", smsResult.error);
          }

          // Pharmacy alert for admin panel
          await storage.createPharmacyAlert({
            type: "specialty_request",
            title: "New specialty medication request",
            message: `${request.patientName} requested ${request.medicationName} (${requestTypeLabel[request.requestType] ?? request.requestType}) [id:${request.id}]`,
            priority: "high",
          }).catch(() => {});

        } catch (notifyErr) {
          console.error("[SpecialtyRequest] Notification error:", notifyErr);
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating fulfillment request:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  app.post("/api/external/mobile/specialty-requests", requireConcordiaCareApiKey, async (req, res) => {
    try {
      return await createExternalSpecialtyRequest(req, res, "mobile_app");
    } catch (error) {
      console.error("[SpecialtyRequest] Mobile intake failed:", error);
      return res.status(500).json({ message: "Failed to submit mobile specialty request" });
    }
  });

  app.get("/api/external/mobile/specialty-requests/:externalRequestId", requireConcordiaCareApiKey, async (req, res) => {
    const [request] = await db
      .select({
        requestId: specialtyFulfillmentRequests.id,
        externalRequestId: specialtyFulfillmentRequests.externalRequestId,
        status: specialtyFulfillmentRequests.status,
        assigned: sql<boolean>`${specialtyFulfillmentRequests.assignedToUserId} IS NOT NULL`,
        updatedAt: specialtyFulfillmentRequests.updatedAt,
      })
      .from(specialtyFulfillmentRequests)
      .where(and(
        eq(specialtyFulfillmentRequests.source, "mobile_app"),
        eq(specialtyFulfillmentRequests.externalRequestId, req.params.externalRequestId),
      ))
      .limit(1);
    if (!request) return res.status(404).json({ message: "Request not found" });
    return res.json(request);
  });

  app.post("/api/external/staff/specialty-requests", requireStaffAppApiKey, async (req, res) => {
    try {
      return await createExternalSpecialtyRequest(req, res, "staff_app");
    } catch (error) {
      console.error("[SpecialtyRequest] Staff intake failed:", error);
      return res.status(500).json({ message: "Failed to submit staff specialty request" });
    }
  });

  app.get("/api/external/staff/specialty-requests/:externalRequestId", requireStaffAppApiKey, async (req, res) => {
    const [request] = await db
      .select({
        requestId: specialtyFulfillmentRequests.id,
        externalRequestId: specialtyFulfillmentRequests.externalRequestId,
        status: specialtyFulfillmentRequests.status,
        assigned: sql<boolean>`${specialtyFulfillmentRequests.assignedToUserId} IS NOT NULL`,
        updatedAt: specialtyFulfillmentRequests.updatedAt,
      })
      .from(specialtyFulfillmentRequests)
      .where(and(
        eq(specialtyFulfillmentRequests.source, "staff_app"),
        eq(specialtyFulfillmentRequests.externalRequestId, req.params.externalRequestId),
      ))
      .limit(1);
    if (!request) return res.status(404).json({ message: "Request not found" });
    return res.json(request);
  });

  app.get("/api/specialty-fulfillment-requests/mine", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const requests = await db
        .select({
          id: specialtyFulfillmentRequests.id,
          medicationName: specialtyFulfillmentRequests.medicationName,
          requestType: specialtyFulfillmentRequests.requestType,
          status: specialtyFulfillmentRequests.status,
          createdAt: specialtyFulfillmentRequests.createdAt,
          updatedAt: specialtyFulfillmentRequests.updatedAt,
        })
        .from(specialtyFulfillmentRequests)
        .where(eq(specialtyFulfillmentRequests.userId, patientId))
        .orderBy(desc(specialtyFulfillmentRequests.createdAt));
      res.json(requests);
    } catch (error) {
      console.error("Error fetching patient specialty requests:", error);
      res.status(500).json({ message: "Failed to fetch specialty requests" });
    }
  });

  app.get("/api/admin/specialty-fulfillment-requests", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const requests = await db.select().from(specialtyFulfillmentRequests).orderBy(specialtyFulfillmentRequests.createdAt);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching fulfillment requests:", error);
      res.status(500).json({ message: "Failed to fetch requests" });
    }
  });

  app.patch("/api/admin/specialty-fulfillment-requests/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateSchema = z.object({
        status: z.enum(["pending", "in_review", "contacted", "completed", "cancelled"]).optional(),
        adminNotes: z.string().optional(),
      });
      const validated = updateSchema.parse(req.body);
      const adminId = (req as any).localUser?.id;
      if (!adminId) return res.status(401).json({ message: "Admin identity required" });
      const [existing] = await db
        .select({
          assignedToUserId: specialtyFulfillmentRequests.assignedToUserId,
        })
        .from(specialtyFulfillmentRequests)
        .where(eq(specialtyFulfillmentRequests.id, id))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Request not found" });
      if (!existing.assignedToUserId) {
        return res.status(409).json({ message: "Take this request before updating it" });
      }
      if (existing.assignedToUserId !== adminId) {
        return res.status(409).json({ message: "This request is assigned to another administrator" });
      }
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (validated.status) updates.status = validated.status;
      if (validated.adminNotes !== undefined) updates.adminNotes = validated.adminNotes;
      const [updated] = await db.update(specialtyFulfillmentRequests).set(updates).where(eq(specialtyFulfillmentRequests.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Request not found" });
      broadcastUpdate("specialty-requests", { type: "update", data: updated });
      res.json(updated);
      void pingIndexNow(["https://concordianyc.com/specialty"]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating fulfillment request:", error);
      res.status(500).json({ message: "Failed to update request" });
    }
  });

  app.post("/api/admin/specialty-fulfillment-requests/:id/take", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const requestId = z.coerce.number().int().positive().parse(req.params.id);
      const admin = req.localUser;
      if (!admin?.id) return res.status(401).json({ message: "Admin identity required" });
      const assignedToName = [admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.email || "Admin";
      const [claimed] = await db
        .update(specialtyFulfillmentRequests)
        .set({
          assignedToUserId: admin.id,
          assignedToName,
          claimedAt: new Date(),
          status: "in_review",
          updatedAt: new Date(),
        })
        .where(and(
          eq(specialtyFulfillmentRequests.id, requestId),
          or(
            isNull(specialtyFulfillmentRequests.assignedToUserId),
            eq(specialtyFulfillmentRequests.assignedToUserId, admin.id),
          ),
          or(
            eq(specialtyFulfillmentRequests.status, "pending"),
            eq(specialtyFulfillmentRequests.status, "in_review"),
          ),
        ))
        .returning();
      if (!claimed) {
        const [existing] = await db
          .select({
            assignedToName: specialtyFulfillmentRequests.assignedToName,
          })
          .from(specialtyFulfillmentRequests)
          .where(eq(specialtyFulfillmentRequests.id, requestId))
          .limit(1);
        if (!existing) return res.status(404).json({ message: "Request not found" });
        return res.status(409).json({
          message: `Request is already assigned to ${existing.assignedToName || "another administrator"}`,
        });
      }
      broadcastUpdate("specialty-requests", { type: "update", data: claimed });
      return res.json(claimed);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request ID" });
      console.error("Error taking specialty request:", error);
      return res.status(500).json({ message: "Failed to take request" });
    }
  });

  // ==========================================
  // LTC FACILITY LEAD ENDPOINTS
  // ==========================================

  app.post("/api/ltc-leads", async (req, res) => {
    try {
      const validated = insertLtcFacilityLeadSchema.parse(req.body);
      const [lead] = await db.insert(ltcFacilityLeads).values(validated).returning();
      broadcastUpdate("ltc_lead", { type: "new_ltc_lead", id: lead.id, facilityName: lead.facilityName, createdAt: lead.createdAt });
      res.status(201).json(lead);

      // Notify pharmacy team — fire-and-forget
      setImmediate(async () => {
        try {
          let emailRecipients: string[] = [];
          let smsRecipients: string[] = [];
          try {
            const dbRecipients = await storage.getNotificationRecipients("ltc_lead");
            emailRecipients = dbRecipients.filter((r) => r.isActive && r.channel === "email").map((r) => r.address);
            smsRecipients = dbRecipients.filter((r) => r.isActive && r.channel === "sms").map((r) => r.address);
          } catch (_) {}
          if (emailRecipients.length === 0) {
            emailRecipients = (process.env.PHARMACY_TEAM_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
          }
          if (smsRecipients.length === 0) {
            smsRecipients = (process.env.PHARMACY_TEAM_SMS || "").split(",").map((s) => s.trim()).filter(Boolean);
          }

          const rows: Array<[string, string]> = [
            ["Facility name", lead.facilityName],
            ["Facility type", lead.facilityType?.replace(/_/g, " ") ?? "—"],
            ["Number of beds", lead.numberOfBeds != null ? String(lead.numberOfBeds) : "—"],
            ["Contact name", lead.contactName],
            ["Contact title", lead.contactTitle || "—"],
            ["Phone", lead.phone],
            ["Email", lead.email || "—"],
            ["Address", lead.address || "—"],
            ["Notes", lead.notes || "—"],
            ["Lead ID", String(lead.id)],
          ];

          if (emailRecipients.length > 0) {
            const html = `
              <div style="font-family:Arial,sans-serif;color:#111;">
                <h2 style="margin:0 0 12px;">New LTC partnership inquiry</h2>
                <p style="margin:0 0 16px;">A long-term care facility submitted a partnership inquiry via the Concordia website.</p>
                <table style="border-collapse:collapse;font-size:14px;">
                  ${rows.map(([label, value]) => `
                    <tr>
                      <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td>
                      <td style="padding:6px 0;">${escapeHtml(String(value))}</td>
                    </tr>`).join("")}
                </table>
                <p style="margin-top:24px;color:#777;font-size:12px;">View the full record in Admin → LTC Leads.</p>
              </div>`;
            const text = ["New LTC partnership inquiry", "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
            const result = await sendEmail({
              to: emailRecipients,
              subject: `New LTC inquiry — ${lead.facilityName} (${lead.contactName})`,
              html,
              text,
              replyTo: lead.email || undefined,
            });
            if (!result.ok) console.error("[LTCLead] sendEmail failed:", result.error);
          } else {
            console.warn("[LTCLead] No email recipients configured; skipping email");
          }

          if (smsRecipients.length > 0) {
            const smsBody = `New LTC inquiry from ${lead.facilityName} (${lead.facilityType?.replace(/_/g, " ") ?? ""}). Contact: ${lead.contactName} — ${lead.phone}. Lead ID #${lead.id}.`;
            const smsResult = await sendSms({ to: smsRecipients, body: smsBody });
            if (!smsResult.ok) console.error("[LTCLead] sendSms failed:", smsResult.error);
          }

          // Pharmacy alert for admin panel
          await storage.createPharmacyAlert({
            type: "ltc_lead",
            title: "New LTC partnership inquiry",
            message: `${lead.facilityName} — ${lead.contactName} (${lead.phone}) [id:${lead.id}]`,
            priority: "high",
          }).catch(() => {});
        } catch (notifyErr) {
          console.error("[LTCLead] Notification error:", notifyErr);
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating LTC lead:", error);
      res.status(500).json({ message: "Failed to submit inquiry" });
    }
  });

  app.get("/api/admin/ltc-leads", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const leads = await db.select().from(ltcFacilityLeads).orderBy(desc(ltcFacilityLeads.createdAt));
      res.json(leads);
    } catch (error) {
      console.error("Error fetching LTC leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  app.patch("/api/admin/ltc-leads/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateSchema = z.object({
        status: z.enum(["new", "contacted", "in_discussion", "onboarded", "declined"]).optional(),
        adminNotes: z.string().optional(),
      });
      const validated = updateSchema.parse(req.body);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (validated.status) updates.status = validated.status;
      if (validated.adminNotes !== undefined) updates.adminNotes = validated.adminNotes;
      const [updated] = await db.update(ltcFacilityLeads).set(updates).where(eq(ltcFacilityLeads.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Lead not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating LTC lead:", error);
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  // ── Rx Savings Requests ───────────────────────────────────────────────────
  app.post("/api/savings-requests", async (req, res) => {
    try {
      const validated = insertSavingsRequestSchema.parse(req.body);
      const [record] = await db.insert(savingsRequests).values(validated).returning();
      broadcastUpdate("savings_request", { type: "new_savings_request", id: record.id, name: record.name, createdAt: record.createdAt });
      res.status(201).json(record);

      setImmediate(async () => {
        try {
          await storage.createPharmacyAlert({
            type: "general",
            title: "New Rx Savings Request",
            message: `${record.name} — ${record.phone}${record.medication ? ` — ${record.medication}` : ""} [id:${record.id}]`,
            priority: "high",
          }).catch(() => {});
        } catch (e) {
          console.error("[SavingsRequest] alert error:", e);
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating savings request:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  app.get("/api/admin/savings-requests", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const records = await db.select().from(savingsRequests).orderBy(desc(savingsRequests.createdAt));
      res.json(records);
    } catch (error) {
      console.error("Error fetching savings requests:", error);
      res.status(500).json({ message: "Failed to fetch savings requests" });
    }
  });

  app.patch("/api/admin/savings-requests/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const schema = z.object({
        status: z.enum(["new", "contacted", "resolved"]).optional(),
        adminNotes: z.string().optional(),
      });
      const validated = schema.parse(req.body);
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (validated.status) updates.status = validated.status;
      if (validated.adminNotes !== undefined) updates.adminNotes = validated.adminNotes;
      const [updated] = await db.update(savingsRequests).set(updates).where(eq(savingsRequests.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Request not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating savings request:", error);
      res.status(500).json({ message: "Failed to update request" });
    }
  });

  // Mock PrimeRx sync endpoint - simulates receiving prescription data from PrimeRx
  app.post("/api/admin/primerx/sync", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const syncData = z.object({
        primeRxId: z.string(),
        patientEmail: z.string().email(),
         rxNumber: z.string().trim().min(1),
        medicationName: z.string(),
        dosage: z.string(),
        quantity: z.number().int().positive(),
        refillsRemaining: z.number().int().nonnegative(),
        prescribedBy: z.string(),
        instructions: z.string().optional(),
        patientFirstName: z.string().optional(),
        patientLastName: z.string().optional(),
        patientPhone: z.string().optional(),
        patientDob: z.string().optional(),
         primeRxPatientId: z.string().trim().min(1),
      }).parse(req.body);

       const primeRxPatientId = requiredPrimeRxPatientId(syncData.primeRxPatientId);
       let user = await storage.getUserByPrimeRxPatientId(primeRxPatientId);
       if (!user || user.role !== "patient" || !/^CP-\d{6}$/.test(user.concordiaId ?? "")) {
         throw new PrimeRxOwnershipError("Established canonical patient link required");
       }
       const existingRx = await storage.getPrescriptionByRxNumber(syncData.rxNumber.trim());
       if (existingRx && user) assertRxOwner(existingRx, user.id);
       if (existingRx?.primeRxId && syncData.primeRxId && existingRx.primeRxId !== syncData.primeRxId) {
         throw new PrimeRxOwnershipError();
       }
       if (syncData.patientEmail) {
         const [emailMatch] = await db.select({ id: users.id }).from(users)
           .where(and(ilike(users.email, syncData.patientEmail.trim()), ne(users.id, user.id))).limit(1);
         if (emailMatch) throw new PrimeRxOwnershipError("Contact identity collision");
       }
       if (syncData.patientPhone) {
         const phoneMatches = await storage.getUsersByPhone(syncData.patientPhone);
         const ownerId = user.id;
         if (phoneMatches.some(candidate => candidate.id !== ownerId)) {
           throw new PrimeRxOwnershipError("Contact identity collision");
         }
       }
       // Create prescription (or replay the same owner's record idempotently).
       const prescription = existingRx
         ? (await storage.updatePrescription(existingRx.id, {
             medicationName: syncData.medicationName,
             dosage: syncData.dosage,
             quantity: syncData.quantity,
             refillsRemaining: syncData.refillsRemaining,
             prescribedBy: syncData.prescribedBy,
             instructions: syncData.instructions,
             primeRxId: syncData.primeRxId,
           }))!
         : await storage.createPrescription({
        userId: user.id,
         rxNumber: syncData.rxNumber.trim(),
        medicationName: syncData.medicationName,
        dosage: syncData.dosage,
        quantity: syncData.quantity,
        refillsRemaining: syncData.refillsRemaining,
        prescribedBy: syncData.prescribedBy,
        instructions: syncData.instructions,
        primeRxId: syncData.primeRxId,
        workflowStatus: "received",
        status: "active",
      });

      if (syncData.patientFirstName || syncData.patientPhone) {
        const updates: any = {};
        if (syncData.patientFirstName) updates.firstName = syncData.patientFirstName;
        if (syncData.patientLastName) updates.lastName = syncData.patientLastName;
        if (syncData.patientPhone) updates.phoneNumber = syncData.patientPhone;
        if (syncData.patientDob) updates.dateOfBirth = new Date(syncData.patientDob);
        await storage.updateUserProfile(user.id, updates);
      }

      // Log the sync
      await storage.createSyncLog({
        syncType: "prescription_received",
        status: "success",
        syncData: { fields: Object.keys(syncData).length, patientHash: operationalPatientHash(primeRxPatientId, process.env.SESSION_SECRET) },
      });

      res.json({ 
        message: "Prescription synced successfully",
        prescription,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid sync data", errors: error.errors });
      }
      console.error("[PrimeRx Sync] ingestion failed");
      
      // Log failed sync
      try {
        await storage.createSyncLog({
          syncType: "prescription_received",
          status: error instanceof PrimeRxOwnershipError ? "staff_review_required" : "failed",
          errorMessage: error instanceof PrimeRxOwnershipError ? error.code : "PRIMERX_SYNC_FAILED",
          syncData: { status: "failed" },
        });
      } catch (logError) {
        console.error("[PrimeRx Sync] failed-sync audit write failed");
      }

      res.status(error instanceof PrimeRxOwnershipError ? 409 : 500).json({
        message: error instanceof PrimeRxOwnershipError ? PRIMERX_OWNERSHIP_ERROR : "Failed to sync prescription",
      });
    }
  });

  // ===== COMPREHENSIVE PRIMERX PATIENT SYNC =====

  function normalizeAddress(addr: string): string {
    return addr.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  }

  function generateFamilyGroupId(address: string, city: string, state: string, zipCode: string): string {
    const normalized = normalizeAddress(`${address}${city}${state}${zipCode}`);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `fam_${Math.abs(hash).toString(36)}`;
  }

  async function syncSinglePatientFromPrimeRx(data: any): Promise<{ action: string; userId: string; patientName: string; error?: string }> {
    const primeRxPatientId = requiredPrimeRxPatientId(data.primeRxPatientId);

    let user = await storage.getUserByPrimeRxPatientId(primeRxPatientId);
    if (!user || user.role !== "patient" || !/^CP-\d{6}$/.test(user.concordiaId ?? "")) {
      throw new PrimeRxOwnershipError("Established canonical patient link required");
    }
    let action = "updated";
    // Contact fields are never identity selectors, but collisions are a
    // staff-review condition rather than permission to overwrite either user.
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (email) {
      const emailQuery = user
        ? db.select({ id: users.id }).from(users).where(and(ilike(users.email, email), ne(users.id, user.id))).limit(1)
        : db.select({ id: users.id }).from(users).where(ilike(users.email, email)).limit(1);
      const [emailMatch] = await emailQuery;
      if (emailMatch) throw new PrimeRxOwnershipError("Contact identity collision");
    }
    if (data.phone) {
      const phoneMatches = await storage.getUsersByPhone(String(data.phone));
      if (phoneMatches.some((candidate: any) => candidate.id !== user?.id)) {
        throw new PrimeRxOwnershipError("Contact identity collision");
      }
    }
    const incomingMedications = Array.isArray(data.medications) ? data.medications : [];
    // Preflight the entire batch before profile, doctor, blister, or Rx writes.
    const existingPrescriptions = (await Promise.all(incomingMedications
      .filter((med: any) => med.rxNumber != null && String(med.rxNumber).trim())
      .map((med: any) => storage.getPrescriptionByRxNumber(String(med.rxNumber).trim()))))
      .filter(Boolean) as any[];
    assertMedicationOwnership(incomingMedications, user.id, existingPrescriptions);

    // Do not change profile or doctor data until the prescription ownership
    // transaction has succeeded. A concurrent unique-key conflict must not
    // leave patient metadata changed for a rejected import.
    const establishedUser = user;
    const applyPatientDetails = async () => {
    const userUpdates: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phone || undefined,
      email: data.email || undefined,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      gender: data.gender || undefined,
      address: [data.address, data.city, data.state, data.zipCode].filter(Boolean).join(", ") || undefined,
       primeRxPatientId,
      role: "patient" as const,
    };

    if (data.insurance) {
      userUpdates.insuranceProvider = data.insurance.provider || undefined;
      userUpdates.insurancePolicyNumber = data.insurance.policyNumber || undefined;
      userUpdates.insuranceGroupNumber = data.insurance.groupNumber || undefined;
    }

    if (data.allergies && Array.isArray(data.allergies)) {
      userUpdates.allergies = data.allergies.join(", ");
    }
    if (data.medicalConditions && Array.isArray(data.medicalConditions)) {
      userUpdates.medicalConditions = data.medicalConditions.join(", ");
    }
    if (data.diagnosis && Array.isArray(data.diagnosis)) {
      userUpdates.diagnosis = data.diagnosis.join(", ");
    }

    if (data.address && data.city && data.state && data.zipCode) {
      const familyGroupId = generateFamilyGroupId(data.address, data.city, data.state, data.zipCode);
      userUpdates.familyGroupId = familyGroupId;
    }

    const cleaned: any = {};
    for (const [k, v] of Object.entries(userUpdates)) {
      if (v !== undefined) cleaned[k] = v;
    }
    await storage.updateUserProfile(establishedUser.id, cleaned);
    user = (await storage.getUser(establishedUser.id))!;

    if (data.doctors && Array.isArray(data.doctors)) {
      const existingDoctors = await storage.getDoctorsByPatient(user.id);
      for (const doc of data.doctors) {
        const existingDoc = existingDoctors.find((d: any) =>
          (doc.primeRxId && d.primeRxId === doc.primeRxId) ||
          (doc.npi && d.npi === doc.npi) ||
          (d.firstName?.toLowerCase() === doc.firstName?.toLowerCase() && d.lastName?.toLowerCase() === doc.lastName?.toLowerCase())
        );
        if (existingDoc) {
          await storage.updateDoctor(existingDoc.id, {
            firstName: doc.firstName,
            lastName: doc.lastName,
            specialty: doc.specialty || existingDoc.specialty,
            phone: doc.phone || existingDoc.phone,
            fax: doc.fax || existingDoc.fax,
            email: doc.email || existingDoc.email,
            npi: doc.npi || existingDoc.npi,
            primeRxId: doc.primeRxId || existingDoc.primeRxId,
            isActive: true,
          });
        } else {
          await storage.createDoctor({
            userId: user.id,
            firstName: doc.firstName,
            lastName: doc.lastName,
            specialty: doc.specialty,
            phone: doc.phone,
            fax: doc.fax,
            email: doc.email,
            npi: doc.npi,
            primeRxId: doc.primeRxId,
            isActive: true,
          });
        }
      }
    }
    };

    if (incomingMedications.length > 0) {
      try {
        await db.transaction(async (tx) => {
          const existingRx = await storage.getPrescriptionsByUserId(user!.id);
          for (const med of incomingMedications) {
            const rxNumber = med.rxNumber == null ? "" : String(med.rxNumber).trim();
            if (rxNumber) {
              const existing = existingRx.find((rx: any) => rx.rxNumber === rxNumber);
              if (existing) {
                // userId is intentionally included: never mutate a globally
                // unique prescription discovered under another patient.
                await tx
                  .update(prescriptions)
                  .set({
                    medicationName: med.name,
                    dosage: med.dosage,
                    quantity: med.quantity || existing.quantity,
                    refillsRemaining: med.refillsRemaining ?? existing.refillsRemaining,
                    prescribedBy: med.prescribedBy || existing.prescribedBy,
                    instructions: med.instructions || existing.instructions,
                    ndc: med.ndc || existing.ndc,
                    status: med.isActive === false ? "discontinued" : "active",
                    updatedAt: new Date(),
                  })
                  .where(and(eq(prescriptions.id, existing.id), eq(prescriptions.userId, user!.id)));
              } else {
                await tx.insert(prescriptions).values({
                  userId: user!.id,
                  rxNumber,
                  medicationName: med.name,
                  dosage: med.dosage || "",
                  quantity: med.quantity || 0,
                  refillsRemaining: med.refillsRemaining ?? 0,
                  prescribedBy: med.prescribedBy || "PrimeRx",
                  instructions: med.instructions,
                  ndc: med.ndc,
                  primeRxId: med.primeRxId,
                  workflowStatus: "received",
                  status: med.isActive === false ? "discontinued" : "active",
                } as any);
              }
            }
          }
        });
      } catch (error: any) {
        if (error?.code === "23505") throw new PrimeRxOwnershipError();
        throw error;
      }
      await applyPatientDetails();
      let blisterPatient = await storage.getBlisterPackPatientByUserId(user.id);
      const medicationsJson = data.medications
        .filter((m: any) => m.isActive !== false)
        .map((m: any) => ({
          name: m.name,
          dosage: m.dosage || "",
          frequency: m.frequency || "daily",
          intakeTimes: m.intakeTimes || ["morning"],
          instructions: m.instructions || "",
          startDate: m.startDate || new Date().toISOString().split("T")[0],
          endDate: m.endDate || null,
          prescriberId: m.prescribedBy || null,
          isActive: true,
        }));

      if (blisterPatient) {
        await storage.updateBlisterPackPatient(blisterPatient.id, {
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phone || blisterPatient.phoneNumber,
          email: data.email || blisterPatient.email,
          dateOfBirth: data.dateOfBirth || blisterPatient.dateOfBirth,
          gender: data.gender || blisterPatient.gender,
          address: data.address || blisterPatient.address,
          city: data.city || blisterPatient.city,
          state: data.state || blisterPatient.state,
          zipCode: data.zipCode || blisterPatient.zipCode,
          insuranceProvider: data.insurance?.provider || blisterPatient.insuranceProvider,
          insurancePolicyNumber: data.insurance?.policyNumber || blisterPatient.insurancePolicyNumber,
          insuranceGroupNumber: data.insurance?.groupNumber || blisterPatient.insuranceGroupNumber,
          insurancePhone: data.insurance?.phone || blisterPatient.insurancePhone,
          primaryDoctor: data.doctors?.[0] ? `${data.doctors[0].firstName} ${data.doctors[0].lastName}` : blisterPatient.primaryDoctor,
          doctorPhone: data.doctors?.[0]?.phone || blisterPatient.doctorPhone,
          allergies: data.allergies ? data.allergies.join(", ") : blisterPatient.allergies,
          medicalConditions: data.medicalConditions ? data.medicalConditions.join(", ") : blisterPatient.medicalConditions,
          medications: medicationsJson,
          emergencyContactName: data.emergencyContact?.name || blisterPatient.emergencyContactName,
          emergencyContactPhone: data.emergencyContact?.phone || blisterPatient.emergencyContactPhone,
          emergencyContactRelation: data.emergencyContact?.relation || blisterPatient.emergencyContactRelation,
          status: "active",
        } as any);
      } else if (medicationsJson.length > 0) {
        blisterPatient = await storage.createBlisterPackPatient({
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phone || "",
          email: data.email || "",
          dateOfBirth: data.dateOfBirth || "",
          gender: data.gender || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zipCode: data.zipCode || "",
          insuranceProvider: data.insurance?.provider || "",
          insurancePolicyNumber: data.insurance?.policyNumber || "",
          insuranceGroupNumber: data.insurance?.groupNumber || "",
          insurancePhone: data.insurance?.phone || "",
          primaryDoctor: data.doctors?.[0] ? `${data.doctors[0].firstName} ${data.doctors[0].lastName}` : "",
          doctorPhone: data.doctors?.[0]?.phone || "",
          allergies: data.allergies ? data.allergies.join(", ") : "",
          medicalConditions: data.medicalConditions ? data.medicalConditions.join(", ") : "",
          medications: medicationsJson,
          emergencyContactName: data.emergencyContact?.name || "",
          emergencyContactPhone: data.emergencyContact?.phone || "",
          emergencyContactRelation: data.emergencyContact?.relation || "",
          linkedUserId: user.id,
          status: "active",
          enrollmentSource: "primerx",
        } as any);
      }

      if (blisterPatient) {
        try {
          await syncBlisterPackToApp("update", blisterPatient);
        } catch (syncErr) {
          console.log("[PrimeRx Sync] App sync failed");
        }
      }

      try {
        await syncMedicationsToApp(user.id, user);
        console.log("[PrimeRx Sync] Medications synced");
      } catch (medSyncErr) {
        console.log("[PrimeRx Sync] Medication app sync failed");
      }
    } else {
      await applyPatientDetails();
    }

    if (data.caregiver && data.caregiver.phone) {
      try {
        let attendant = await storage.getHomeAttendantByPhone(data.caregiver.phone);
        if (!attendant) {
          attendant = await storage.createHomeAttendant({
            firstName: data.caregiver.firstName || "Caregiver",
            lastName: data.caregiver.lastName || "",
            phoneNumber: data.caregiver.phone,
            email: data.caregiver.email || `caregiver_${Date.now()}@concordiapharmacy.app`,
            username: `cg_${data.caregiver.phone.replace(/\D/g, "")}`,
            passwordHash: "",
            status: "active",
          } as any);
        }

        const existingLink = await storage.getPatientAttendant(user.id);
        if (!existingLink) {
          await storage.linkPatientToAttendant({
            attendantId: attendant.id,
            patientId: user.id,
            relationshipType: data.caregiver.relationship || "caregiver",
            patientConsent: true,
            consentDate: new Date(),
            consentMethod: "primerx_sync",
            canManagePrescriptions: true,
            canViewMedicalInfo: true,
            canRequestRefills: true,
            canPlaceOrders: true,
            canUpdateProfile: false,
            isActive: true,
          } as any);
        }
      } catch (cgErr) {
        console.log("[PrimeRx Sync] Caregiver link failed");
      }
    }

    return { action, userId: user.id, patientName: `${data.firstName} ${data.lastName}` };
  }

  const VALID_DRUG_FORMS = ["tablet", "capsule", "liquid", "cream", "gel", "ointment", "patch", "injection", "inhaler", "drops", "powder", "suppository", "other"];
  function normalizeDrugForm(form: string | undefined | null): string | undefined {
    if (!form) return undefined;
    const lower = form.toLowerCase().trim();
    const formMap: Record<string, string> = {
      tab: "tablet", tabs: "tablet", tablet: "tablet", tablets: "tablet",
      cap: "capsule", caps: "capsule", capsule: "capsule", capsules: "capsule",
      liq: "liquid", liquid: "liquid", solution: "liquid", soln: "liquid", syrup: "liquid", susp: "liquid", suspension: "liquid", elixir: "liquid",
      cream: "cream", crm: "cream",
      gel: "gel",
      oint: "ointment", ointment: "ointment",
      patch: "patch", patches: "patch",
      inj: "injection", injection: "injection", syringe: "injection",
      inhaler: "inhaler", inh: "inhaler", aerosol: "inhaler",
      drops: "drops", drop: "drops", ophthalmic: "drops",
      powder: "powder", pwd: "powder",
      supp: "suppository", suppository: "suppository",
    };
    return formMap[lower] || (VALID_DRUG_FORMS.includes(lower) ? lower : "other");
  }

  async function handleNativePrimeRxEvent(payload: PrimeRxPayload): Promise<{ status: string; event?: string; message?: string }> {
    const event = payload.Event;
    const logBase = {
      syncType: `native_${event}`,
      eventType: event,
    };

    try {
      if (isPatientEvent(event)) {
        return await handlePatientEvent(payload, logBase);
      }
      if (isRxEvent(event)) {
        return await handleRxEvent(payload, logBase);
      }
      if (isWorkflowEvent(event)) {
        return await handleWorkflowEvent(payload, logBase);
      }

      await storage.createSyncLog({
        ...logBase,
        status: "success",
        patientName: `Unknown event: ${event}`,
      });
      return { status: "ignored", event, message: "Unrecognized event type" };
    } catch (err: unknown) {
      const errMsg = err instanceof PrimeRxOwnershipError ? err.code : "PrimeRx ingestion failed";
      console.error(`[PrimeRx Native] ${errMsg} (event=${event})`);
      await storage.createSyncLog({
        ...logBase,
        status: err instanceof PrimeRxOwnershipError ? "staff_review_required" : "failed",
        errorMessage: errMsg,
      });
      return { status: "error", event, message: errMsg };
    }
  }

  async function handlePatientEvent(payload: PrimeRxPayload, logBase: Record<string, unknown>): Promise<{ status: string; event: string; action: string; patientName: string }> {
    const patientData = extractPatientFromEvent(payload);
    if (!patientData) throw new Error("Could not extract patient data from event");

    const result = await syncSinglePatientFromPrimeRx({
      ...patientData,
      doctors: [],
      medications: [],
    });

    const updateFields: Record<string, unknown> = {};
    if (patientData.middleInitial) updateFields.middleInitial = patientData.middleInitial;
    if (patientData.mrn) updateFields.mrn = patientData.mrn;
    if (patientData.chartNo) updateFields.chartNo = patientData.chartNo;
    if (patientData.language) updateFields.language = patientData.language;
    if (patientData.preferredDeliveryMethod) updateFields.preferredDeliveryMethod = patientData.preferredDeliveryMethod;
    if (patientData.smokerCode) updateFields.smokerCode = patientData.smokerCode;
    if (patientData.pregnancyCode) updateFields.pregnancyCode = patientData.pregnancyCode;
    if (patientData.insuranceList && patientData.insuranceList.length > 0) {
      updateFields.insuranceData = patientData.insuranceList;
    }
    if (Object.keys(updateFields).length > 0) {
      await storage.updateUserProfile(result.userId, updateFields);
    }

    await storage.createSyncLog({
      ...logBase,
      syncType: logBase.syncType as string,
      status: "success",
      syncData: { patientHash: operationalPatientHash(patientData.primeRxPatientId, process.env.SESSION_SECRET) },
    });

    return { status: "success", event: payload.Event, action: result.action, patientName: result.patientName };
  }

  async function handleRxEvent(payload: PrimeRxPayload, logBase: Record<string, unknown>): Promise<{ status: string; event: string; rxNumber?: string; workflowStatus?: string; patientName?: string }> {
    const event = payload.Event;
    const patientData = extractPatientFromEvent(payload);
    const prescriberData = extractPrescriberFromEvent(payload);
    const drugData = extractDrugFromEvent(payload);
    const rxData = extractRxDataFromEvent(payload);

    let userId: string | undefined;

    if (!patientData?.primeRxPatientId?.trim()) {
      throw new PrimeRxOwnershipError("Authoritative PrimeRx patient identity is required");
    }
    if (patientData) {
      // Check RX ownership before profile or doctor writes.
      const existingGlobalRx = rxData.rxNumber ? await storage.getPrescriptionByRxNumber(String(rxData.rxNumber).trim()) : undefined;
      const identityUser = await storage.getUserByPrimeRxPatientId(patientData.primeRxPatientId);
      if (!identityUser || identityUser.role !== "patient" || !/^CP-\d{6}$/.test(identityUser.concordiaId ?? "")) {
        throw new PrimeRxOwnershipError("Established canonical patient link required");
      }
      if (existingGlobalRx && identityUser) assertRxOwner(existingGlobalRx, identityUser.id);
      const syncResult = await syncSinglePatientFromPrimeRx({
        ...patientData,
        doctors: [],
        medications: [],
      });
      userId = syncResult.userId;
    }

    if (!userId && patientData?.primeRxPatientId) {
      const user = await storage.getUserByPrimeRxPatientId(patientData.primeRxPatientId);
      if (user) userId = user.id;
    }

    if (prescriberData && userId) {
      const existingDoctors = await storage.getDoctorsByPatient(userId);
      const existingDoc = existingDoctors.find((d) =>
        (prescriberData.primeRxId && d.primeRxId === prescriberData.primeRxId) ||
        (prescriberData.npi && d.npi === prescriberData.npi)
      );
      if (existingDoc) {
        await storage.updateDoctor(existingDoc.id, {
          firstName: prescriberData.firstName,
          lastName: prescriberData.lastName,
          phone: prescriberData.phone || existingDoc.phone,
          fax: prescriberData.fax || existingDoc.fax,
          npi: prescriberData.npi || existingDoc.npi,
          primeRxId: prescriberData.primeRxId || existingDoc.primeRxId,
          deaNumber: prescriberData.deaNumber || existingDoc.deaNumber,
          licenseNumber: prescriberData.licenseNumber || existingDoc.licenseNumber,
          medicaidProvNo: prescriberData.medicaidProvNo || existingDoc.medicaidProvNo,
          address: prescriberData.address || existingDoc.address,
          isActive: true,
        });
      } else {
        await storage.createDoctor({
          userId,
          firstName: prescriberData.firstName,
          lastName: prescriberData.lastName,
          phone: prescriberData.phone,
          fax: prescriberData.fax,
          npi: prescriberData.npi,
          primeRxId: prescriberData.primeRxId,
          deaNumber: prescriberData.deaNumber,
          licenseNumber: prescriberData.licenseNumber,
          medicaidProvNo: prescriberData.medicaidProvNo,
          address: prescriberData.address,
          isActive: true,
        });
      }
    }

    const workflowStatus = mapEventToWorkflowStatus(event);

    let syncedPrescriptionId: string | undefined;
    if (userId && rxData.rxNumber) {
      const existingRxList = await storage.getPrescriptionsByUserId(userId);
      const existingRx = existingRxList.find((rx) => rx.rxNumber === rxData.rxNumber);

      const rxUpdate: Record<string, unknown> = {
        userId,
        rxNumber: rxData.rxNumber,
        medicationName: drugData?.drugName || "",
        dosage: drugData ? `${drugData.strength} ${drugData.strengthUnit}`.trim() : "",
        ndc: drugData?.ndc || "",
        drugForm: normalizeDrugForm(drugData?.form),
        manufacturer: drugData?.manufacturer || "",
        genericName: drugData?.drugName || "",
        sig: rxData.sig,
        daysSupply: rxData.daysSupply,
        refillNo: rxData.refillNo,
        authRefills: rxData.authRefills,
        totalRxAmount: String(rxData.totalRxAmount),
        primaryInsurancePaid: String(rxData.primaryInsurancePaid),
        secondaryInsurancePaid: String(rxData.secondaryInsurancePaid),
        tertiaryInsurancePaid: String(rxData.tertiaryInsurancePaid),
        copayAmount: String(rxData.patientCopay),
        billType: rxData.billType,
        deliveryMethod: rxData.deliveryMethod,
        rxOriginCode: rxData.rxOriginCode,
        rxOriginDescription: rxData.rxOriginDescription,
        lotNo: rxData.lotNo,
        drugExpiryDate: rxData.drugExpiryDate,
        drugClass: rxData.drugClass,
        pickedUp: rxData.pickedUp,
        queueName: rxData.queueName,
        qtyOrdered: String(rxData.qtyOrdered),
        qtyDispensed: String(rxData.qtyDispensed),
        qtyRemaining: String(rxData.qtyRemaining),
        dateFilled: rxData.dateFilled,
        dateOrdered: rxData.dateOrdered,
        workflowStatus,
        prescribedBy: prescriberData ? `Dr. ${prescriberData.firstName} ${prescriberData.lastName}` : "Unknown",
        refillsRemaining: rxData.authRefills - rxData.refillNo,
        status: (event === "RxDeleted" || event === "RxReversed") ? "cancelled" : "active",
      };

      if (rxData.sig) {
        const parsed = parseSig(rxData.sig);
        rxUpdate.parsedSig = {
          dose: parsed.dose,
          unit: parsed.unit,
          route: parsed.route,
          frequencyCode: parsed.frequencyCode,
          intakeTimes: parsed.intakeTimes,
          intervalHours: parsed.intervalHours,
          withFood: parsed.withFood,
          specialFlag: parsed.specialFlag,
          autoParsed: parsed.autoParsed,
        };
      }

      if (existingRx) {
        syncedPrescriptionId = existingRx.id;
        const patchUpdate: Record<string, unknown> = { updatedAt: new Date() };
        const alwaysUpdateFields = ["workflowStatus", "status", "refillNo", "refillsRemaining", "copayAmount",
          "primaryInsurancePaid", "secondaryInsurancePaid", "tertiaryInsurancePaid", "qtyDispensed", "qtyOrdered", "qtyRemaining", "parsedSig"];
        for (const [key, value] of Object.entries(rxUpdate)) {
          if (alwaysUpdateFields.includes(key)) {
            if (value !== undefined && value !== null) patchUpdate[key] = value;
          } else if (value !== undefined && value !== null && value !== "") {
            patchUpdate[key] = value;
          }
        }
         await db.update(prescriptions).set(patchUpdate).where(and(eq(prescriptions.id, existingRx.id), eq(prescriptions.userId, userId)));
      } else {
        const createdId = randomUUID();
        syncedPrescriptionId = createdId;
        try {
          await (db.insert(prescriptions) as any).values({
          id: createdId,
          ...rxUpdate,
          quantity: Number(rxData.qtyDispensed) || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          });
        } catch (error: any) {
          if (error?.code === "23505") throw new PrimeRxOwnershipError();
          throw error;
        }
      }
    }

    const rawRxNumber = payload.RxNo;
    const rawRefillNo = payload.RefillNo;
    const hasStableFillIdentity =
      rawRxNumber !== undefined &&
      rawRxNumber !== null &&
      String(rawRxNumber).trim() !== "" &&
      rawRefillNo !== undefined &&
      Number.isInteger(Number(rawRefillNo)) &&
      Number(rawRefillNo) >= 0;
    const refillEventId = hasStableFillIdentity ? `primerx:${String(rawRxNumber).trim()}:${Number(rawRefillNo)}` : null;
    if (event === "RxFiled" && userId && syncedPrescriptionId && refillEventId) {
      const rewardResult = await recordQualifyingCompletedRefill({
        userId,
        prescriptionId: syncedPrescriptionId,
        fillEventId: refillEventId,
      });
      if (rewardResult.creditAwarded) {
        console.log(`[Rewards] Awarded one-time $20 five-refill credit to member ${userId}`);
      }
    } else if ((event === "RxReversed" || event === "RxDeleted") && userId && refillEventId) {
      await recordReversedRefill({ userId, fillEventId: refillEventId });
    }

    const sigParsedResult = rxData.sig ? parseSig(rxData.sig) : null;
    if (userId && sigParsedResult && sigParsedResult.intakeTimes.length > 0) {
      try {
        const blisterPatient = await storage.getBlisterPackPatientByUserId(userId);
        if (blisterPatient && blisterPatient.medications && Array.isArray(blisterPatient.medications)) {
          const medName = (drugData?.drugName || "").toLowerCase();
          if (medName) {
            const updatedMeds = (blisterPatient.medications as Array<{ name: string; dosage: string; frequency: string; intakeTimes: string[]; instructions?: string; startDate?: string; endDate?: string; prescriberId?: string; isActive: boolean; autoSuggestedIntakeTimes?: string[]; sigAutoParsed?: boolean }>).map((med) => {
              if (med.name.toLowerCase() === medName || med.name.toLowerCase().includes(medName)) {
                return {
                  ...med,
                  autoSuggestedIntakeTimes: sigParsedResult.intakeTimes,
                  sigAutoParsed: sigParsedResult.autoParsed,
                  intakeTimes: med.intakeTimes.length === 0 ? sigParsedResult.intakeTimes : med.intakeTimes,
                };
              }
              return med;
            });
            await storage.updateBlisterPackPatient(blisterPatient.id, { medications: updatedMeds });
            console.log("[SIG→BlisterPack] Intake suggestions updated");
          }
        }
      } catch {
        console.log("[SIG→BlisterPack] Non-fatal propagation failure");
      }
    }

    const patientName = patientData ? `${patientData.firstName} ${patientData.lastName}` : "Unknown";
    await storage.createSyncLog({
      ...logBase,
      syncType: logBase.syncType as string,
      workflowTransition: workflowStatus,
      status: "success",
      syncData: { patientHash: operationalPatientHash(patientData?.primeRxPatientId, process.env.SESSION_SECRET) },
    });

    if (userId) {
      try {
        await syncMedicationsToApp(userId, undefined, true);
      } catch (e) {
        // App sync failure is non-fatal
      }
    }

    return {
      status: "success",
      event,
      rxNumber: rxData.rxNumber,
      workflowStatus,
      patientName,
    };
  }

  async function handleWorkflowEvent(payload: PrimeRxPayload, logBase: Record<string, unknown>): Promise<{ status: string; event: string; rxNo?: string; fromQueue?: string; toQueue?: string; message?: string }> {
    const transition = extractWorkflowTransition(payload);
    if (!transition) {
      await storage.createSyncLog({
        ...logBase,
        syncType: logBase.syncType as string,
        status: "success",
        workflowTransition: "unknown",
        patientName: "WorkflowTransition (no data)",
      });
      return { status: "ignored", event: payload.Event, message: "No transition data found" };
    }

    if (transition.rxNo) {
      const matchingRx = await storage.getPrescriptionByRxNumber(String(transition.rxNo).trim());
      const owner = matchingRx ? await storage.getUser(matchingRx.userId) : undefined;
      if (matchingRx && owner?.role === "patient") {
        await db.update(prescriptions).set({
          queueName: transition.toQueue,
          updatedAt: new Date(),
        }).where(and(eq(prescriptions.id, matchingRx.id), eq(prescriptions.userId, owner.id)));
        // Push updated queue/status to ConcordiaCare app (fire-and-forget)
        void pushRxStatusToApp({
          rxNumber: matchingRx.rxNumber,
          medicationName: matchingRx.medicationName,
          workflowStatus: matchingRx.workflowStatus ?? "received",
          queueName: transition.toQueue,
          patientEmail: owner.email,
          concordiaCareUserId: owner.concordiaCareUserId,
        });
      }
    }

    await storage.createSyncLog({
      ...logBase,
      syncType: logBase.syncType as string,
      workflowTransition: `${transition.fromQueue} → ${transition.toQueue}`,
      status: "success",
    });

    return {
      status: "success",
      event: payload.Event,
      rxNo: transition.rxNo,
      fromQueue: transition.fromQueue,
      toQueue: transition.toQueue,
    };
  }

  const primeRxPatientSchema = z.object({
    primeRxPatientId: z.string().or(z.number()).transform(String).pipe(z.string().trim().min(1)),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    insurance: z.object({
      provider: z.string().optional(),
      policyNumber: z.string().optional(),
      groupNumber: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
    allergies: z.array(z.string()).optional(),
    medicalConditions: z.array(z.string()).optional(),
    diagnosis: z.array(z.string()).optional(),
    doctors: z.array(z.object({
      firstName: z.string(),
      lastName: z.string(),
      specialty: z.string().optional(),
      phone: z.string().optional(),
      fax: z.string().optional(),
      email: z.string().optional(),
      npi: z.string().optional(),
      primeRxId: z.string().optional(),
    })).optional(),
    medications: z.array(z.object({
      name: z.string(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      instructions: z.string().optional(),
      rxNumber: z.string().optional(),
      ndc: z.string().optional(),
      prescribedBy: z.string().optional(),
      primeRxId: z.string().optional(),
      refillsRemaining: z.number().optional(),
      quantity: z.number().optional(),
      intakeTimes: z.array(z.string()).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isActive: z.boolean().optional(),
    })).optional(),
    emergencyContact: z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      relation: z.string().optional(),
    }).optional(),
    caregiver: z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string(),
      email: z.string().optional(),
      relationship: z.string().optional(),
    }).optional(),
  });

  app.post("/api/admin/primerx/sync-patient", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = primeRxPatientSchema.parse(req.body);
      const result = await syncSinglePatientFromPrimeRx(data);

      await storage.createSyncLog({
        syncType: `patient_${result.action}`,
        status: "success",
         syncData: { resultAction: result.action, medicationCount: data.medications?.length ?? 0, doctorCount: data.doctors?.length ?? 0, patientHash: operationalPatientHash(data.primeRxPatientId, process.env.SESSION_SECRET) },
      });

       console.log(`[PrimeRx Sync] Patient ${result.action}`);
      broadcastUpdate("patients", { type: `patient_${result.action}`, userId: result.userId });
      res.json({ success: true, action: result.action, userId: result.userId, patientName: result.patientName });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient data", errors: error.errors });
      }
       console.error("[PrimeRx Sync] Patient sync failed");
      try {
        await storage.createSyncLog({
          syncType: "patient_sync_failed",
          status: error instanceof PrimeRxOwnershipError ? "staff_review_required" : "failed",
           errorMessage: error instanceof PrimeRxOwnershipError ? error.code : "PRIMERX_SYNC_FAILED",
           syncData: { status: "failed" },
        });
      } catch (logErr) {}
       res.status(error instanceof PrimeRxOwnershipError ? 409 : 500).json({ message: error instanceof PrimeRxOwnershipError ? PRIMERX_OWNERSHIP_ERROR : "Failed to sync patient" });
    }
  });

  // T003: Bulk patient sync + webhook
  app.post("/api/admin/primerx/sync-patients-bulk", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const patients = z.array(primeRxPatientSchema).parse(req.body);
      const results = { total: patients.length, created: 0, updated: 0, failed: 0, errors: [] as string[] };

      for (const patientData of patients) {
        try {
          const result = await syncSinglePatientFromPrimeRx(patientData);
          if (result.action === "created") results.created++;
          else results.updated++;

          await storage.createSyncLog({
            syncType: `patient_${result.action}`,
            status: "success",
            syncData: { patientHash: operationalPatientHash(patientData.primeRxPatientId, process.env.SESSION_SECRET), action: result.action },
          });
        } catch (err: any) {
          results.failed++;
          results.errors.push(PRIMERX_OWNERSHIP_ERROR);
          try {
            await storage.createSyncLog({
              syncType: "patient_sync_failed",
              status: err instanceof PrimeRxOwnershipError ? "staff_review_required" : "failed",
               errorMessage: err instanceof PrimeRxOwnershipError ? err.code : "PRIMERX_SYNC_FAILED",
              syncData: { patientHash: operationalPatientHash(patientData.primeRxPatientId, process.env.SESSION_SECRET) },
            });
          } catch (logErr) {}
        }
      }

      console.log(`[PrimeRx Bulk Sync] ${results.created} created, ${results.updated} updated, ${results.failed} failed`);
      broadcastUpdate("patients", { type: "bulk_sync_complete", ...results });
      res.json(results);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid bulk data", errors: error.errors });
      }
      res.status(500).json({ message: "Bulk sync failed" });
    }
  });

  // External webhook for PrimeRx to push real-time updates (supports native PrimeRx events + legacy format)
  app.post("/api/external/primerx/webhook", requireApiKey, async (req, res) => {
    try {
      const body = req.body;

      if (isPrimeRxNativePayload(body)) {
        const result = await handleNativePrimeRxEvent(body);
        console.log(`[PrimeRx Native Webhook] Event: ${body.Event}, Status: ${result.status}`);
        broadcastUpdate("patients", { type: "native_webhook", event: body.Event, ...result });
        return res.json(result);
      }

      const patients = Array.isArray(body) ? body : [body];
      const parsed = z.array(primeRxPatientSchema).parse(patients);
      const results = { total: parsed.length, created: 0, updated: 0, failed: 0, errors: [] as string[] };

      for (const patientData of parsed) {
        try {
          const result = await syncSinglePatientFromPrimeRx(patientData);
          if (result.action === "created") results.created++;
          else results.updated++;

          await storage.createSyncLog({
            syncType: `webhook_patient_${result.action}`,
            status: "success",
            syncData: { patientHash: operationalPatientHash(patientData.primeRxPatientId, process.env.SESSION_SECRET), action: result.action },
          });
        } catch (err: unknown) {
          results.failed++;
          results.errors.push(err instanceof PrimeRxOwnershipError ? PRIMERX_OWNERSHIP_ERROR : "PRIMERX_SYNC_FAILED");
          try {
            await storage.createSyncLog({
              syncType: "webhook_patient_sync_failed",
              status: err instanceof PrimeRxOwnershipError ? "staff_review_required" : "failed",
              errorMessage: err instanceof PrimeRxOwnershipError ? PRIMERX_OWNERSHIP_ERROR : "PRIMERX_SYNC_FAILED",
              syncData: { patientHash: operationalPatientHash(patientData.primeRxPatientId, process.env.SESSION_SECRET) },
            });
          } catch {
            console.error("[PrimeRx Webhook] failed-sync audit write failed");
          }
        }
      }

      console.log(`[PrimeRx Webhook] ${results.created} created, ${results.updated} updated, ${results.failed} failed`);
      broadcastUpdate("patients", { type: "webhook_sync", ...results });
      res.json(results);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid webhook data", errors: error.errors });
      }
      console.error("[PrimeRx Webhook] processing failed");
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  app.get("/api/admin/primerx/webhook-status", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const recentLogs = await storage.getSyncLogs(20);
      const webhookLogs = recentLogs.filter((log) =>
        log.syncType?.startsWith("webhook_") || log.syncType?.startsWith("native_")
      );
      const lastWebhookLog = webhookLogs[0] || null;
      const eventCounts: Record<string, number> = {};
      for (const log of webhookLogs) {
        const event = log.syncType || "unknown";
        eventCounts[event] = (eventCounts[event] || 0) + 1;
      }
      const webhookUrl = `${process.env.CONCORDIA_CARE_APP_URL || process.env.REPLIT_DEV_DOMAIN || ""}/api/external/primerx/webhook`;
      res.json({
        webhookEndpoint: webhookUrl,
        apiKeyConfigured: !!process.env.API_KEY,
        lastEvent: lastWebhookLog ? {
          type: lastWebhookLog.syncType,
          status: lastWebhookLog.status,
          timestamp: lastWebhookLog.createdAt,
          patientName: lastWebhookLog.patientName,
        } : null,
        recentEventCounts: eventCounts,
        totalRecentEvents: webhookLogs.length,
        supportedEvents: [
          "PatientCreated", "PatientInfoUpdated",
          "RxSaved", "RxBilled", "RxDelivery", "RxShipped", "RxFiled",
          "RxReversed", "RxTransmissionRejected", "RxDeleted",
          "LabelPrinted", "DPVDone", "RphVDone",
          "WorkflowTransition", "WorkFlowQueueChanged",
        ],
      });
    } catch (error: unknown) {
      res.status(500).json({ message: "Failed to check webhook status" });
    }
  });

  // PrimeRx Gateway API endpoints
  app.get("/api/admin/primerx/api-status", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const configStatus = primeRxApi.getConfigStatus();
      if (!configStatus.configured) {
        return res.json({
          configured: false,
          status: "not_configured",
          message: "PrimeRx API credentials not set",
          missingVars: configStatus.missing,
        });
      }
      const health = await primeRxApi.healthCheck();
      res.json({
        configured: true,
        status: health.success ? "connected" : "error",
        message: health.error || "Connected",
        tokenStatus: health.success ? "valid" : "failed",
      });
    } catch (error: unknown) {
      res.status(500).json({ configured: false, status: "error", message: "Failed to check API status" });
    }
  });

  app.post("/api/admin/primerx/api-sync-patient", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { patientId } = z.object({ patientId: z.string() }).parse(req.body);
      const user = await storage.getUser(patientId);
      if (!user || !user.primeRxPatientId) {
        return res.status(400).json({ success: false, message: "Patient not linked to PrimeRx" });
      }

      if (!primeRxApi.isConfigured()) {
        return res.status(400).json({ success: false, message: "PrimeRx API not configured" });
      }

      const primeRxNo = parseInt(user.primeRxPatientId, 10);
      if (isNaN(primeRxNo)) {
        return res.status(400).json({ success: false, message: "Invalid PrimeRx patient number" });
      }

      const profileResult = await primeRxApi.getPatientProfile(primeRxNo);
      if (!profileResult.success || !profileResult.data) {
        await storage.createSyncLog({
          syncType: "api_profile_sync",
          primeRxId: user.primeRxPatientId,
          status: "failed",
          errorMessage: profileResult.error || "Failed to fetch profile",
          patientName: `${user.firstName} ${user.lastName}`,
        });
        return res.status(500).json({ success: false, message: profileResult.error || "Failed to fetch profile from PrimeRx" });
      }

      const profile = profileResult.data;
      const updateData: Record<string, unknown> = {};

      if (profile.Email) updateData.email = profile.Email;
      if (profile.Language) updateData.language = profile.Language;
      if (profile.MRN) updateData.mrn = profile.MRN;
      if (profile.ChartNo) updateData.chartNo = profile.ChartNo;
      if (profile.MiddleInitials) updateData.middleInitial = profile.MiddleInitials;

      if (profile.Address && Array.isArray(profile.Address) && profile.Address.length > 0) {
        const primary = profile.Address.find(a => a.IsPrimary === "Y") || profile.Address[0];
        updateData.address = [primary.StreetLine1, primary.StreetLine2, primary.City, primary.State, primary.ZipCode].filter(Boolean).join(", ");
      }

      if (profile.Insurance && profile.Insurance.length > 0) {
        const primaryIns = profile.Insurance.find(i => i.IsPrimary === "Y") || profile.Insurance[0];
        updateData.insuranceProvider = primaryIns.InsCode;
        updateData.insurancePolicyNumber = primaryIns.InsuranceID;
        updateData.insuranceGroupNumber = primaryIns.GroupNumber;
        updateData.insuranceData = profile.Insurance.map(i => ({
          provider: i.InsCode,
          policyNumber: i.InsuranceID,
          groupNumber: i.GroupNumber,
          binNo: i.BinNo,
          pcn: i.PCN,
          isPrimary: i.IsPrimary === "Y",
        }));
      }

      if (profile.Allergies && profile.Allergies.length > 0) {
        const allergyNames = profile.Allergies
          .filter(a => a.Name && a.Name !== "No Known Allergies")
          .map(a => a.Name);
        if (allergyNames.length > 0) {
          updateData.allergies = allergyNames.join(", ");
        }
      }

      if (profile.Diagnosis && profile.Diagnosis.length > 0) {
        const diagList = profile.Diagnosis
          .filter(d => d.DiagName || d.DiagCode)
          .map(d => d.DiagName ? `${d.DiagName} (${d.DiagCode})` : d.DiagCode);
        if (diagList.length > 0) {
          updateData.diagnosis = diagList.join(", ");
        }
      }

      if (Object.keys(updateData).length > 0) {
        await storage.updateUserProfile(patientId, updateData);
      }

      await storage.createSyncLog({
        syncType: "api_profile_sync",
        primeRxId: user.primeRxPatientId,
        status: "success",
        patientName: `${user.firstName} ${user.lastName}`,
        syncData: { fieldsUpdated: Object.keys(updateData) },
      });

      console.log(`[PrimeRx API] Synced profile for user ${user.id} (PrimeRx #${user.primeRxPatientId})`);
      broadcastUpdate("patients", { type: "api_profile_sync", patientId });
      res.json({ success: true, fieldsUpdated: Object.keys(updateData), message: `Profile enriched with ${Object.keys(updateData).length} fields` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[PrimeRx API] Profile sync error:", message);
      res.status(500).json({ success: false, message: "Failed to sync patient profile" });
    }
  });

  app.post("/api/admin/primerx/api-search-patient", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parseResult = z.object({
        searchType: z.enum(["name", "phone", "dob"]),
        value: z.string().min(1),
      }).safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: "Invalid search parameters: " + parseResult.error.issues.map(i => i.message).join(", ") });
      }

      const { searchType, value } = parseResult.data;

      if (!primeRxApi.isConfigured()) {
        return res.status(400).json({ success: false, message: "PrimeRx API not configured" });
      }

      let result;
      if (searchType === "phone") {
        result = await primeRxApi.searchPatientByPhone(value);
      } else if (searchType === "dob") {
        result = await primeRxApi.searchPatientByDOB(value);
      } else {
        const parts = value.split(" ");
        result = await primeRxApi.searchPatient(parts[0] || "", parts.slice(1).join(" ") || "");
      }

      if (!result.success) {
        return res.status(502).json({ success: false, message: result.error });
      }

      res.json({ success: true, patients: result.data || [] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, message });
    }
  });

  app.post("/api/admin/primerx/api-rx-detail", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parseResult = z.object({
        rxNo: z.number().int().positive(),
        refillNo: z.number().int().min(0).default(0),
      }).safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: "Invalid parameters: " + parseResult.error.issues.map(i => i.message).join(", ") });
      }

      const { rxNo, refillNo } = parseResult.data;

      if (!primeRxApi.isConfigured()) {
        return res.status(400).json({ success: false, message: "PrimeRx API not configured" });
      }

      const result = await primeRxApi.getPrescriptionDetail(rxNo, refillNo);
      if (!result.success) {
        return res.status(502).json({ success: false, message: result.error });
      }

      res.json({ success: true, prescription: result.data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, message });
    }
  });

  app.post("/api/admin/primerx/api-change-queue", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const parseResult = z.object({
        rxNo: z.number().int().positive(),
        refillNo: z.number().int().min(0),
        fromQueueName: z.string().min(1),
        toQueueName: z.string().min(1),
      }).safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: "Invalid parameters: " + parseResult.error.issues.map(i => i.message).join(", ") });
      }

      const params = parseResult.data;

      if (!primeRxApi.isConfigured()) {
        return res.status(400).json({ success: false, message: "PrimeRx API not configured" });
      }

      const result = await primeRxApi.changeWorkflowQueue({
        RxNo: params.rxNo,
        RefillNo: params.refillNo,
        FromQueueName: params.fromQueueName,
        ToQueueName: params.toQueueName,
      });

      await storage.createSyncLog({
        syncType: "api_queue_change",
        rxNo: String(params.rxNo),
        workflowTransition: `${params.fromQueueName} → ${params.toQueueName}`,
        status: result.success ? "success" : "failed",
        errorMessage: result.error,
        patientName: `Rx#${params.rxNo}`,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, message: result.error });
      }

      res.json({ success: true, message: "Queue changed successfully" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, message });
    }
  });

  app.post("/api/admin/primerx/api-refill", isAuthenticated, isAdmin, async (req, res) => {
    const parsed = z.object({
      patientId: z.string(),
      rxNumbers: z.array(z.string()),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid request: " + parsed.error.errors.map(e => e.message).join(", ") });
    }

    try {
      const idempotencyKey = normalizeIdempotencyKey(req.header("Idempotency-Key"));
      if (!idempotencyKey) {
        return res.status(400).json({ success: false, message: "A valid Idempotency-Key header is required" });
      }
      const { patientId, rxNumbers } = parsed.data;
      const user = await storage.getUser(patientId);
      if (!user) {
        return res.status(404).json({ success: false, message: "Patient not found" });
      }
      if (!primeRxApi.isConfigured()) {
        return res.status(400).json({ success: false, message: "PrimeRx API not configured" });
      }

      const rxList = await storage.getPrescriptionsByUserId(patientId);
      const refillItems: { RxNo: number; RefillNo: number }[] = [];

      for (const rxNum of rxNumbers) {
        const rx = rxList.find((r) => r.rxNumber === rxNum);
        if (rx && rx.rxNumber) {
          const rxNoParsed = parseInt(rx.rxNumber, 10);
          if (!Number.isInteger(rxNoParsed) || rxNoParsed <= 0) continue;
          refillItems.push({
            RxNo: rxNoParsed,
            RefillNo: (rx.refillNo ?? 0) + 1,
          });
        }
      }

      if (refillItems.length === 0) {
        return res.status(400).json({ success: false, message: "No valid prescriptions found for refill" });
      }

      const idempotency = await claimRequest(`admin-primerx-refill:${patientId}`, idempotencyKey, parsed.data);
      if (idempotency?.kind === "mismatch") {
        return res.status(409).json({ success: false, message: "Idempotency-Key was already used with a different request", correlationId: idempotency.correlationId });
      }
      if (idempotency?.kind === "duplicate") return res.status(idempotency.statusCode).json(idempotency.body);
      const result = await primeRxApi.requestRefill(refillItems);

      const isBusinessFailure = result.success && result.data?.Success === false;
      const finalSuccess = result.success && !isBusinessFailure;
      const errorMsg = isBusinessFailure ? (result.data?.Message || "PrimeRx rejected the refill request") : result.error;

      await storage.createSyncLog({
        syncType: "refill_request",
        primeRxId: user.primeRxPatientId || "",
        status: finalSuccess ? "success" : "failed",
        errorMessage: errorMsg,
        patientName: `${user.firstName} ${user.lastName}`,
         syncData: { rxNumbers, refillItems, response: result.data, source: "admin", correlationId: idempotency?.correlationId },
      });

      if (!finalSuccess) {
        const body = { success: false, message: errorMsg, correlationId: idempotency?.correlationId };
         await completeRequest(`admin-primerx-refill:${patientId}`, idempotencyKey, 500, body);
        return res.status(500).json(body);
      }

      console.log(`[PrimeRx API] Admin refill request for user ${user.id}: ${rxNumbers.length} Rx(s)`);
       const body = { success: true, message: `Refill requested for ${refillItems.length} prescription(s)`, correlationId: idempotency?.correlationId };
       await completeRequest(`admin-primerx-refill:${patientId}`, idempotencyKey, 200, body);
       res.json(body);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, message });
    }
  });

  app.post("/api/external/primerx/refill-request", requireApiKey, async (req, res) => {
    const parsed = z.object({
      userId: z.string(),
      rxNumbers: z.array(z.string()),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid request: " + parsed.error.errors.map(e => e.message).join(", ") });
    }

    try {
      const idempotencyKey = normalizeIdempotencyKey(req.header("Idempotency-Key"));
      if (!idempotencyKey) {
        return res.status(400).json({ success: false, message: "A valid Idempotency-Key header is required" });
      }
      const { userId, rxNumbers } = parsed.data;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "Patient not found" });
      }
      const idempotency = await claimRequest(`external-primerx-refill:${userId}`, idempotencyKey, parsed.data);
      if (idempotency?.kind === "mismatch") {
        return res.status(409).json({ success: false, message: "Idempotency-Key was already used with a different request", correlationId: idempotency.correlationId });
      }
      if (idempotency?.kind === "duplicate") return res.status(idempotency.statusCode).json(idempotency.body);

      if (!primeRxApi.isConfigured()) {
        await storage.createSyncLog({
          syncType: "refill_request",
          primeRxId: user.primeRxPatientId || "",
          status: "failed",
          errorMessage: "PrimeRx API not configured",
           patientName: `${user.firstName} ${user.lastName}`,
           syncData: { correlationId: idempotency?.correlationId },
        });
        const body = { success: false, message: "PrimeRx API not configured", correlationId: idempotency?.correlationId };
        await completeRequest(`external-primerx-refill:${userId}`, idempotencyKey, 400, body);
        return res.status(400).json(body);
      }

      const rxList = await storage.getPrescriptionsByUserId(userId);
      const refillItems: { RxNo: number; RefillNo: number }[] = [];

      for (const rxNum of rxNumbers) {
        const rx = rxList.find((r) => r.rxNumber === rxNum);
        if (rx && rx.rxNumber) {
          const rxNoParsed = parseInt(rx.rxNumber, 10);
          if (!Number.isInteger(rxNoParsed) || rxNoParsed <= 0) continue;
          refillItems.push({
            RxNo: rxNoParsed,
            RefillNo: (rx.refillNo ?? 0) + 1,
          });
        }
      }

      if (refillItems.length === 0) {
        const body = { success: false, message: "No valid prescriptions found for refill", correlationId: idempotency?.correlationId };
        await completeRequest(`external-primerx-refill:${userId}`, idempotencyKey, 400, body);
        return res.status(400).json(body);
      }

      const result = await primeRxApi.requestRefill(refillItems);

      const isBusinessFailure = result.success && result.data?.Success === false;
      const finalSuccess = result.success && !isBusinessFailure;
      const errorMsg = isBusinessFailure ? (result.data?.Message || "PrimeRx rejected the refill request") : result.error;

      await storage.createSyncLog({
        syncType: "refill_request",
        primeRxId: user.primeRxPatientId || "",
        status: finalSuccess ? "success" : "failed",
        errorMessage: errorMsg,
        patientName: `${user.firstName} ${user.lastName}`,
         syncData: { rxNumbers, refillItems, response: result.data, correlationId: idempotency?.correlationId },
      });

      if (!finalSuccess) {
         const body = { success: false, message: errorMsg, correlationId: idempotency?.correlationId };
         await completeRequest(`external-primerx-refill:${userId}`, idempotencyKey, 500, body);
         return res.status(500).json(body);
      }

      console.log(`[PrimeRx API] Refill request for user ${user.id}: ${rxNumbers.length} Rx(s)`);
       const body = { success: true, message: `Refill requested for ${refillItems.length} prescription(s)`, correlationId: idempotency?.correlationId };
       await completeRequest(`external-primerx-refill:${userId}`, idempotencyKey, 200, body);
       res.json(body);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[PrimeRx API] Refill request error:", message);
      res.status(500).json({ success: false, message: "Failed to process refill request" });
    }
  });

  // External: App submits a prescription transfer request
  app.post("/api/external/transfer-request", requireApiKey, async (req, res) => {
    const bodySchema = z.object({
      // At least one patient identifier is required
      patientId: z.string().optional(),
      concordiaCareUserId: z.string().optional(),
      email: z.string().email().optional(),
      // App sends "currentPharmacy*" (patient's perspective); we store as previousPharmacy internally
      currentPharmacyName: z.string().min(1),
      currentPharmacyPhone: z.string().optional().nullable(),
      currentPharmacyAddress: z.string().optional().nullable(),
      // Medication list is required from the app
      medications: z.array(z.string()).min(1, "At least one medication is required"),
      notes: z.string().optional().nullable(),
    }).refine(
      (d) => !!(d.patientId || d.concordiaCareUserId || d.email),
      { message: "One of patientId, concordiaCareUserId, or email is required" }
    );

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid request: " + parsed.error.errors.map((e) => e.message).join(", ") });
    }

    try {
      const { patientId, concordiaCareUserId, email, currentPharmacyName, currentPharmacyPhone, currentPharmacyAddress, medications, notes } = parsed.data;

      // Resolve patient record — cascade through all three identifiers
      let patient: Awaited<ReturnType<typeof storage.getUser>> | undefined;
      if (patientId) {
        patient = await storage.getUser(patientId) ?? undefined;
      }
      if (!patient && concordiaCareUserId) {
        patient = await storage.getUserByConcordiaCareUserId(concordiaCareUserId) ?? undefined;
      }
      if (!patient && email) {
        patient = await storage.getUserByEmail(email) ?? undefined;
      }

      // When the caller supplied only an ID-based identifier and the patient is
      // not found, we cannot create a meaningful request — return early so the
      // app knows to surface a friendly error.
      if (!patient && !email) {
        return res.status(404).json({ success: false, message: "Patient not found. Please include the patient email address." });
      }

      const contactName = patient
        ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || email || "App User"
        : (email || "App User");
      const phoneNumber = patient?.phoneNumber || "—";
      const wellnessPackEligible = medications.length >= 10;
      const appNotes = [
        "Submitted via ConcordiaCare app",
        `Medications: ${medications.join(", ")}`,
        notes,
      ].filter(Boolean).join(" | ");

      const request = await storage.createTransferRequest({
        contactName,
        phoneNumber,
        email: patient?.email ?? email ?? null,
        mode: "form_submission",
        previousPharmacyName: currentPharmacyName,
        previousPharmacyPhone: currentPharmacyPhone ?? null,
        previousPharmacyAddress: currentPharmacyAddress ?? null,
        labelImageUrl: null,
        expectedMedCount: medications.length,
        status: "request_received",
        wellnessPackEligible,
        pendingPoints: 500,
        userId: patient?.id ?? null,
        notes: appNotes,
        source: "app",
      });

      broadcastUpdate("transfer-requests", { type: "new", data: request });

      // Fire-and-forget notifications via shared helper
      void sendTransferRequestNotifications({
        request,
        contactName,
        phoneNumber,
        email: patient?.email ?? email,
        mode: "form_submission",
        previousPharmacyName: currentPharmacyName,
        previousPharmacyPhone: currentPharmacyPhone ?? null,
        expectedMedCount: medications.length,
        wellnessPackEligible,
        source: "app",
        medications,
      });

      console.log(`[External] Transfer request from app — patient: ${contactName}, pharmacy: ${currentPharmacyName}`);
      res.status(201).json({ success: true, requestId: request.id, message: "Transfer request submitted. We will contact you shortly." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Transfer request error:", message);
      res.status(500).json({ success: false, message: "Failed to submit transfer request" });
    }
  });

  // External endpoint: Book a flu shot appointment from the ConcordiaCare app
  app.post("/api/external/flu-shot", requireApiKey, async (req, res) => {
    const bodySchema = z.object({
      patientId: z.string().optional(),
      concordiaCareUserId: z.string().optional(),
      email: z.string().email().optional(),
      scheduledDate: z.string().min(1),
      scheduledTime: z.string().min(1),
      fluShotType: z.string().min(1).default("Standard Flu Vaccine"),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phoneNumber: z.string().optional(),
      dateOfBirth: z.string().optional(),
      insuranceProvider: z.string().optional(),
      insurancePolicyNumber: z.string().optional(),
      notes: z.string().optional(),
    }).refine(
      (d) => !!(d.patientId || d.concordiaCareUserId || d.email),
      { message: "One of patientId, concordiaCareUserId, or email is required" }
    );

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid request: " + parsed.error.errors.map((e) => e.message).join(", ") });
    }

    try {
      const { patientId, concordiaCareUserId, email, scheduledDate, scheduledTime, fluShotType, dateOfBirth, insuranceProvider, insurancePolicyNumber, notes } = parsed.data;

      let patient: Awaited<ReturnType<typeof storage.getUser>> | undefined;
      if (patientId) patient = await storage.getUser(patientId) ?? undefined;
      if (!patient && concordiaCareUserId) patient = await storage.getUserByConcordiaCareUserId(concordiaCareUserId) ?? undefined;
      if (!patient && email) patient = await storage.getUserByEmail(email) ?? undefined;
      if (!patient && !email) {
        return res.status(404).json({ success: false, message: "Patient not found. Please include the patient email address." });
      }

      const firstName = parsed.data.firstName || patient?.firstName || "";
      const lastName = parsed.data.lastName || patient?.lastName || "";
      const phoneNumber = parsed.data.phoneNumber || patient?.phoneNumber || "";
      const notificationEmail = patient?.email ?? email ?? null;

      if (!firstName || !lastName) {
        return res.status(400).json({ success: false, message: "Patient first and last name are required" });
      }
      if (!phoneNumber && !notificationEmail) {
        return res.status(400).json({ success: false, message: "Patient email address or phone number is required" });
      }

      const ticketNumber = generateTicketNumber("FLU");

      const newAppointment = await storage.createFluShotAppointment({
        ticketNumber,
        userId: patient?.id ?? null,
        firstName,
        lastName,
        email: notificationEmail,
        phoneNumber,
        dateOfBirth: dateOfBirth || "",
        address: "",
        insuranceProvider: insuranceProvider || "",
        insurancePolicyNumber: insurancePolicyNumber || "",
        scheduledDate: new Date(scheduledDate),
        scheduledTime,
        fluShotType,
        notes: notes || "",
        isExistingPatient: !!patient,
      });

      const notificationDelivery = await notifyFluShotAppointment(newAppointment);

      res.status(201).json({ success: true, ticketNumber, appointmentId: newAppointment.id, notificationDelivery });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Flu shot booking error:", message);
      res.status(500).json({ success: false, message: "Failed to book flu shot appointment" });
    }
  });

  // External endpoint: Insurance help request from the ConcordiaCare app
  app.post("/api/external/insurance-help", requireApiKey, async (req, res) => {
    const bodySchema = z.object({
      patientId: z.string().optional(),
      concordiaCareUserId: z.string().optional(),
      email: z.string().email().optional(),
      issueDescription: z.string().min(1),
      insuranceName: z.string().optional(),
      policyNumber: z.string().optional(),
    }).refine(
      (d) => !!(d.patientId || d.concordiaCareUserId || d.email),
      { message: "One of patientId, concordiaCareUserId, or email is required" }
    );

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid request: " + parsed.error.errors.map((e) => e.message).join(", ") });
    }

    try {
      const { patientId, concordiaCareUserId, email, issueDescription, insuranceName, policyNumber } = parsed.data;

      let patient: Awaited<ReturnType<typeof storage.getUser>> | undefined;
      if (patientId) patient = await storage.getUser(patientId) ?? undefined;
      if (!patient && concordiaCareUserId) patient = await storage.getUserByConcordiaCareUserId(concordiaCareUserId) ?? undefined;
      if (!patient && email) patient = await storage.getUserByEmail(email) ?? undefined;
      if (!patient && !email) {
        return res.status(404).json({ success: false, message: "Patient not found. Please include the patient email address." });
      }

      const name = patient
        ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || "App User"
        : "App User";
      const messageParts = [issueDescription];
      if (insuranceName) messageParts.push(`Insurance: ${insuranceName}`);
      if (policyNumber) messageParts.push(`Policy Number: ${policyNumber}`);
      messageParts.push("Submitted via ConcordiaCare app");

      const ticketNumber = generateTicketNumber("INS");

      const newRequest = await storage.createInsuranceAssistanceRequest({
        ticketNumber,
        userId: patient?.id ?? null,
        name,
        email: patient?.email ?? email ?? null,
        phone: patient?.phoneNumber ?? undefined,
        message: messageParts.join(" | "),
        status: "pending",
        source: "app",
      });

      res.status(201).json({ success: true, ticketNumber, requestId: newRequest.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Insurance help request error:", message);
      res.status(500).json({ success: false, message: "Failed to submit insurance help request" });
    }
  });

  // External endpoint: List all flu shot appointments for the authenticated patient
  app.get("/api/external/flu-shot", requireApiKey, async (req, res) => {
    const { concordiaCareUserId, email } = req.query as { concordiaCareUserId?: string; email?: string };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({ success: false, message: "One of concordiaCareUserId or email is required to verify identity" });
    }

    try {
      const { patientUserId, patientEmail } = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      if (!patientUserId && !patientEmail) {
        return res.json({ success: true, appointments: [] });
      }

      let appointments: import("@shared/schema").FluShotAppointment[] = [];
      if (patientUserId && patientEmail) {
        const byUserId = await storage.getFluShotAppointmentsByUserId(patientUserId);
        const byEmail = await storage.getFluShotAppointmentsByEmail(patientEmail);
        const seen = new Set<number>();
        for (const a of [...byUserId, ...byEmail]) {
          if (!seen.has(a.id)) { seen.add(a.id); appointments.push(a); }
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Flu shot list error:", message);
      res.status(500).json({ success: false, message: "Failed to retrieve appointments" });
    }
  });

  // External endpoint: Check flu shot appointment status from the ConcordiaCare app
  app.get("/api/external/flu-shot/:ticketNumber", requireApiKey, async (req, res) => {
    const { ticketNumber } = req.params;
    const { concordiaCareUserId, email } = req.query as { concordiaCareUserId?: string; email?: string };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({ success: false, message: "One of concordiaCareUserId or email is required to verify identity" });
    }

    try {
      const appointment = await storage.getFluShotAppointmentByTicketNumber(ticketNumber);

      // Resolve the requesting patient's identity before comparing — collect all
      // known identifiers so we can verify ownership without leaking whether the
      // ticket exists via divergent status codes.
      const identity = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      // Check ownership — return the same 404 whether ticket is absent or not owned,
      // so callers cannot enumerate valid ticket numbers.
      if (!isFluShotTicketOwned(appointment, identity)) {
        return res.status(404).json({ success: false, message: "Appointment not found" });
      }

      // appointment is non-null here — isFluShotTicketOwned returns false for undefined/null.
      const appt = appointment!;
      return res.json({
        success: true,
        ticketNumber: appt.ticketNumber,
        status: appt.status,
        scheduledDate: appt.scheduledDate,
        scheduledTime: appt.scheduledTime,
        fluShotType: appt.fluShotType,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Flu shot status check error:", message);
      res.status(500).json({ success: false, message: "Failed to retrieve appointment status" });
    }
  });

  // External endpoint: List all insurance help requests for the authenticated patient
  app.get("/api/external/insurance-help", requireApiKey, async (req, res) => {
    const { concordiaCareUserId, email } = req.query as { concordiaCareUserId?: string; email?: string };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({ success: false, message: "One of concordiaCareUserId or email is required to verify identity" });
    }

    try {
      const { patientUserId, patientEmail } = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      if (!patientUserId && !patientEmail) {
        return res.json({ success: true, requests: [] });
      }

      let requests: import("@shared/schema").InsuranceAssistanceRequest[] = [];
      if (patientUserId && patientEmail) {
        const byUserId = await storage.getInsuranceAssistanceRequestsByUserId(patientUserId);
        const byEmail = await storage.getInsuranceAssistanceRequestsByEmail(patientEmail);
        const seen = new Set<string>();
        for (const r of [...byUserId, ...byEmail]) {
          if (!seen.has(r.id)) { seen.add(r.id); requests.push(r); }
        }
      } else if (patientUserId) {
        requests = await storage.getInsuranceAssistanceRequestsByUserId(patientUserId);
      } else if (patientEmail) {
        requests = await storage.getInsuranceAssistanceRequestsByEmail(patientEmail);
      }

      return res.json({
        success: true,
        requests: requests.map((r) => {
          const entry: Record<string, unknown> = {
            ticketNumber: r.ticketNumber,
            status: r.status,
          };
          if (r.adminNotes) {
            entry.adminNotes = r.adminNotes;
          }
          return entry;
        }),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Insurance help list error:", message);
      res.status(500).json({ success: false, message: "Failed to retrieve insurance help requests" });
    }
  });

  // External endpoint: Check insurance help request status from the ConcordiaCare app
  app.get("/api/external/insurance-help/:ticketNumber", requireApiKey, async (req, res) => {
    const { ticketNumber } = req.params;
    const { concordiaCareUserId, email } = req.query as { concordiaCareUserId?: string; email?: string };

    if (!concordiaCareUserId && !email) {
      return res.status(400).json({ success: false, message: "One of concordiaCareUserId or email is required to verify identity" });
    }

    try {
      const request = await storage.getInsuranceAssistanceRequestByTicketNumber(ticketNumber);

      // Resolve the requesting patient's identity before comparing — collect all
      // known identifiers so we can verify ownership without leaking whether the
      // ticket exists via divergent status codes.
      const identity = await resolvePatientIdentity(concordiaCareUserId, email, storage);

      // Check ownership — return the same 404 whether request is absent or not owned,
      // so callers cannot enumerate valid ticket numbers.
      if (!isInsuranceTicketOwned(request, identity)) {
        return res.status(404).json({ success: false, message: "Insurance help request not found" });
      }

      // request is non-null here — isInsuranceTicketOwned returns false for undefined/null.
      const req2 = request!;
      const responseBody: Record<string, unknown> = {
        success: true,
        ticketNumber: req2.ticketNumber,
        status: req2.status,
      };
      if (req2.adminNotes) {
        responseBody.adminNotes = req2.adminNotes;
      }

      return res.json(responseBody);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Insurance help status check error:", message);
      res.status(500).json({ success: false, message: "Failed to retrieve insurance help request status" });
    }
  });

  // External endpoint: Doctor match / intro request from the ConcordiaCare app
  app.post("/api/external/doctor-match", requireApiKey, async (req, res) => {
    const bodySchema = z.object({
      patientId: z.string().optional(),
      concordiaCareUserId: z.string().optional(),
      email: z.string().email().optional(),
      specialty: z.string().min(1),
      notes: z.string().optional(),
      language: z.string().optional().default("English"),
      genderPreference: z.string().optional().default("any"),
      borough: z.string().optional().default("any"),
    }).refine(
      (d) => !!(d.patientId || d.concordiaCareUserId || d.email),
      { message: "One of patientId, concordiaCareUserId, or email is required" }
    );

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid request: " + parsed.error.errors.map((e) => e.message).join(", ") });
    }

    try {
      const { patientId, concordiaCareUserId, email, specialty, notes, language, genderPreference, borough } = parsed.data;

      let patient: Awaited<ReturnType<typeof storage.getUser>> | undefined;
      if (patientId) patient = await storage.getUser(patientId) ?? undefined;
      if (!patient && concordiaCareUserId) patient = await storage.getUserByConcordiaCareUserId(concordiaCareUserId) ?? undefined;
      if (!patient && email) patient = await storage.getUserByEmail(email) ?? undefined;
      if (!patient && !email) {
        return res.status(404).json({ success: false, message: "Patient not found. Please include the patient email address." });
      }

      const patientName = patient
        ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() || undefined
        : undefined;

      const lead = await storage.createDoctorMatchLead({
        specialty,
        language: language ?? "English",
        genderPreference: genderPreference ?? "any",
        borough: borough ?? "any",
        patientName: patientName ?? null,
        patientPhone: patient?.phoneNumber ?? null,
        patientEmail: patient?.email ?? email ?? null,
        patientNotes: notes ?? null,
        requestedAt: new Date(),
        source: "app",
      });

      res.status(201).json({ success: true, leadId: lead.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[External] Doctor match request error:", message);
      res.status(500).json({ success: false, message: "Failed to submit doctor match request" });
    }
  });

  app.post("/api/admin/primerx/sync-to-app", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { patientId } = z.object({ patientId: z.string() }).parse(req.body);
      const results: string[] = [];

      const blisterPatient = await storage.getBlisterPackPatientByUserId(patientId);
      if (blisterPatient) {
        await syncBlisterPackToApp("update", blisterPatient);
        results.push("blister pack synced");
      }

      const rxList = await storage.getPrescriptionsByUserId(patientId);
      if (rxList && rxList.length > 0) {
        await syncMedicationsToApp(patientId, undefined, true);
        results.push(`${rxList.length} medication(s) synced`);
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "No blister pack or medication data found for this patient" });
      }

      res.json({ success: true, message: `Patient synced to app: ${results.join(", ")}` });
    } catch (error: unknown) {
      console.error("[PrimeRx] Sync to app error:", error);
      res.status(500).json({ message: "Failed to sync to app" });
    }
  });

  // External patient data endpoints for ConcordiaCare app
  app.get("/api/external/patients", requireApiKey, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const patients = allUsers.filter((u: any) => u.role === "patient");
      const enriched = await Promise.all(patients.map(async (p: any) => {
        const [doctors, rxList, blisterPatient, attendantLink, pWallet, pStreaks] = await Promise.all([
          storage.getDoctorsByPatient(p.id),
          storage.getPrescriptionsByUserId(p.id),
          storage.getBlisterPackPatientByUserId(p.id),
          storage.getPatientAttendant(p.id),
          storage.getPointsWallet(p.id),
          storage.getUserStreaks(p.id),
        ]);
        let familyMembers: any[] = [];
        if (p.familyGroupId) {
          familyMembers = (await storage.getUsersByFamilyGroup(p.familyGroupId))
            .filter((fm: any) => fm.id !== p.id)
            .map((fm: any) => ({ id: fm.id, firstName: fm.firstName, lastName: fm.lastName, relationship: "family" }));
        }
        return {
          id: p.id,
          concordiaId: p.concordiaId ?? null,
          primeRxPatientId: p.primeRxPatientId,
          concordiaCareUserId: p.concordiaCareUserId,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phoneNumber,
          dateOfBirth: p.dateOfBirth,
          gender: p.gender,
          address: p.address,
           verifiedDeliveryAddress: p.verifiedDeliveryAddress ?? null,
          insurance: {
            provider: p.insuranceProvider,
            policyNumber: p.insurancePolicyNumber,
            groupNumber: p.insuranceGroupNumber,
          },
          allergies: p.allergies,
          medicalConditions: p.medicalConditions,
          diagnosis: p.diagnosis,
          familyGroupId: p.familyGroupId,
          familyMembers,
          doctors: doctors.map((d: any) => ({
            id: d.id, firstName: d.firstName, lastName: d.lastName,
            specialty: d.specialty, phone: d.phone, npi: d.npi,
          })),
          medications: blisterPatient?.medications || [],
          prescriptions: rxList.map((rx: any) => ({
            id: rx.id, rxNumber: rx.rxNumber, medicationName: rx.medicationName,
            dosage: rx.dosage, quantity: rx.quantity, refillsRemaining: rx.refillsRemaining,
            status: rx.status, instructions: rx.instructions,
            prescribedBy: rx.prescribedBy, frequency: rx.frequency,
            nextRefillDate: rx.nextRefillDate, lastFilledDate: rx.lastFilledDate,
            ndc: rx.ndc, strength: rx.strength,
            genericName: rx.genericName, brandName: rx.brandName,
            copayAmount: rx.copayAmount,
          })),
          caregiver: attendantLink ? {
            id: attendantLink.attendant.id,
            firstName: attendantLink.attendant.firstName,
            lastName: attendantLink.attendant.lastName,
            phone: attendantLink.attendant.phoneNumber,
          } : null,
          blisterPackStatus: blisterPatient?.status || null,
          loyalty: {
            currentBalance: pWallet?.currentBalance || 0,
            lifetimeEarned: pWallet?.lifetimeEarned || 0,
            streaks: pStreaks.map((s: any) => ({ type: s.streakType, currentCount: s.currentCount })),
          },
        };
      }));
      res.json(enriched);
    } catch (error) {
      console.error("[External] Error fetching patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  app.get("/api/external/patients/:id", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const [doctors, rxList, blisterPatient, attendantLink, pWallet, pStreaks] = await Promise.all([
        storage.getDoctorsByPatient(user.id),
        storage.getPrescriptionsByUserId(user.id),
        storage.getBlisterPackPatientByUserId(user.id),
        storage.getPatientAttendant(user.id),
        storage.getPointsWallet(user.id),
        storage.getUserStreaks(user.id),
      ]);
      let familyMembers: any[] = [];
      if (user.familyGroupId) {
        familyMembers = (await storage.getUsersByFamilyGroup(user.familyGroupId))
          .filter((fm: any) => fm.id !== user.id)
          .map((fm: any) => ({ id: fm.id, firstName: fm.firstName, lastName: fm.lastName }));
      }

      const doseLogs = blisterPatient
        ? await db.select().from(blisterDoseLogs).where(eq(blisterDoseLogs.blisterPatientId, blisterPatient.id)).orderBy(desc(blisterDoseLogs.actionTime))
        : [];
      const totalDoses = doseLogs.length;
      const takenDoses = doseLogs.filter((d: any) => d.action === "taken").length;
      const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : null;

      res.json({
        id: user.id,
        concordiaId: user.concordiaId ?? null,
        primeRxPatientId: user.primeRxPatientId,
        concordiaCareUserId: user.concordiaCareUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        address: user.address,
         verifiedDeliveryAddress: user.verifiedDeliveryAddress ?? null,
        insurance: {
          provider: user.insuranceProvider,
          policyNumber: user.insurancePolicyNumber,
          groupNumber: user.insuranceGroupNumber,
        },
        allergies: user.allergies,
        medicalConditions: user.medicalConditions,
        diagnosis: user.diagnosis,
        familyGroupId: user.familyGroupId,
        familyMembers,
        doctors: doctors.map((d: any) => ({
          id: d.id, firstName: d.firstName, lastName: d.lastName,
          specialty: d.specialty, phone: d.phone, fax: d.fax, npi: d.npi,
        })),
        medications: blisterPatient?.medications || [],
        prescriptions: rxList.map((rx: any) => ({
          id: rx.id, rxNumber: rx.rxNumber, medicationName: rx.medicationName,
          dosage: rx.dosage, quantity: rx.quantity, refillsRemaining: rx.refillsRemaining,
          status: rx.status, instructions: rx.instructions,
          prescribedBy: rx.prescribedBy, frequency: rx.frequency,
          nextRefillDate: rx.nextRefillDate, lastFilledDate: rx.lastFilledDate,
          ndc: rx.ndc, strength: rx.strength,
          genericName: rx.genericName, brandName: rx.brandName,
          copayAmount: rx.copayAmount,
        })),
        adherence: { totalDoses, takenDoses, rate: adherenceRate },
        caregiver: attendantLink ? {
          id: attendantLink.attendant.id,
          firstName: attendantLink.attendant.firstName,
          lastName: attendantLink.attendant.lastName,
          phone: attendantLink.attendant.phoneNumber,
          permissions: {
            canManagePrescriptions: attendantLink.canManagePrescriptions,
            canViewMedicalInfo: attendantLink.canViewMedicalInfo,
            canRequestRefills: attendantLink.canRequestRefills,
          },
        } : null,
        blisterPackStatus: blisterPatient?.status || null,
        loyalty: {
          currentBalance: pWallet?.currentBalance || 0,
          lifetimeEarned: pWallet?.lifetimeEarned || 0,
          lifetimeRedeemed: pWallet?.lifetimeRedeemed || 0,
          streaks: pStreaks.map((s: any) => ({
            type: s.streakType, currentCount: s.currentCount, bestCount: s.bestCount,
          })),
        },
      });
    } catch (error) {
      console.error("[External] Error fetching patient:", error);
      res.status(500).json({ message: "Failed to fetch patient" });
    }
  });

  app.get("/api/external/patients/updated-since/:timestamp", requireApiKey, async (req, res) => {
    try {
      const ts = parseInt(req.params.timestamp);
      if (isNaN(ts) || ts < 0) {
        return res.status(400).json({ message: "Invalid timestamp" });
      }
      const since = new Date(ts);
      const allUsers = await storage.getAllUsers();
      const updated = allUsers.filter((u: any) => u.role === "patient" && new Date(u.updatedAt) > since);
      res.json(updated.map((u: any) => ({
        id: u.id,
        concordiaId: u.concordiaId ?? null,
        primeRxPatientId: u.primeRxPatientId,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phoneNumber,
        email: u.email,
         address: u.address,
         verifiedDeliveryAddress: u.verifiedDeliveryAddress ?? null,
        updatedAt: u.updatedAt,
      })));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch updated patients" });
    }
  });

  app.post("/api/external/match-patient", requireApiKey, async (req, res) => {
    try {
      const matchData = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        dateOfBirth: z.string().optional(),
        email: z.string().optional(),
        phoneNumber: z.string().optional(),
        concordiaCareUserId: z.string().optional(),
      }).parse(req.body);

      if (!matchData.email && !matchData.phoneNumber) {
        return res.status(400).json({ matched: false, message: "At least email or phone number is required" });
      }

      let candidates: any[] = [];

      if (matchData.email) {
        const byEmail = await storage.getUserByEmail(matchData.email);
        if (byEmail && byEmail.role === "patient") candidates.push(byEmail);
      }

      if (matchData.phoneNumber) {
        const byPhone = await storage.getUsersByPhone(matchData.phoneNumber);
        const phonePatients = byPhone.filter((u: any) => u.role === "patient");
        for (const p of phonePatients) {
          if (!candidates.find((c: any) => c.id === p.id)) candidates.push(p);
        }
      }

      if (candidates.length === 0) {
        return res.json({ matched: false });
      }

      const normName = (s: string) => s.toLowerCase().trim();
      const normDate = (d: string | null | undefined) => {
        if (!d) return null;
        try { return new Date(d).toISOString().split("T")[0]; } catch { return null; }
      };

      let bestMatch: any = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        const namesMatch =
          normName(candidate.firstName || "") === normName(matchData.firstName) &&
          normName(candidate.lastName || "") === normName(matchData.lastName);
        if (!namesMatch) continue;

        if (matchData.dateOfBirth) {
          const candidateDob = normDate(candidate.dateOfBirth);
          const requestedDob = normDate(matchData.dateOfBirth);
          if (!candidateDob || !requestedDob || candidateDob !== requestedDob) continue;
        }

        let score = 1;
        if (matchData.dateOfBirth) score += 1;
        if (matchData.email && candidate.email &&
            candidate.email.toLowerCase() === matchData.email.toLowerCase()) {
          score += 1;
        }
        if (matchData.phoneNumber && candidate.phoneNumber) {
          const cleanInput = matchData.phoneNumber.replace(/\D/g, "");
          const cleanCandidate = candidate.phoneNumber.replace(/\D/g, "");
          if (cleanInput === cleanCandidate) score += 1;
        }

        if (score >= 2 && score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      if (!bestMatch) {
        return res.json({ matched: false });
      }

      try {
        if (bestMatch.primeRxPatientId) {
          await syncMedicationsToApp(bestMatch.id, undefined, true);
          console.log(`[App Match] External match: synced medications for user ${bestMatch.id}`);
        }
        const blisterPatient = await storage.getBlisterPackPatientByUserId(bestMatch.id);
        if (blisterPatient) {
          await syncBlisterPackToApp("update", blisterPatient);
          console.log(`[App Match] External match: synced blister pack for user ${bestMatch.id}`);
        }
      } catch (e) {
        console.log(`[App Match] External match: sync skipped`);
      }

      const doctors = await storage.getDoctorsByPatient(bestMatch.id);
      const rxList = await storage.getPrescriptionsByUserId(bestMatch.id);
      const blisterPatient = await storage.getBlisterPackPatientByUserId(bestMatch.id);
      const attendantLink = await storage.getPatientAttendant(bestMatch.id);
      const wallet = await storage.getPointsWallet(bestMatch.id);
      const userStreaks = await storage.getUserStreaks(bestMatch.id);

      let familyMembers: any[] = [];
      if (bestMatch.familyGroupId) {
        familyMembers = (await storage.getUsersByFamilyGroup(bestMatch.familyGroupId))
          .filter((fm: any) => fm.id !== bestMatch.id)
          .map((fm: any) => ({ id: fm.id, firstName: fm.firstName, lastName: fm.lastName }));
      }

      res.json({
        matched: true,
        matchScore: bestScore,
        patient: {
          id: bestMatch.id,
          concordiaId: bestMatch.concordiaId ?? null,
          primeRxPatientId: bestMatch.primeRxPatientId,
          concordiaCareUserId: bestMatch.concordiaCareUserId,
          firstName: bestMatch.firstName,
          lastName: bestMatch.lastName,
          email: bestMatch.email,
          phone: bestMatch.phoneNumber,
          dateOfBirth: bestMatch.dateOfBirth,
          gender: bestMatch.gender,
          address: bestMatch.address,
          familyGroupId: bestMatch.familyGroupId,
          familyMembers,
          insurance: {
            provider: bestMatch.insuranceProvider,
            policyNumber: bestMatch.insurancePolicyNumber,
            groupNumber: bestMatch.insuranceGroupNumber,
          },
          allergies: bestMatch.allergies,
          medicalConditions: bestMatch.medicalConditions,
          diagnosis: bestMatch.diagnosis,
          doctors: doctors.map((d: any) => ({
            id: d.id, firstName: d.firstName, lastName: d.lastName,
            specialty: d.specialty, phone: d.phone, npi: d.npi,
          })),
          medications: blisterPatient?.medications || [],
          prescriptions: rxList.map((rx: any) => ({
            id: rx.id, rxNumber: rx.rxNumber, medicationName: rx.medicationName,
            dosage: rx.dosage, refillsRemaining: rx.refillsRemaining, status: rx.status,
          })),
          caregiver: attendantLink ? {
            id: attendantLink.attendant.id,
            firstName: attendantLink.attendant.firstName,
            lastName: attendantLink.attendant.lastName,
            phone: attendantLink.attendant.phoneNumber,
          } : null,
          blisterPackStatus: blisterPatient?.status || null,
          loyalty: {
            currentBalance: wallet?.currentBalance || 0,
            lifetimeEarned: wallet?.lifetimeEarned || 0,
            lifetimeRedeemed: wallet?.lifetimeRedeemed || 0,
            streaks: userStreaks.map((s: any) => ({
              type: s.streakType, currentCount: s.currentCount, bestCount: s.bestCount,
            })),
          },
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ matched: false, message: "Invalid data", errors: error.errors });
      }
      console.error("[External] Match patient error:", error);
      res.status(500).json({ matched: false, message: "Failed to match patient" });
    }
  });

  app.post("/api/external/link-patient", requireApiKey, async (req, res) => {
    try {
      const { concordiaCareUserId, pharmacyPatientId } = z.object({
        concordiaCareUserId: z.string().min(1),
        pharmacyPatientId: z.string().min(1),
      }).parse(req.body);

      const user = await storage.getUser(pharmacyPatientId);
      if (!user || user.role !== "patient") {
        return res.status(404).json({ message: "Patient not found" });
      }
      const linkResult = await storage.linkConcordiaCareUser(
        pharmacyPatientId,
        concordiaCareUserId,
      );
      if (linkResult === "not_found") {
        return res.status(404).json({ message: "Patient not found" });
      }
      if (linkResult === "conflict") {
        return res.status(409).json({
          message: "This app account or pharmacy patient is already linked to a different identity",
        });
      }

      try {
        if (user.primeRxPatientId) {
          await syncMedicationsToApp(pharmacyPatientId, undefined, true);
          console.log(`[App Match] External link: synced medications for user ${user.id}`);
        }
        const blisterPatient = await storage.getBlisterPackPatientByUserId(pharmacyPatientId);
        if (blisterPatient) {
          await syncBlisterPackToApp("update", blisterPatient);
          console.log(`[App Match] External link: synced blister pack for user ${user.id}`);
        }
      } catch (e) {
        console.log(`[App Match] External link: sync skipped`);
      }

      res.json({
        success: true,
        status: linkResult,
        message: "Patient linked to app user",
        patientId: pharmacyPatientId,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("[External] Link patient error:", error);
      res.status(500).json({ message: "Failed to link patient" });
    }
  });

  app.get("/api/external/patients/:id/wallet", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const wallet = await storage.getOrCreatePointsWallet(user.id);
      const userStreaks = await storage.getUserStreaks(user.id);

      res.json({
        wallet: {
          currentBalance: wallet.currentBalance,
          lifetimeEarned: wallet.lifetimeEarned,
          lifetimeRedeemed: wallet.lifetimeRedeemed,
          lifetimeExpired: wallet.lifetimeExpired,
          dailyPointsEarned: wallet.dailyPointsEarned,
          weeklyPointsEarned: wallet.weeklyPointsEarned,
        },
        streaks: userStreaks.map((s: any) => ({
          type: s.streakType,
          currentCount: s.currentCount,
          bestCount: s.bestCount,
          lastQualifyingActionAt: s.lastQualifyingActionAt,
        })),
      });
    } catch (error) {
      console.error("[External] Error fetching wallet:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  app.get("/api/external/patients/:id/points-history", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const limit = parseInt(req.query.limit as string) || 50;
      const ledger = await storage.getPointsLedger(user.id, limit);

      res.json(ledger.map((entry: any) => ({
        id: entry.id,
        actionType: entry.actionType,
        points: entry.points,
        balanceAfter: entry.balanceAfter,
        description: entry.description,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        createdAt: entry.createdAt,
      })));
    } catch (error) {
      console.error("[External] Error fetching points history:", error);
      res.status(500).json({ message: "Failed to fetch points history" });
    }
  });

  app.get("/api/external/patients/:id/rewards", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const availableRewards = await storage.getAvailableRewardsForUser(user.id);
      const allActiveRewards = await storage.getActiveRewards();
      const wallet = await storage.getPointsWallet(user.id);

      res.json({
        currentBalance: wallet?.currentBalance || 0,
        availableRewards: availableRewards.map((r: any) => ({
          id: r.id, name: r.name, description: r.description,
          pointsCost: r.pointsCost, rewardType: r.rewardType,
          discountValue: r.discountValue, discountType: r.discountType,
          canAfford: (wallet?.currentBalance || 0) >= r.pointsCost,
        })),
        allActiveRewards: allActiveRewards.map((r: any) => ({
          id: r.id, name: r.name, description: r.description,
          pointsCost: r.pointsCost, rewardType: r.rewardType,
          discountValue: r.discountValue, discountType: r.discountType,
        })),
      });
    } catch (error) {
      console.error("[External] Error fetching rewards:", error);
      res.status(500).json({ message: "Failed to fetch rewards" });
    }
  });

  app.post("/api/external/patients/:id/rewards/:rewardId/redeem", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const rewardId = parseInt(req.params.rewardId);
      if (isNaN(rewardId)) return res.status(400).json({ message: "Invalid reward ID" });

      const canRedeem = await storage.canUserRedeemReward(user.id, rewardId);
      if (!canRedeem.canRedeem) {
        return res.status(400).json({ message: canRedeem.reason || "Cannot redeem this reward" });
      }

      const { orderId } = z.object({ orderId: z.string().optional() }).parse(req.body || {});
      const redemption = await storage.redeemReward(user.id, rewardId, orderId);
      if (!redemption) {
        return res.status(400).json({ message: "Failed to redeem reward" });
      }

      const updatedWallet = await storage.getPointsWallet(user.id);
      res.json({
        success: true,
        redemption,
        updatedBalance: updatedWallet?.currentBalance || 0,
      });
    } catch (error: any) {
      console.error("[External] Error redeeming reward:", error);
      res.status(500).json({ message: "Failed to redeem reward" });
    }
  });

  app.get("/api/external/earning-rules", requireApiKey, async (req, res) => {
    try {
      const rules = await storage.getActiveEarningRules();
      res.json(rules.map((r: any) => ({
        id: r.id,
        ruleKey: r.ruleKey,
        actionType: r.actionType,
        name: r.name,
        description: r.description,
        basePoints: r.basePoints,
        pointsPerDollar: r.pointsPerDollar,
        category: r.category,
      })));
    } catch (error) {
      console.error("[External] Error fetching earning rules:", error);
      res.status(500).json({ message: "Failed to fetch earning rules" });
    }
  });

  // PharmFlow Insights API
  app.get("/api/external/pharmflow/insights", requireApiKey, async (req, res) => {
    try {
      const insights = await storage.getPharmFlowInsights();
      res.json(insights);
    } catch (error) {
      console.error("[External] Error fetching PharmFlow insights:", error);
      res.status(500).json({ message: "Failed to fetch PharmFlow insights" });
    }
  });

  // ConcordiaCare Patient Insights API
  app.get("/api/external/patients/:id/insights", requireApiKey, async (req, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "Patient not found" });
      }
      const insights = await storage.getPatientInsights(id);
      res.json({
        patientId: id,
        firstName: user.firstName,
        lastName: user.lastName,
        ...insights,
      });
    } catch (error) {
      console.error("[External] Error fetching patient insights:", error);
      res.status(500).json({ message: "Failed to fetch patient insights" });
    }
  });

  // Admin patient list API (comprehensive, for admin dashboard)
  app.get("/api/admin/patients", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const patients = allUsers.filter((u: any) => u.role === "patient");

      const enriched = await Promise.all(patients.map(async (p: any) => {
        const doctors = await storage.getDoctorsByPatient(p.id);
        const rxList = await storage.getPrescriptionsByUserId(p.id);
        const blisterPatient = await storage.getBlisterPackPatientByUserId(p.id);
        const attendantLink = await storage.getPatientAttendant(p.id);

        let adherenceRate: number | null = null;
        if (blisterPatient) {
          const doseLogs = await db.select().from(blisterDoseLogs).where(eq(blisterDoseLogs.blisterPatientId, blisterPatient.id));
          const total = doseLogs.length;
          const taken = doseLogs.filter((d: any) => d.action === "taken").length;
          adherenceRate = total > 0 ? Math.round((taken / total) * 100) : null;
        }

        let familyMembers: any[] = [];
        if (p.familyGroupId) {
          familyMembers = (await storage.getUsersByFamilyGroup(p.familyGroupId))
            .filter((fm: any) => fm.id !== p.id)
            .map((fm: any) => ({ id: fm.id, firstName: fm.firstName, lastName: fm.lastName }));
        }

        return {
          id: p.id,
          concordiaId: p.concordiaId ?? null,
          primeRxPatientId: p.primeRxPatientId,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phoneNumber,
          dateOfBirth: p.dateOfBirth,
          gender: p.gender,
          address: p.address,
          familyGroupId: p.familyGroupId,
          familyMembers,
          insurance: { provider: p.insuranceProvider, policyNumber: p.insurancePolicyNumber },
          allergies: p.allergies,
          medicalConditions: p.medicalConditions,
          diagnosis: p.diagnosis,
          doctorCount: doctors.length,
          doctors: doctors.map((d: any) => ({
            id: d.id, firstName: d.firstName, lastName: d.lastName, specialty: d.specialty,
            phone: d.phone, fax: d.fax, npi: d.npi, primeRxId: d.primeRxId,
          })),
          medicationCount: rxList.length,
          prescriptions: rxList.map((rx: any) => ({
            id: rx.id, rxNumber: rx.rxNumber, medicationName: rx.medicationName,
            dosage: rx.dosage, refillsRemaining: rx.refillsRemaining, status: rx.status,
          })),
          medications: blisterPatient?.medications || [],
          adherenceRate,
          blisterPackStatus: blisterPatient?.status || null,
          caregiver: attendantLink ? {
            id: attendantLink.attendant.id,
            firstName: attendantLink.attendant.firstName,
            lastName: attendantLink.attendant.lastName,
            phone: attendantLink.attendant.phoneNumber,
          } : null,
          lastSyncedToApp: blisterPatient?.lastSyncedToApp || null,
          usingApp: p.usingApp || false,
          concordiaCareUserId: p.concordiaCareUserId || null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("[Admin] Error fetching patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  // Admin single patient profile
  app.get("/api/admin/patients/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const [doctors, rxList, blisterPatient, attendantLink, wallet, userStreaks, userRedemptions, pointsLedgerEntries, deliveryInsights] = await Promise.all([
        storage.getDoctorsByPatient(user.id),
        storage.getPrescriptionsByUserId(user.id),
        storage.getBlisterPackPatientByUserId(user.id),
        storage.getPatientAttendant(user.id),
        storage.getPointsWallet(user.id),
        storage.getUserStreaks(user.id),
        storage.getUserRedemptions(user.id),
        storage.getPointsLedger(user.id, 10),
        storage.getPatientInsights(user.id),
      ]);

      let adherenceData: any = { totalDoses: 0, takenDoses: 0, skippedDoses: 0, missedDoses: 0, rate: null, recentLogs: [] };
      if (blisterPatient) {
        const doseLogs = await db.select().from(blisterDoseLogs)
          .where(eq(blisterDoseLogs.blisterPatientId, blisterPatient.id))
          .orderBy(desc(blisterDoseLogs.actionTime));
        adherenceData.totalDoses = doseLogs.length;
        adherenceData.takenDoses = doseLogs.filter((d: any) => d.action === "taken").length;
        adherenceData.skippedDoses = doseLogs.filter((d: any) => d.action === "skipped").length;
        adherenceData.missedDoses = doseLogs.filter((d: any) => d.action === "missed").length;
        adherenceData.rate = doseLogs.length > 0 ? Math.round((adherenceData.takenDoses / doseLogs.length) * 100) : null;
        adherenceData.recentLogs = doseLogs.slice(0, 20).map((d: any) => ({
          id: d.id, status: d.action, medicationName: d.medicationName,
          scheduledTime: d.scheduledTime, takenAt: d.actionTime, createdAt: d.actionTime,
        }));
      }

      let familyMembers: any[] = [];
      if (user.familyGroupId) {
        familyMembers = (await storage.getUsersByFamilyGroup(user.familyGroupId))
          .filter((fm: any) => fm.id !== user.id)
          .map((fm: any) => ({
            id: fm.id, firstName: fm.firstName, lastName: fm.lastName,
            phone: fm.phoneNumber, email: fm.email,
          }));
      }

      res.json({
        id: user.id,
        concordiaId: user.concordiaId ?? null,
        primeRxPatientId: user.primeRxPatientId,
        concordiaCareUserId: user.concordiaCareUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phoneNumber,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        address: user.address,
        familyGroupId: user.familyGroupId,
        familyMembers,
        insurance: {
          provider: user.insuranceProvider,
          policyNumber: user.insurancePolicyNumber,
          groupNumber: user.insuranceGroupNumber,
        },
        allergies: user.allergies,
        medicalConditions: user.medicalConditions,
        diagnosis: user.diagnosis,
        adminNotes: user.adminNotes,
        doctors,
        prescriptions: rxList,
        medications: blisterPatient?.medications || [],
        adherence: adherenceData,
        caregiver: attendantLink ? {
          id: attendantLink.attendant.id,
          firstName: attendantLink.attendant.firstName,
          lastName: attendantLink.attendant.lastName,
          phone: attendantLink.attendant.phoneNumber,
          email: attendantLink.attendant.email,
          permissions: {
            canManagePrescriptions: attendantLink.canManagePrescriptions,
            canViewMedicalInfo: attendantLink.canViewMedicalInfo,
            canRequestRefills: attendantLink.canRequestRefills,
            canPlaceOrders: attendantLink.canPlaceOrders,
          },
        } : null,
        blisterPack: blisterPatient ? {
          id: blisterPatient.id,
          status: blisterPatient.status,
          type: blisterPatient.blisterPackType,
          lastPackDate: blisterPatient.lastPackDate,
          nextPackDate: blisterPatient.nextPackDate,
          lastSyncedToApp: blisterPatient.lastSyncedToApp,
          concordiaCareId: blisterPatient.concordiaCareBlisterPackId,
        } : null,
        loyalty: {
          wallet: wallet ? {
            currentBalance: wallet.currentBalance,
            lifetimeEarned: wallet.lifetimeEarned,
            lifetimeRedeemed: wallet.lifetimeRedeemed,
            lifetimeExpired: wallet.lifetimeExpired,
          } : { currentBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, lifetimeExpired: 0 },
          streaks: userStreaks.map((s: any) => ({
            type: s.streakType,
            currentCount: s.currentCount,
            bestCount: s.bestCount,
            lastQualifyingActionAt: s.lastQualifyingActionAt,
          })),
          recentTransactions: pointsLedgerEntries.map((e: any) => ({
            id: e.id, actionType: e.actionType, points: e.points,
            balanceAfter: e.balanceAfter, description: e.description, createdAt: e.createdAt,
          })),
          redemptions: userRedemptions.map((r: any) => ({
            id: r.id, rewardName: r.reward?.name, pointsSpent: r.pointsSpent,
            status: r.status, createdAt: r.createdAt,
          })),
        },
        deliveryInsights: {
          totalOrders: deliveryInsights.totalOrders,
          totalSpending: deliveryInsights.totalSpending,
          monthlyAvgSpending: deliveryInsights.monthlyAvgSpending,
          orderTypeBreakdown: deliveryInsights.orderTypeBreakdown,
          deliveryMethodBreakdown: deliveryInsights.deliveryMethodBreakdown,
          courierBreakdown: deliveryInsights.courierBreakdown,
          predictedDeliveryPreference: deliveryInsights.predictedDeliveryPreference,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error("[Admin] Error fetching patient profile:", error);
      res.status(500).json({ message: "Failed to fetch patient profile" });
    }
  });

  // Get PrimeRx sync logs
  app.get("/api/admin/primerx/sync-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await storage.getSyncLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching sync logs:", error);
      res.status(500).json({ message: "Failed to fetch sync logs" });
    }
  });

  // PrimeRx Drug Dictionary routes
  app.get("/api/admin/drugs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const drugs = await storage.getAllDrugs();
      res.json(drugs);
    } catch (error) {
      console.error("Error fetching drugs:", error);
      res.status(500).json({ message: "Failed to fetch drug dictionary" });
    }
  });

  app.get("/api/admin/drugs/search", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ message: "Search query must be at least 2 characters" });
      }
      const drugs = await storage.searchDrugs(query);
      res.json(drugs);
    } catch (error) {
      console.error("Error searching drugs:", error);
      res.status(500).json({ message: "Failed to search drug dictionary" });
    }
  });

  app.get("/api/admin/drugs/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const drug = await storage.getDrug(id);
      if (!drug) {
        return res.status(404).json({ message: "Drug not found" });
      }
      res.json(drug);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid drug ID", errors: error.errors });
      }
      console.error("Error fetching drug:", error);
      res.status(500).json({ message: "Failed to fetch drug" });
    }
  });

  app.get("/api/admin/drugs/ndc/:ndc", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const ndc = req.params.ndc;
      const drug = await storage.getDrugByNdc(ndc);
      if (!drug) {
        return res.status(404).json({ message: "Drug not found" });
      }
      res.json(drug);
    } catch (error) {
      console.error("Error fetching drug by NDC:", error);
      res.status(500).json({ message: "Failed to fetch drug" });
    }
  });

  // Link prescription with drug info from dictionary
  app.patch("/api/admin/prescriptions/:id/link-drug", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { ndc } = z.object({ ndc: z.string() }).parse(req.body);
      
      const updated = await storage.updatePrescriptionWithDrugInfo(id, ndc);
      if (!updated) {
        return res.status(404).json({ message: "Prescription or drug not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error linking prescription with drug:", error);
      res.status(500).json({ message: "Failed to link prescription with drug info" });
    }
  });

  // Get audit logs with filtering
  app.get("/api/admin/audit-logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const querySchema = z.object({
        userId: z.string().uuid().optional(),
        actionType: z.enum(AUDIT_ACTION_TYPES).optional(),
        entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      });

      const validated = querySchema.parse(req.query);
      
      const filters = {
        userId: validated.userId,
        actionType: validated.actionType,
        entityType: validated.entityType,
        limit: validated.limit || 100,
      };
      
      const logs = await storage.getAuditLogs(filters);
      res.json(logs);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/fraud-alerts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const query = z.object({
        status: z.enum(["open", "reviewed", "resolved", "false_positive"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      }).parse(req.query);
      res.json(await listFraudAlerts(query));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      console.error("Error fetching fraud alerts:", error);
      res.status(500).json({ message: "Failed to fetch fraud alerts" });
    }
  });

  app.patch("/api/admin/fraud-alerts/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const input = z.object({
        status: z.enum(["reviewed", "resolved", "false_positive"]),
        resolution: z.string().trim().min(3).max(1000),
      }).parse(req.body);
      const reviewedBy = String(req.localUser?.id || req.user?.claims?.sub || req.session?.adminId || "");
      if (!reviewedBy) return res.status(401).json({ message: "Admin authentication required" });
      const alert = await reviewFraudAlert({ id, reviewedBy, ...input });
      if (!alert) return res.status(404).json({ message: "Fraud alert not found" });
      res.json(alert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid fraud alert review", errors: error.errors });
      }
      console.error("Error reviewing fraud alert:", error);
      res.status(500).json({ message: "Failed to review fraud alert" });
    }
  });

  // Get user notifications
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotificationsByUserId(userId, limit);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Get unread notification count
  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      
      const notification = await storage.markNotificationRead(id);
      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }
      
      if (notification.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json(notification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      await storage.markAllNotificationsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  // Generate ticket number helper
  const generateTicketNumber = (prefix: string) => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  };

  // Insurance assistance request submission (public or authenticated)
  app.post("/api/insurance-help", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub || null;
      
      const requestSchema = z.object({
        name: z.string().min(1),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        message: z.string().min(1),
      });
      
      const validatedData = requestSchema.parse(req.body);
      const ticketNumber = generateTicketNumber("INS");
      
      const newRequest = await storage.createInsuranceAssistanceRequest({
        userId,
        ticketNumber,
        name: validatedData.name,
        email: validatedData.email || null,
        phone: validatedData.phone,
        message: validatedData.message,
        status: "pending",
      });
      
      res.status(201).json(newRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating insurance assistance request:", error);
      res.status(500).json({ message: "Failed to create request" });
    }
  });

  // Get user's insurance assistance requests
  app.get("/api/insurance-help", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const requests = await storage.getInsuranceAssistanceRequestsByUserId(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching insurance requests:", error);
      res.status(500).json({ message: "Failed to fetch requests" });
    }
  });

  // Admin: Get all insurance assistance requests
  app.get("/api/admin/insurance-help", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getAllInsuranceAssistanceRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching insurance requests:", error);
      res.status(500).json({ message: "Failed to fetch requests" });
    }
  });

  // Blister Pack Enrollment endpoint - creates entries in blister_pack_patients table
  app.post("/api/blister-pack-enrollment", resolveUser, async (req: any, res) => {
    try {
      const userId = req.localUser?.role === "patient" ? req.localUser.id as string : null;
      
      const enrollmentSchema = z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        phone: z.string().min(10, "Phone number must be at least 10 digits").refine(
          (val) => val.replace(/\D/g, '').length >= 10,
          "Phone number must contain at least 10 digits"
        ),
        email: z.string().email().optional().or(z.literal("")),
        address: z.string().optional(),
        insuranceNumber: z.string().optional(),
        isNewPatient: z.boolean().optional().default(false),
        previousPharmacyName: z.string().optional(),
        previousPharmacyPhone: z.string().optional(),
      }).refine(
        (data) => {
          // If new patient, require previous pharmacy name
          if (data.isNewPatient && (!data.previousPharmacyName || data.previousPharmacyName.trim() === '')) {
            return false;
          }
          return true;
        },
        {
          message: "Previous pharmacy name is required for new patients",
          path: ["previousPharmacyName"],
        }
      );
      
      const validatedData = enrollmentSchema.parse(req.body);
      if (userId) {
        const claim = await claimRequest("blister-pack-enrollment", userId, { userId });
        if (!claim || claim.kind === "mismatch") {
          return res.status(409).json({ message: "Enrollment identity could not be confirmed" });
        }
        if (claim.kind === "duplicate") {
          if (claim.statusCode === 201 || claim.statusCode === 200) {
            return res.status(200).json(claim.body);
          }
          return res.status(409).json({ message: "Enrollment is already being processed" });
        }
        const existing = await storage.getBlisterPackPatientByUserId(userId);
        if (existing) {
          const previous = {
            success: true,
            patientId: existing.id,
            message: "Enrollment already submitted",
          };
          await completeRequest("blister-pack-enrollment", userId, 200, previous);
          return res.status(200).json(previous);
        }
      }
      const referenceNumber = generateTicketNumber("BL");
      
      // Split name into firstName and lastName
      const nameParts = validatedData.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "Patient";
      
      // Create blister pack patient record with pending status
      const newPatient = await storage.createBlisterPackPatient({
        firstName,
        lastName,
        phoneNumber: validatedData.phone,
        email: validatedData.email || null,
        address: validatedData.address || null,
        insurancePolicyNumber: validatedData.insuranceNumber || null,
        status: "pending",
        blisterPackType: "weekly",
        linkedUserId: userId,
        adminNotes: `[ENROLLMENT REQUEST - ${referenceNumber}]
New Patient: ${validatedData.isNewPatient ? 'Yes' : 'No'}
Previous Pharmacy: ${validatedData.previousPharmacyName || 'N/A'}
Previous Pharmacy Phone: ${validatedData.previousPharmacyPhone || 'N/A'}
Submitted: ${new Date().toISOString()}`,
        medications: [],
      });
      const responseBody = {
        success: true,
        referenceNumber,
        patientId: newPatient.id,
        message: "Enrollment submitted successfully",
      };
      if (userId) {
        await completeRequest("blister-pack-enrollment", userId, 201, responseBody);
      }
      
      // Broadcast real-time update to admin panels
      broadcastUpdate("blister-patients", { type: "new", data: newPatient });

      syncBlisterPackToApp("create", newPatient, undefined, true);

      res.status(201).json(responseBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating blister pack enrollment:", error);
      res.status(500).json({ message: "Failed to submit enrollment" });
    }
  });

  // Flu Shot Appointment routes
  registerFluShotAppointmentRoutes({
    app, storage, resolveUser, isAuthenticated, isAdmin,
    generateTicketNumber, notify: notifyFluShotAppointment,
  });

  // Admin: Get all flu shot appointments
  app.get("/api/admin/flu-shot-appointments", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const appointments = await storage.getAllFluShotAppointments();
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching flu shot appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // Admin: Update insurance assistance request status
  app.patch("/api/admin/insurance-help/:id/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { status } = z.object({ 
        status: z.enum(["pending", "in_progress", "completed", "cancelled"]) 
      }).parse(req.body);
      
      const updated = await storage.updateInsuranceAssistanceRequestStatus(id, status);
      if (!updated) {
        return res.status(404).json({ message: "Request not found" });
      }
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating insurance request status:", error);
      res.status(500).json({ message: "Failed to update request" });
    }
  });

  // Patient Chatbot - Send message (rule-based, no AI)
  // Authenticated users are automatically verified - no additional verification step needed
  // HIPAA: Audit logging tracks all chat access for compliance
  app.post("/api/chat", isAuthenticated, async (req: any, res) => {
    try {
      // Use authenticated user's ID directly - they're already logged in
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      const { message, chatId } = z.object({
        message: z.string().trim().min(1).max(4000),
        chatId: z.string().uuid().optional(),
      }).parse(req.body);

      // Validate ownership before doing response work, then storage verifies it
      // again inside the exchange transaction before writing anything.
      if (chatId) {
        const chat = await storage.getChatForUser(chatId, userId);
        if (!chat) {
          return res.status(404).json({ message: "Chat not found" });
        }
      }

      // Generate bot response using rule-based logic with authenticated user's ID
      const botResponse = await generateBotResponse(message, userId, storage);

      // Save the complete exchange and its required metadata-only audit record
      // in one transaction. A failed audit rolls back both messages and any new chat.
      const title = `Patient conversation ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
      const exchange = await storage.createChatExchangeForUser({
        userId,
        chatId,
        title,
        userContent: message,
        assistantContent: botResponse,
        auditMetadata: chatAuditMetadata(req, "patient_chat_message", { messageCount: 2 }),
      });
      if (!exchange) {
        return res.status(404).json({ message: "Chat not found" });
      }

      res.json({
        chatId: exchange.chat.id,
        message: exchange.assistantMessage,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      console.error("Error processing chat message");
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Get chat history
  // HIPAA: Audit logging tracks chat access for compliance
  app.get("/api/chat/:chatId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const { chatId } = z.object({ chatId: z.string().uuid() }).parse(req.params);

      const chat = await storage.getChatForUser(chatId, userId);
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const messages = await storage.getChatMessagesForUser(chatId, userId);

      // Audit must be durable before disclosing message content.
      try {
        await storage.createAuditLog({
          userId,
          actionType: "view",
          entityType: "chat",
          entityId: chatId,
          newValue: chatAuditMetadata(req, "patient_chat_history_view", { messageCount: messages.length }),
        });
      } catch (auditError) {
        console.error("Chat audit log failed");
        return res.status(503).json({ message: "Chat audit service unavailable" });
      }

      res.json({ chat, messages });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error fetching chat");
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });

  // Get all user chats
  app.get("/api/chats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const chats = await storage.getChatsByUserId(userId);
      try {
        await storage.createAuditLog({
          userId,
          actionType: "view",
          entityType: "chat",
          newValue: chatAuditMetadata(req, "patient_chat_list_view", { chatCount: chats.length }),
        });
      } catch {
        console.error("Chat audit log failed");
        return res.status(503).json({ message: "Chat audit service unavailable" });
      }
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats");
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Delete an owned chat. Message deletion is performed by the database's
  // foreign-key cascade and the audit record is committed atomically with it.
  app.delete("/api/chat/:chatId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const { chatId } = z.object({ chatId: z.string().uuid() }).parse(req.params);
      const deleted = await storage.deleteChatForUser(chatId, userId, {
        userId,
        actionType: "delete",
        entityType: "chat",
        entityId: chatId,
        newValue: chatAuditMetadata(req, "patient_chat_delete"),
      });
      if (!deleted) {
        return res.status(404).json({ message: "Chat not found" });
      }
      res.status(204).end();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data" });
      }
      console.error("Error deleting chat");
      res.status(500).json({ message: "Failed to delete chat" });
    }
  });

  // Get analytics summary
  app.get("/api/admin/analytics", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const summary = await storage.getAnalyticsSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Admin attention counts for sidebar badges
  app.get("/api/admin/attention-counts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Get counts of items needing attention
      const [
        urgentRefills,
        transferRequests,
        allOrders,
        insuranceRequests,
        allProducts,
        pendingCaregiverLinks,
        pendingLeadsCount,
        unresolvedSpecialtyRows,
      ] = await Promise.all([
        storage.getAllUrgentRefillRequests(),
        storage.getAllTransferRequests(),
        storage.getAllOrders(),
        storage.getAllInsuranceAssistanceRequests(),
        storage.getAllProducts(),
        storage.getPendingCaregiverLinks(),
        storage.getPendingConversionLeadsCount(),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(specialtyFulfillmentRequests)
          .where(or(
            eq(specialtyFulfillmentRequests.status, "pending"),
            eq(specialtyFulfillmentRequests.status, "in_review"),
          )),
      ]);

      // Filter for items needing attention
      const pendingRefills = urgentRefills.filter((r: any) => r.status === "pending" || r.status === "processing");
      const pendingTransfers = transferRequests.filter((r: any) => r.status === "request_received" || r.status === "contacting_pharmacy");
      const pendingOrders = allOrders.filter((o: any) => o.status === "pending");
      const pendingInsurance = insuranceRequests.filter((r: any) => r.status === "pending");
      const lowStockProducts = allProducts.filter((p: any) => p.stockQuantity <= (p.reorderLevel || 10) && (p.showOnWebsite || p.showInApp));

      // Categorize by urgency level
      const urgentRefillsUrgent = pendingRefills.filter((r: any) => r.priority === "urgent").length;
      const urgentRefillsNormal = pendingRefills.filter((r: any) => r.priority === "normal").length;

      res.json({
        urgentRefills: {
          count: pendingRefills.length,
          urgentCount: urgentRefillsUrgent,
          normalCount: urgentRefillsNormal,
          level: urgentRefillsUrgent > 0 ? "high" : urgentRefillsNormal > 3 ? "medium" : urgentRefillsNormal > 0 ? "low" : "none"
        },
        transferRequests: {
          count: pendingTransfers.length,
          level: pendingTransfers.length > 5 ? "high" : pendingTransfers.length > 2 ? "medium" : pendingTransfers.length > 0 ? "low" : "none"
        },
        orders: {
          count: pendingOrders.length,
          level: pendingOrders.length > 10 ? "high" : pendingOrders.length > 5 ? "medium" : pendingOrders.length > 0 ? "low" : "none"
        },
        insuranceHelp: {
          count: pendingInsurance.length,
          level: pendingInsurance.length > 5 ? "high" : pendingInsurance.length > 2 ? "medium" : pendingInsurance.length > 0 ? "low" : "none"
        },
        reorderList: {
          count: lowStockProducts.length,
          level: lowStockProducts.length > 10 ? "high" : lowStockProducts.length > 5 ? "medium" : lowStockProducts.length > 0 ? "low" : "none"
        },
        caregiverRequests: {
          count: pendingCaregiverLinks.length,
          level: pendingCaregiverLinks.length > 3 ? "high" : pendingCaregiverLinks.length > 1 ? "medium" : pendingCaregiverLinks.length > 0 ? "low" : "none"
        },
        conversionLeads: {
          count: pendingLeadsCount,
          level: pendingLeadsCount > 5 ? "high" : pendingLeadsCount > 2 ? "medium" : pendingLeadsCount > 0 ? "low" : "none"
        },
        specialtyRequests: {
          count: unresolvedSpecialtyRows[0]?.count ?? 0,
          level: (unresolvedSpecialtyRows[0]?.count ?? 0) > 5 ? "high" : (unresolvedSpecialtyRows[0]?.count ?? 0) > 2 ? "medium" : (unresolvedSpecialtyRows[0]?.count ?? 0) > 0 ? "low" : "none"
        }
      });
    } catch (error) {
      console.error("Error fetching attention counts:", error);
      res.status(500).json({ message: "Failed to fetch attention counts" });
    }
  });

  // ==========================================
  // CONVERSION LEADS (Wellness Funnel) API
  // ==========================================

  // Public: Capture a conversion lead
  app.post("/api/leads/capture", async (req, res) => {
    try {
      const leadSchema = z.object({
        contactName: z.string().min(1),
        dateOfBirth: z.string().optional(),
        phone: z.string().min(1),
        email: z.string().email().optional(),
        leadType: z.enum(["transfer", "new_script"]),
        previousPharmacyName: z.string().optional(),
        doctorInfo: z.string().optional(),
        medicationCount: z.number().int().min(0).optional(),
        sourceAction: z.string().min(1),
        authorizationConsent: z.boolean(),
      });

      const validated = leadSchema.parse(req.body);
      const qualifiesForWellnessPack = (validated.medicationCount || 0) >= 10;

      const lead = await storage.createConversionLead({
        ...validated,
        medicationCount: validated.medicationCount || 0,
        qualifiesForWellnessPack,
        status: "pending_request",
        pendingPoints: 500,
      });

      // Try to find or create a pending user profile by phone
      let linkedUserId: string | null = null;
      const existingUsers = await storage.getUsersByPhone(validated.phone);
      if (existingUsers.length > 0) {
        linkedUserId = existingUsers[0].id;
        await storage.updateConversionLead(lead.id, { userId: linkedUserId });
      } else {
        // Create a pending user profile (shadow registration)
        try {
          const nameParts = validated.contactName.split(" ");
          const firstName = nameParts[0] || validated.contactName;
          const lastName = nameParts.slice(1).join(" ") || "";
          const newUser = await storage.upsertUser({
            id: `lead_${lead.id}_${Date.now()}`,
            email: validated.email || undefined,
            firstName,
            lastName,
            phoneNumber: validated.phone,
          } as any);
          if (newUser) {
            linkedUserId = newUser.id;
            await storage.updateConversionLead(lead.id, { userId: newUser.id });
            await storage.updateUserProfile(newUser.id, { patientStatus: "pending_request" } as any);
          }
        } catch (profileErr) {
          console.error("Error creating pending profile:", profileErr);
        }
      }

      // For transfer-type wellness leads, also create a prescriptionTransferRequest
      // so the admin Promotion Tracker can track vitamins delivery and release pending
      // points after first fill. Non-fatal: status polling works off the conversion lead.
      if (validated.leadType === "transfer") {
        try {
          const transferPayload: typeof prescriptionTransferRequests.$inferInsert = {
            contactName: validated.contactName,
            phoneNumber: validated.phone,
            email: validated.email ?? null,
            mode: "form_submission" as const,
            previousPharmacyName: validated.previousPharmacyName ?? null,
            userId: linkedUserId ?? null,
            status: "request_received",
            expectedMedCount: validated.medicationCount ?? 0,
            wellnessPackEligible: qualifiesForWellnessPack,
            pendingPoints: 500,
            pendingPointsReleased: false,
            vitaminsIncluded: false,
          };
          await db.insert(prescriptionTransferRequests).values(transferPayload);
        } catch (transferErr) {
          console.error("Error creating companion transfer request for conversion lead:", transferErr);
        }
      }

      // Generate a status token for secure polling
      const statusToken = Buffer.from(`${lead.id}:${validated.phone}`).toString("base64");

      try {
        broadcastUpdate("conversion-leads", {
          type: "new_conversion_lead",
          data: { leadId: lead.id, contactName: validated.contactName, leadType: validated.leadType, qualifiesForWellnessPack }
        });
      } catch (broadcastErr) {
        // Non-fatal: don't fail the API call if broadcast fails
      }

      res.status(201).json({ success: true, leadId: lead.id, statusToken, pendingPoints: 500, qualifiesForWellnessPack });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Error capturing lead:", error);
      res.status(500).json({ message: "Failed to capture lead" });
    }
  });

  app.post("/api/concierge/sourcing-inquiry", isAuthenticated, async (req: any, res) => {
    try {
      const validated = conciergeSourcingInquirySchema.parse(req.body);
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "A fully authenticated local patient is required." });
      }
      const localPatient = req.localUser?.id === patientId
        ? req.localUser
        : await storage.getUser(patientId);
      if (!localPatient || localPatient.role === "admin") {
        return res.status(401).json({ message: "A fully authenticated local patient is required." });
      }

      const existingByKey = await storage.getConversionLeadByIdempotencyKey(validated.idempotencyKey);
      if (existingByKey) {
        return res.status(202).json({
          success: true,
          leadId: existingByKey.id,
          pendingReference: `CONCIERGE-${existingByKey.id}`,
          message: "Pending sourcing inquiry received. Staff must confirm sourcing, prescription requirements, availability, and timing.",
        });
      }

      const safeInquiry = sanitizeConciergeReviewText(validated.inquiryText, 1000);
      const lead = await storage.createConversionLead({
        contactName: [localPatient.firstName, localPatient.lastName].filter(Boolean).join(" ").trim() || "Authenticated patient",
        phone: localPatient.phoneNumber || "not-provided",
        email: localPatient.email ?? undefined,
        leadType: "new_script",
        doctorInfo: `Specialty sourcing inquiry — pending staff review:\n${safeInquiry}`,
        medicationCount: 0,
        sourceAction: "shop_specialty_sourcing",
        authorizationConsent: false,
        qualifiesForWellnessPack: false,
        status: "pending_request",
        pendingPoints: 500,
        userId: patientId,
        idempotencyKey: validated.idempotencyKey,
      });

      try {
        broadcastUpdate("conversion-leads", {
          type: "new_conversion_lead",
          data: { leadId: lead.id, leadType: lead.leadType, source: "shop_specialty_sourcing" },
        });
      } catch {
        // Broadcast is advisory; the durable pending lead is already stored.
      }

      return res.status(202).json({
        success: true,
        leadId: lead.id,
        pendingReference: `CONCIERGE-${lead.id}`,
        message: "Pending sourcing inquiry received. Staff must confirm sourcing, prescription requirements, availability, and timing.",
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505" && typeof req.body?.idempotencyKey === "string") {
        const existing = await storage.getConversionLeadByIdempotencyKey(req.body.idempotencyKey);
        if (existing) {
          return res.status(202).json({
            success: true,
            leadId: existing.id,
            pendingReference: `CONCIERGE-${existing.id}`,
            message: "Pending sourcing inquiry received. Staff must confirm sourcing, prescription requirements, availability, and timing.",
          });
        }
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid sourcing inquiry", errors: error.errors });
      }
      console.error("Error capturing specialty sourcing inquiry:", error);
      return res.status(500).json({ message: "Failed to capture sourcing inquiry" });
    }
  });

  app.post("/api/concierge/lead", async (req, res) => {
    try {
      const contract = validateConciergeLeadSubmission(req.body);
      if (!contract.success) {
        return res.status(400).json({ message: contract.message, errors: contract.errors });
      }
      const validated = contract.data;

      // Idempotency is checked before address verification so a retried final
      // click returns the already accepted pending reference even if the
      // external address provider is temporarily unavailable.
      const existingByKey = await storage.getConversionLeadByIdempotencyKey(validated.idempotencyKey);
      if (existingByKey) {
        return res.status(202).json({
          success: true,
          leadId: existingByKey.id,
          pendingReference: `CONCIERGE-${existingByKey.id}`,
          message: "Pending request received. Stock, prescription processing, service area, and timing require staff confirmation.",
        });
      }

      // Contact fields are never an identity boundary. Only an authenticated
      // Clerk local user or an already-authorized caregiver acting-patient
      // session may associate this request with a patient.
      let authenticatedPatientId: string | null = null;
      const actingPatientId = (req.session as any)?.attendantId && (req.session as any)?.actingPatientId
        ? String((req.session as any).actingPatientId)
        : null;
      try {
        const { userId } = getAuth(req);
        const localUser = userId
          ? ((req as any).localUser ?? await storage.getUserByClerkId(userId))
          : null;
        authenticatedPatientId = deriveAuthenticatedPatientId({
          localPatientId: localUser?.id ?? null,
          attendantId: (req.session as any)?.attendantId ?? null,
          actingPatientId,
        });
      } catch {
        // This is a public route. Missing auth remains a guest request.
        authenticatedPatientId = deriveAuthenticatedPatientId({
          localPatientId: (req as any).localUser?.id ?? null,
          attendantId: (req.session as any)?.attendantId ?? null,
          actingPatientId,
        });
      }

      if (validated.deliveryType === "delivery") {
        const addressResult = await verifyDeliveryAddress(
          validated.deliveryAddress,
          validated.deliveryAddressSelection,
        );
        if (!addressResult.valid) {
          return res.status(400).json({ message: addressResult.message });
        }
      }

      const requesterRole = authenticatedPatientId
        ? (actingPatientId ? "caregiver" : "patient")
        : "guest";
      const lead = await storage.createConversionLead({
        contactName: validated.contactName,
        phone: validated.phone,
        email: validated.email,
        leadType: validated.intent === "transfer" ? "transfer" : "new_script",
        previousPharmacyName: undefined,
        doctorInfo: undefined,
        medicationCount: 0,
        sourceAction: `concierge_chat_${requesterRole}_${validated.intent || "general"}`,
        authorizationConsent: false,
        qualifiesForWellnessPack: false,
        status: "pending_request",
        pendingPoints: 500,
        userId: authenticatedPatientId,
        idempotencyKey: validated.idempotencyKey,
      });

      // Store concierge metadata (role, challenge, address, sentiment) as notes
      try {
        const stockReview: string[] = [];
        for (const requestedItem of validated.requestedItems || []) {
          const product = await storage.getProduct(requestedItem.productId);
          const safeName = sanitizeConciergeReviewText(requestedItem.name);
          stockReview.push(product
            ? `${product.name}: matched catalog item; staff must confirm stock`
            : `${safeName}: not found in current catalog; staff review required`);
        }
        for (const pendingItem of validated.pendingItems || []) {
          const safePendingItem = sanitizeConciergeReviewText(pendingItem);
          stockReview.push(`${safePendingItem}: pending staff review (not matched to current catalog)`);
        }
        const notes = [
          `Requester context: ${requesterRole}${authenticatedPatientId ? ` (server patient ${authenticatedPatientId})` : " (not linked to a patient account)"}`,
          validated.intent ? `Detected Intent: ${validated.intent}` : null,
          validated.intent && /(?:rx|refill|prescription|medication|pharmacist|pharmacy)/i.test(validated.intent)
            ? "Pharmacy callback/intake request only — not an order and not submitted to PharmFlows"
            : null,
          validated.sentiment ? `Sentiment: ${validated.sentiment}` : null,
          `Delivery Type: ${validated.deliveryType.toUpperCase()}`,
          validated.deliveryType === "delivery" ? `Verified Delivery Address Requested: ${validated.deliveryAddress}${validated.apartmentUnit ? `, ${validated.apartmentUnit}` : ""}` : null,
          validated.pickupWindow ? `Pickup Window Requested (NOT CONFIRMED): ${validated.pickupWindow}` : null,
          stockReview.length > 0 ? `Requested Items — staff must confirm stock:\n${stockReview.join("\n")}` : null,
          validated.handoff ? `Structured Handoff (safe metadata only): ${JSON.stringify({
            status: validated.handoff.status,
            activeIntent: validated.handoff.activeIntent,
            fulfillmentMethod: validated.handoff.fulfillmentMethod,
            catalogItemCount: validated.handoff.catalogItemCount,
            pendingItemCount: validated.handoff.pendingItemCount,
            missingSlots: validated.handoff.missingSlots,
          })}` : null,
          validated.intent === "negative_pickup" ? `HIGH CONVERSION OPPORTUNITY - User expressed frustration with store pickups. Pitching Delivery/Blister Packs is recommended.` : null,
          validated.intent === "gibberish" || validated.sentiment === "tech_difficulty" ? `USER HAVING TECHNICAL DIFFICULTY - Don't wait for chat completion; call them directly and help over the phone.` : null,
          validated.callRequested ? `CALL REQUESTED - Priority Lead` : null,
        ].filter(Boolean).join("\n");
        await storage.updateConversionLead(lead.id, { doctorInfo: notes });
      } catch (noteErr) {
        console.error("Error saving concierge notes:", noteErr);
      }

      try {
        broadcastUpdate("conversion-leads", {
          type: "new_conversion_lead",
          data: { leadId: lead.id, contactName: validated.contactName, leadType: lead.leadType, qualifiesForWellnessPack: false, callRequested: !!validated.callRequested, sentiment: validated.sentiment || "neutral" }
        });
      } catch (broadcastErr) {}

      res.status(202).json({
        success: true,
        leadId: lead.id,
        pendingReference: `CONCIERGE-${lead.id}`,
        message: "Pending request received. Stock, prescription processing, service area, and timing require staff confirmation.",
      });
    } catch (error) {
      // A concurrent retry can win the unique idempotency index between the
      // lookup above and insert. Resolve that race to the same reference.
      if ((error as { code?: string })?.code === "23505" && typeof req.body?.idempotencyKey === "string") {
        const existing = await storage.getConversionLeadByIdempotencyKey(req.body.idempotencyKey);
        if (existing) {
          return res.status(202).json({
            success: true,
            leadId: existing.id,
            pendingReference: `CONCIERGE-${existing.id}`,
            message: "Pending request received. Stock, prescription processing, service area, and timing require staff confirmation.",
          });
        }
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Error capturing concierge lead:", error);
      res.status(500).json({ message: "Failed to capture lead" });
    }
  });

  // Public: Check lead status by ID (for live polling, requires token)
  app.get("/api/leads/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid lead ID" });

      const token = req.query.token as string;
      if (!token) return res.status(401).json({ message: "Token required" });

      // Verify token
      try {
        const decoded = Buffer.from(token, "base64").toString("utf-8");
        const [tokenId] = decoded.split(":");
        if (parseInt(tokenId) !== id) return res.status(403).json({ message: "Invalid token" });
      } catch {
        return res.status(403).json({ message: "Invalid token" });
      }

      const lead = await storage.getConversionLead(id);
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      res.json({
        id: lead.id,
        status: lead.status,
        pendingPoints: lead.pendingPoints,
        pointsGranted: lead.pointsGranted,
        qualifiesForWellnessPack: lead.qualifiesForWellnessPack,
        approvedAt: lead.approvedAt,
        rejectionReason: lead.rejectionReason,
      });
    } catch (error) {
      console.error("Error fetching lead status:", error);
      res.status(500).json({ message: "Failed to fetch lead status" });
    }
  });

  // Admin: Get all conversion leads
  app.get("/api/admin/conversion-leads", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const leads = await storage.getAllConversionLeads(status === "all" ? undefined : status);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching conversion leads:", error);
      res.status(500).json({ message: "Failed to fetch conversion leads" });
    }
  });

  // Admin: Get wellness-eligible conversion leads for the Promotion Tracker.
  // Only returns new_script leads — transfer-type leads have companion
  // prescriptionTransferRequests and are tracked through that path instead.
  app.get("/api/admin/conversion-leads/wellness-eligible", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const leads = await storage.getAllConversionLeads();
      const wellnessLeads = leads.filter((l) => l.qualifiesForWellnessPack && l.leadType === "new_script");
      res.json(wellnessLeads);
    } catch (error) {
      console.error("Error fetching wellness-eligible leads:", error);
      res.status(500).json({ message: "Failed to fetch wellness-eligible leads" });
    }
  });

  // Admin: Get priority leads (10+ meds)
  app.get("/api/admin/conversion-leads/priority", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const leads = await storage.getPriorityConversionLeads();
      res.json(leads);
    } catch (error) {
      console.error("Error fetching priority leads:", error);
      res.status(500).json({ message: "Failed to fetch priority leads" });
    }
  });

  // Admin: Update a conversion lead
  app.patch("/api/admin/conversion-leads/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid lead ID" });
      const lead = await storage.updateConversionLead(id, req.body);
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      res.json(lead);
    } catch (error) {
      console.error("Error updating conversion lead:", error);
      res.status(500).json({ message: "Failed to update conversion lead" });
    }
  });

  // Admin: Approve a conversion lead
  app.post("/api/admin/conversion-leads/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid lead ID" });

      const lead = await storage.getConversionLead(id);
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      if (lead.status !== "pending_request") {
        return res.status(400).json({ message: "Lead is not in pending_request status" });
      }

      const approved = await storage.approveConversionLead(id, "admin");

      // Update linked user status to active if exists
      if (lead.userId) {
        await storage.updateUserProfile(lead.userId, { patientStatus: "active" } as any);
        // For transfer-type leads, points are withheld until first fill is confirmed via
        // the companion prescriptionTransferRequest release-points admin action.
        // For new_script leads (no prescription transfer), grant points immediately on approval.
        if (lead.leadType !== "transfer") {
          try {
            const wallet = await storage.getOrCreatePointsWallet(lead.userId);
            if (wallet && !lead.pointsGranted) {
              await storage.addPointsLedgerEntry({
                walletId: wallet.id,
                userId: lead.userId,
                actionType: "prescription_transfer",
                points: lead.pendingPoints,
                type: "earn",
                source: "conversion_bonus",
                description: "Wellness Conversion Bonus - Welcome to ConcordiaCare!",
              } as any);
              await storage.updateConversionLead(id, { pointsGranted: true });
            }
          } catch (walletErr) {
            console.error("Error granting points:", walletErr);
          }
        }
      }

      try {
        broadcastUpdate("conversion-leads", {
          type: "conversion_lead_approved",
          data: { leadId: id, contactName: lead.contactName }
        });
      } catch (broadcastErr) {
        // Non-fatal
      }

      res.json(approved);
    } catch (error) {
      console.error("Error approving conversion lead:", error);
      res.status(500).json({ message: "Failed to approve conversion lead" });
    }
  });

  // Admin: Reject a conversion lead
  app.post("/api/admin/conversion-leads/:id/reject", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid lead ID" });
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);

      const lead = await storage.getConversionLead(id);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      const rejected = await storage.rejectConversionLead(id, reason);
      res.json(rejected);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Reason is required" });
      }
      console.error("Error rejecting conversion lead:", error);
      res.status(500).json({ message: "Failed to reject conversion lead" });
    }
  });

  const notifyFilledConciergeRequest = async (id: number) => {
    let lead = await storage.getConversionLead(id);
    if (!lead) return { status: 404, body: { message: "Request not found" } };
    if (lead.status === "pending_request") {
      const approved = await storage.approveConversionLead(id, "staff_fulfillment");
      if (!approved) return { status: 500, body: { message: "Failed to approve the filled request" } };
      lead = approved;
      if (lead.userId) {
        await storage.updateUserProfile(lead.userId, { patientStatus: "active" } as any);
      }
    } else if (lead.status !== "approved") {
      return { status: 400, body: { message: "Only a pending or approved request can be marked filled" } };
    }

    const notificationMarker = "[PATIENT_READY_NOTIFICATION_SENT]";
    if (lead.adminNotes?.includes(notificationMarker)) {
      return { status: 200, body: { success: true, alreadyNotified: true } };
    }

    const plainMessage = `Your Concordia Pharmacy request #${id} is ready. Please call (718) 328-2833 if you have questions. Do not reply with prescription or medical details.`;
    let notificationChannel: "email" | "sms" | null = null;

    if (lead.email) {
      const emailResult = await sendEmail({
        to: lead.email,
        subject: `Concordia Pharmacy request #${id} is ready`,
        text: plainMessage,
        html: `<p>${escapeHtml(plainMessage)}</p>`,
        suppressFailureLogging: true,
      });
      if (emailResult.ok) notificationChannel = "email";
    }

    if (!notificationChannel && lead.phone) {
      const smsResult = await sendSms({ to: lead.phone, body: plainMessage });
      if (smsResult.ok) notificationChannel = "sms";
    }

    if (!notificationChannel) {
      return {
        status: 503,
        body: {
          message: "The request is filled, but no configured notification channel successfully delivered the update",
          notificationSent: false,
        },
      };
    }

    const timestamp = new Date().toISOString();
    const adminNotes = [lead.adminNotes, `${notificationMarker} ${timestamp} via ${notificationChannel}`]
      .filter(Boolean)
      .join("\n");
    const updated = await storage.updateConversionLead(id, { adminNotes });
    broadcastUpdate("conversion-leads", {
      type: "conversion_lead_filled",
      data: { leadId: id, notificationChannel },
    });
    return {
      status: 200,
      body: { success: true, notificationSent: true, notificationChannel, request: updated },
    };
  };

  // Admin: mark an approved concierge request filled and notify the patient.
  app.post("/api/admin/conversion-leads/:id/filled", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid request ID" });
      const result = await notifyFilledConciergeRequest(id);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error("Error completing concierge request:", error);
      res.status(500).json({ message: "Failed to complete request" });
    }
  });

  const requireStaffApiKey = (req: Request, res: Response, next: NextFunction) => {
    const expected = process.env.STAFF_API_KEY;
    if (!expected) return res.status(503).json({ message: "Staff API key not configured" });
    const provided = req.headers["x-api-key"];
    if (typeof provided !== "string" || provided !== expected) {
      return res.status(401).json({ message: "Invalid or missing staff API key" });
    }
    next();
  };

  // Staff app: authenticated request queue and completion callback.
  app.get("/api/external/concierge-requests", requireStaffApiKey, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "pending_request";
      const requests = await storage.getAllConversionLeads(status === "all" ? undefined : status);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching external concierge requests:", error);
      res.status(500).json({ message: "Failed to fetch requests" });
    }
  });

  app.post("/api/external/concierge-requests/:id/filled", requireStaffApiKey, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid request ID" });
      const result = await notifyFilledConciergeRequest(id);
      res.status(result.status).json(result.body);
    } catch (error) {
      console.error("Error completing external concierge request:", error);
      res.status(500).json({ message: "Failed to complete request" });
    }
  });

  // External: Check patient status by phone (for ConcordiaCare app)
  app.get("/api/external/patient-status/:phone", requireApiKey, async (req, res) => {
    try {
      const phone = req.params.phone;
      const users2 = await storage.getUsersByPhone(phone);
      if (users2.length === 0) {
        return res.json({ exists: false, status: null });
      }
      const user = users2[0];
      res.json({
        exists: true,
        status: (user as any).patientStatus || "active",
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
      });
    } catch (error) {
      console.error("Error checking patient status:", error);
      res.status(500).json({ message: "Failed to check patient status" });
    }
  });

  // Blog API routes
  // Create a new blog post (admin only - saves as draft)
  app.post("/api/admin/blog", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const blogSchema = z.object({
        title: z.string().min(1, "Title is required"),
        content: z.string().min(1, "Content is required"),
        authorName: z.string().min(1, "Author name is required"),
        authorDesignation: z.string().min(1, "Author designation is required"),
        category: z.string().default("general"),
      });

      const validated = blogSchema.parse(req.body);
      const post = await storage.createBlogPost(validated);
      res.status(201).json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating blog post:", error);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });

  // Publish a blog post (admin only)
  app.post("/api/admin/blog/:id/publish", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const post = await storage.publishBlogPost(id);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
      const slug = (post as any).slug ?? String(post.id);
      void pingIndexNow([`https://concordianyc.com/blog/${slug}`, "https://concordianyc.com/sitemap.xml"]);
    } catch (error) {
      console.error("Error publishing blog post:", error);
      res.status(500).json({ message: "Failed to publish blog post" });
    }
  });

  // Get all published blog posts (public, legacy endpoint)
  app.get("/api/blogs", async (req, res) => {
    try {
      await storage.deleteExpiredBlogPosts();
      const posts = await storage.getAllPublishedBlogPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  // Get published blog posts with pagination (public)
  app.get("/api/blog/posts", async (req, res) => {
    try {
      await storage.deleteExpiredBlogPosts();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 6));
      const result = await storage.getPublishedBlogPostsPaginated(page, limit);
      res.json({
        posts: result.posts,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      });
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  // Get a single published blog post by slug (public)
  // Falls back to ID-based lookup for backward compatibility with legacy posts
  app.get("/api/blog/posts/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      if (!slug || slug.length > 200) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      let post = await storage.getBlogPostBySlug(slug);
      if (!post) {
        const numericId = parseInt(slug, 10);
        if (!isNaN(numericId) && numericId > 0) {
          post = (await storage.getBlogPost(numericId)) ?? undefined;
        }
      }
      if (!post || !post.isPublished) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      if (post.expiresAt && new Date(post.expiresAt) < new Date()) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  // Like a blog post (authenticated users)
  app.post("/api/blogs/:id/like", async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const post = await storage.likeBlogPost(id);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      console.error("Error liking blog post:", error);
      res.status(500).json({ message: "Failed to like blog post" });
    }
  });

  // Unpublish a blog post (admin only)
  app.post("/api/admin/blog/:id/unpublish", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const post = await storage.unpublishBlogPost(id);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      console.error("Error unpublishing blog post:", error);
      res.status(500).json({ message: "Failed to unpublish blog post" });
    }
  });

  // Get all blog posts for admin (drafts + published)
  app.get("/api/admin/blog", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const posts = await storage.getAllBlogPosts();
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  registerSeasonalThemeRoutes(app, isAuthenticated, isAdmin);
  registerStaffInventoryRoutes(app, (orderId, status) => broadcastUpdate("orders", { type: "order_updated", orderId, status }));

  // Edit a blog post (admin only) — preserves published state
  app.patch("/api/admin/blog/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        category: z.string().optional(),
        imageUrl: z.string().url().nullable().optional(),
        pinnedToHero: z.boolean().optional(),
      });
      const updates = updateSchema.parse(req.body);

      // Enforce 2-pin limit: if trying to pin, check how many are already pinned
      if (updates.pinnedToHero === true) {
        const current = await storage.getBlogPost(id);
        if (!current?.pinnedToHero) {
          const pinnedCount = await storage.getPinnedBlogPostCount();
          if (pinnedCount >= 2) {
            return res.status(409).json({ message: "Only 2 posts can be pinned to the hero at a time. Unpin another post first." });
          }
        }
      }

      const post = await storage.updateBlogPost(id, updates);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
      if ((post as any).isPublished) {
        const slug = (post as any).slug ?? String(post.id);
        void pingIndexNow([`https://concordianyc.com/blog/${slug}`, "https://concordianyc.com/sitemap.xml"]);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating blog post:", error);
      res.status(500).json({ message: "Failed to update blog post" });
    }
  });

  // Delete a blog post (admin only)
  app.delete("/api/admin/blog/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const post = await storage.getBlogPost(id);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      await db.delete(blogPosts).where(eq(blogPosts.id, id));
      res.json({ message: "Blog post deleted" });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ message: "Failed to delete blog post" });
    }
  });

  // Public combined feed: pinned posts always included + latest posts + external RSS/Reddit
  app.get("/api/blog/feed", async (_req, res) => {
    try {
      const { fetchAllFeeds } = await import("./rss-fetcher");
      await storage.deleteExpiredBlogPosts();
      const [internalResult, pinnedPosts, external] = await Promise.all([
        storage.getPublishedBlogPostsPaginated(1, 6),
        storage.getPinnedPublishedBlogPosts(),
        fetchAllFeeds(),
      ]);
      // Merge: pinned posts first, then fill up to 6 with newest non-pinned posts
      const pinnedIds = new Set(pinnedPosts.map((p) => p.id));
      const nonPinned = internalResult.posts.filter((p) => !pinnedIds.has(p.id));
      const FEED_SIZE = 6;
      const internal = [...pinnedPosts, ...nonPinned].slice(0, Math.max(FEED_SIZE, pinnedPosts.length));
      res.json({ internal, external });
    } catch (error) {
      console.error("[RSS] Error building feed:", error);
      res.status(500).json({ message: "Failed to fetch blog feed" });
    }
  });

  // Admin: force-clear the RSS cache
  app.post("/api/admin/blog/refresh-feed", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { clearFeedCache } = await import("./rss-fetcher");
      clearFeedCache();
      res.json({ message: "Feed cache cleared" });
    } catch (error) {
      console.error("[RSS] Error clearing cache:", error);
      res.status(500).json({ message: "Failed to clear feed cache" });
    }
  });

  // ── External blog endpoints for ConcordiaCare mobile app ──────────────────
  // GET /api/external/blog/posts — paginated published feed (API key required)
  app.get("/api/external/blog/posts", requireApiKey, async (req, res) => {
    try {
      await storage.deleteExpiredBlogPosts();
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const result = await storage.getPublishedBlogPostsPaginated(page, limit);
      const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      const posts = result.posts.map((p) => ({
        id: p.id,
        title: p.title,
        excerpt: stripHtml(p.content).slice(0, 200),
        imageUrl: p.imageUrl ?? null,
        category: p.category,
        likesCount: p.likes,
        publishedAt: p.publishedAt,
      }));
      res.json({ posts, total: result.total, page, limit, totalPages: Math.ceil(result.total / limit) });
    } catch (error) {
      console.error("Error fetching external blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  // GET /api/external/blog/posts/:id — full single post (API key required)
  app.get("/api/external/blog/posts/:id", requireApiKey, async (req, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const post = await storage.getBlogPost(id);
      if (!post || !post.isPublished) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      if (post.expiresAt && new Date(post.expiresAt) < new Date()) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json({
        id: post.id,
        title: post.title,
        content: post.content,
        imageUrl: post.imageUrl ?? null,
        category: post.category,
        likesCount: post.likes,
        publishedAt: post.publishedAt,
      });
    } catch (error) {
      console.error("Error fetching external blog post:", error);
      res.status(500).json({ message: "Failed to fetch blog post" });
    }
  });

  // Pharmacy Alerts API routes
  // Create a new pharmacy alert (admin only)
  app.post("/api/admin/alerts", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const alertSchema = z.object({
        title: z.string().min(1).default("Pharmacy Alert"),
        message: z.string().min(1, "Message is required"),
        type: z.enum(["info", "warning", "urgent", "closure"]).default("info"),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        expiresAt: z.string().optional().transform((val) => val ? new Date(val) : undefined),
      });

      const validated = alertSchema.parse(req.body);
      const alert = await storage.createPharmacyAlert(validated);
      res.status(201).json(alert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating pharmacy alert:", error);
      res.status(500).json({ message: "Failed to create pharmacy alert" });
    }
  });

  // Get all active pharmacy alerts (public)
  // Public: returns the stable published site URL (from REPLIT_DOMAINS) so clients
  // can build links / QR codes that always point at production, not a dev server.
  // Helper: build the admin PWA manifest object.
  // start_url uses the stable production domain when available so the installed
  // icon always opens the real site, not a dev-preview URL.
  function buildAdminManifest() {
    const domains = (process.env.REPLIT_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
    const prodDomain = domains.find((d) => d.endsWith(".replit.app")) || domains[0] || null;
    const startUrl = prodDomain ? `https://${prodDomain}/admin` : "/admin";
    return {
      name: "Concordia Admin",
      short_name: "Admin",
      description: "Concordia Pharmacy admin dashboard — manage orders, patients, and operations.",
      start_url: startUrl,
      scope: "/admin",
      display: "standalone",
      background_color: "#0f172a",
      theme_color: "#0f172a",
      icons: [
        { src: "/concordia-icon.png", sizes: "513x509", type: "image/png", purpose: "any maskable" },
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    };
  }

  // Explicit /admin-manifest.json endpoint (used by the <link rel="manifest"> tag
  // on admin pages as a fallback / direct reference).
  app.get("/admin-manifest.json", (_req, res) => {
    res.json(buildAdminManifest());
  });

  // Intercept the main /manifest.json request.
  // When the browser fetches the manifest while the user is on an admin page,
  // the Referer header contains "/admin". In that case we return the admin
  // manifest so "Add to Home Screen" creates an icon that opens /admin directly.
  // For all other pages the static client/public/manifest.json is returned as-is.
  //
  // WHY server-side: the browser fetches the manifest immediately on HTML parse,
  // before any JavaScript runs — so a client-side <link href> swap is always
  // too late. This route is registered before Vite's static middleware and
  // therefore takes precedence over the file on disk.
  app.get("/manifest.json", (req, res, next) => {
    const referer = (req.headers.referer || req.headers.referrer || "") as string;
    if (referer.includes("/admin")) {
      return res.json(buildAdminManifest());
    }
    // Not an admin referer — fall through to Vite/static file serving.
    next();
  });

  app.get("/api/site-url", (_req, res) => {
    const domains = (process.env.REPLIT_DOMAINS || "").split(",").map((d) => d.trim()).filter(Boolean);
    const prodDomain = domains.find((d) => d.endsWith(".replit.app")) || domains[0] || null;
    const siteUrl = prodDomain ? `https://${prodDomain}` : null;
    res.json({ siteUrl });
  });

  app.get("/api/alerts", async (req, res) => {
    try {
      const alerts = await storage.getActivePharmacyAlerts();
      // Only surface customer-facing announcements (closures, hours, info).
      // High-priority operational alerts ("New Web Order", etc.) are for the
      // staff app via /api/external/alerts and must not appear on the public site.
      const customerAlerts = alerts.filter((a: any) => a.priority !== "high");
      res.json(customerAlerts);
    } catch (error) {
      console.error("Error fetching pharmacy alerts:", error);
      res.status(500).json({ message: "Failed to fetch pharmacy alerts" });
    }
  });

  // Contact form submission (public)
  const contactFormValidator = z.object({
    name: z.string().min(2).max(200),
    email: z.string().email().max(320),
    phone: z.string().max(20).optional().or(z.literal("")),
    message: z.string().min(10).max(5000),
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const parsed = contactFormValidator.parse(req.body);
      const submission = await storage.createContactSubmission(parsed);
      broadcastUpdate("contact-submissions", { type: "new", data: submission });
      res.status(201).json({ success: true, id: submission.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid form data", errors: error.errors });
      }
      console.error("Error creating contact submission:", error);
      res.status(500).json({ message: "Failed to submit contact form" });
    }
  });

  // Admin: Review public contact form submissions.
  app.get("/api/admin/contact-submissions", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllContactSubmissions());
    } catch (error) {
      console.error("Error fetching contact submissions:", error);
      res.status(500).json({ message: "Failed to fetch contact submissions" });
    }
  });

  app.patch("/api/admin/contact-submissions/:id/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const { status } = z.object({ status: z.enum(["new", "resolved"]) }).parse(req.body);
      const submission = await storage.updateContactSubmissionStatus(id, status);
      if (!submission) return res.status(404).json({ message: "Contact submission not found" });
      broadcastUpdate("contact-submissions", { type: "status_updated", data: submission });
      res.json(submission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid contact submission update", errors: error.errors });
      }
      console.error("Error updating contact submission:", error);
      res.status(500).json({ message: "Failed to update contact submission" });
    }
  });

  // Page view tracking (public, anonymous, no cookies)
  app.post("/api/page-views", async (req, res) => {
    try {
      const { path, referrer } = req.body;
      if (!path || typeof path !== "string" || path.length > 500) {
        return res.status(400).json({ message: "Invalid path" });
      }
      const cleanReferrer = typeof referrer === "string" ? referrer.slice(0, 1000) : undefined;
      const userAgent = typeof req.get("user-agent") === "string" ? req.get("user-agent")!.slice(0, 500) : undefined;
      await storage.recordPageView(path, cleanReferrer, userAgent);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to record page view" });
    }
  });

  // Admin page view analytics
  app.get("/api/admin/page-views", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const stats = await storage.getPageViewStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching page view stats:", error);
      res.status(500).json({ message: "Failed to fetch page view stats" });
    }
  });

  // Chat widget analytics — public write, admin-only read
  app.post("/api/chat/event", async (req, res) => {
    try {
      const { eventType, intent, pagePath } = z.object({
        eventType: z.string().min(1).max(64),
        intent: z.string().max(128).optional(),
        pagePath: z.string().max(512).optional(),
      }).parse(req.body);
      await storage.recordChatEvent(eventType, intent, pagePath);
      res.status(204).end();
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input" });
      console.error("Error recording chat event:", error);
      res.status(500).json({ message: "Failed to record event" });
    }
  });

  app.get("/api/admin/chat-events", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const stats = await storage.getChatEventStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching chat event stats:", error);
      res.status(500).json({ message: "Failed to fetch chat event stats" });
    }
  });

  // ── Restock Notifications ──────────────────────────────────────────────────
  // Public: patient/visitor signs up for back-in-stock alert
  app.post("/api/restock-notify", async (req, res) => {
    try {
      const body = z.object({
        category: z.string().max(128).optional(),
        productId: z.string().max(128).optional(),
        name: z.string().max(200).optional(),
        email: z.string().email().max(320).optional(),
        phone: z.string().max(20).optional(),
      }).refine(d => !!(d.email || d.phone), { message: "email or phone is required" })
        .refine(d => !!(d.category || d.productId), { message: "category or productId is required" })
        .parse(req.body);

      const notification = await storage.createRestockNotification({
        category: body.category ?? null,
        productId: body.productId ?? null,
        name: body.name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        status: "pending",
      });

      res.status(201).json({ id: notification.id, message: "You're on the list — we'll reach out as soon as it's back!" });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      console.error("[RestockNotify] error:", error);
      res.status(500).json({ message: "Failed to save notification request" });
    }
  });

  // Admin: list restock notifications
  app.get("/api/admin/restock-notifications", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const notifications = await storage.getRestockNotifications(status);
      res.json(notifications);
    } catch (error) {
      console.error("[RestockNotify] list error:", error);
      res.status(500).json({ message: "Failed to fetch restock notifications" });
    }
  });

  // Admin: clear all sent notifications (POST avoids route conflict with :id)
  app.post("/api/admin/restock-notifications/clear-sent", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const count = await storage.clearSentRestockNotifications();
      res.json({ cleared: count });
    } catch (error) {
      console.error("[RestockNotify] clear-sent error:", error);
      res.status(500).json({ message: "Failed to clear notifications" });
    }
  });

  // Admin: delete a single notification
  app.delete("/api/admin/restock-notifications/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteRestockNotification(id);
      res.json({ message: "Deleted" });
    } catch (error) {
      console.error("[RestockNotify] delete error:", error);
      res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // External alerts endpoint for ConcordiaCare app
  app.get("/api/external/alerts", requireApiKey, async (_req, res) => {
    try {
      const alerts = await storage.getActivePharmacyAlerts();
      res.json(alerts.map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        type: a.type,
        priority: a.priority,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
      })));
    } catch (error: unknown) {
      console.error("Error fetching external alerts:", error instanceof Error ? error.message : error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  // Deactivate a pharmacy alert (admin only)
  app.post("/api/admin/alerts/:id/deactivate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const alert = await storage.deactivatePharmacyAlert(id);
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      res.json(alert);
    } catch (error) {
      console.error("Error deactivating alert:", error);
      res.status(500).json({ message: "Failed to deactivate alert" });
    }
  });

  // File Upload API Routes
  // Get signed upload URL for authenticated users
  app.get("/api/upload/url", isAuthenticated, async (req: any, res) => {
    try {
      const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadUrl });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Serve private object files (with access control)
  app.get("/objects/*path", async (req: any, res) => {
    try {
      const objectPath = req.path;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      
      // Check for user ID from multiple auth sources
      const userId = req.user?.claims?.sub || req.session?.patientId || req.session?.phonePatientId;
      // Check if admin from Replit Auth OR from admin session login
      const isAdminUser = req.user?.claims?.metadata?.isAdmin === true || req.session?.isAdmin === true;
      
      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
        isAdmin: isAdminUser,
      });

      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      await objectStorageService.downloadObject(objectFile, res, 3600, true);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ message: "Object not found" });
      }
      console.error("Error serving object:", error);
      res.status(500).json({ message: "Failed to serve object" });
    }
  });

  // Patient Documents API Routes
  // Create a patient document record after upload (multipart form with file)
  app.post("/api/patient/documents", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      // Validate document type from form data
      const documentType = req.body.documentType;
      const validTypes = ["drivers_license", "state_id", "insurance_card", "insurance_card_back", "miscellaneous"];
      if (!documentType || !validTypes.includes(documentType)) {
        return res.status(400).json({ message: "Invalid document type" });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Allowlist: only safe, non-executable document formats
      const ALLOWED_MIME_TYPES = new Set([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
      ]);
      const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf"]);

      if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(400).json({ message: "File type not allowed. Only images (JPEG, PNG, GIF, WebP) and PDF files are accepted." });
      }
      const fileExt = (req.file.originalname.split(".").pop() || "").toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(fileExt)) {
        return res.status(400).json({ message: "File extension not allowed. Only images (JPEG, PNG, GIF, WebP) and PDF files are accepted." });
      }

      // Upload file to object storage
      const fileUrl = await objectStorageService.uploadFileToStorage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { visibility: "private", owner: patientId }
      );

      const document = await storage.createPatientDocument({
        userId: patientId,
        documentType: documentType,
        fileUrl: fileUrl,
        documentName: req.file.originalname,
        notes: req.body.notes || null,
      });

      // Audit log for document upload
      await logAudit({
        req,
        actionType: "create",
        entityType: "patient_document",
        entityId: document.id.toString(),
        newValue: {
          documentType: documentType,
          documentName: req.file.originalname,
          patientId,
        },
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating patient document:", error);
      res.status(500).json({ message: "Failed to create patient document" });
    }
  });

  // Get patient's documents
  app.get("/api/patient/documents", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      const documents = await storage.getPatientDocuments(patientId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching patient documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Delete patient document
  app.delete("/api/patient/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      
      const document = await storage.getPatientDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (document.userId !== patientId) {
        return res.status(403).json({ message: "Not authorized to delete this document" });
      }

      await storage.deletePatientDocument(id);

      // Audit log for document deletion
      await logAudit({
        req,
        actionType: "delete",
        entityType: "patient_document",
        entityId: id.toString(),
        oldValue: {
          documentType: document.documentType,
          documentName: document.documentName,
          patientId,
        },
      });

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting patient document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Get patient's scheduled events (flu shots, pickups, blister packs)
  app.get("/api/patient/scheduled-events", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }

      // Get user's phone number for matching across different tables
      const user = await storage.getUser(patientId);
      const phoneNumber = user?.phoneNumber || req.session?.phoneNumber;

      const events = await storage.getPatientScheduledEvents(patientId, phoneNumber);
      
      // Log access for HIPAA compliance
      await logAudit({
        req,
        actionType: "view",
        entityType: "scheduled_events",
        entityId: patientId,
        newValue: { eventCount: events.length },
      });

      res.json(events);
    } catch (error) {
      console.error("Error fetching scheduled events:", error);
      res.status(500).json({ message: "Failed to fetch scheduled events" });
    }
  });

  // Admin: Get OTC card for a specific user
  app.get("/api/admin/users/:userId/otc-card", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.params);
      const card = await storage.getOtcCard(userId);

      // Audit log for admin viewing patient OTC card (HIPAA compliance)
      await logAudit({
        req,
        actionType: "view",
        entityType: "otc_card",
        entityId: userId,
        newValue: {
          adminId: req.user?.claims?.sub,
          adminEmail: req.user?.claims?.email,
          purpose: "customer_otc_card_view",
          hasCard: !!card,
        },
      });

      res.json(card || null);
    } catch (error) {
      console.error("Error fetching user OTC card:", error);
      res.status(500).json({ message: "Failed to fetch user OTC card" });
    }
  });

  // Admin: Get documents for a specific user
  app.get("/api/admin/users/:userId/documents", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = z.object({ userId: z.string().min(1) }).parse(req.params);
      const documents = await storage.getPatientDocuments(userId);

      // Audit log for admin viewing patient documents (HIPAA compliance)
      await logAudit({
        req,
        actionType: "view",
        entityType: "patient_document",
        entityId: userId,
        newValue: {
          adminId: req.user?.claims?.sub,
          adminEmail: req.user?.claims?.email,
          purpose: "customer_documents_view",
          documentCount: documents.length,
        },
      });

      res.json(documents);
    } catch (error) {
      console.error("Error fetching user documents:", error);
      res.status(500).json({ message: "Failed to fetch user documents" });
    }
  });

  // Admin delete patient document
  app.delete("/api/admin/users/:userId/documents/:documentId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId, documentId } = z.object({ 
        userId: z.string().min(1),
        documentId: z.coerce.number()
      }).parse(req.params);
      
      const document = await storage.getPatientDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (document.userId !== userId) {
        return res.status(400).json({ message: "Document does not belong to this user" });
      }

      await storage.deletePatientDocument(documentId);

      // Audit log for admin deleting patient document (HIPAA compliance)
      await logAudit({
        req,
        actionType: "delete",
        entityType: "patient_document",
        entityId: documentId.toString(),
        oldValue: {
          documentType: document.documentType,
          documentName: document.documentName,
          patientId: userId,
        },
        newValue: {
          adminId: req.user?.claims?.sub,
          adminEmail: req.user?.claims?.email,
          purpose: "admin_document_deletion",
        },
      });

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Error deleting user document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Admin delete customer profile
  app.delete("/api/admin/users/:userId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = z.object({ 
        userId: z.string().min(1)
      }).parse(req.params);
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Delete the user and all related data
      await storage.deleteUser(userId);

      // Audit log for admin deleting customer profile (HIPAA compliance)
      await logAudit({
        req,
        actionType: "delete",
        entityType: "user",
        entityId: userId,
        oldValue: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
        },
        newValue: {
          adminId: req.user?.claims?.sub || req.session?.adminId,
          adminEmail: req.user?.claims?.email || req.session?.adminUsername,
          purpose: "admin_customer_deletion",
          deletedAt: new Date().toISOString(),
        },
      });

      res.json({ message: "Customer profile deleted successfully" });
    } catch (error) {
      console.error("Error deleting customer profile:", error);
      res.status(500).json({ message: "Failed to delete customer profile" });
    }
  });

  app.delete("/api/admin/patients/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      const { reason } = z.object({
        reason: z.string().min(5, "Reason must be at least 5 characters"),
      }).parse(req.body);

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "Patient not found" });
      }

      if (user.role !== "patient") {
        return res.status(403).json({ message: "Only patient profiles can be dissolved" });
      }

      const blisterPatient = await storage.getBlisterPackPatientByUserId(id);
      if (blisterPatient) {
        await deleteBlisterPackFromApp(blisterPatient);
        await storage.deleteBlisterPackPatient(blisterPatient.id);
      }

      if (user.concordiaCareUserId) {
        await storage.updateUserProfile(id, { concordiaCareUserId: null });
      }

      await storage.deleteUser(id);

      await logAudit({
        req,
        actionType: "delete",
        entityType: "user",
        entityId: id,
        oldValue: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          primeRxPatientId: user.primeRxPatientId,
          concordiaCareUserId: user.concordiaCareUserId,
          hadBlisterPack: !!blisterPatient,
        },
        newValue: {
          adminId: req.session?.adminId || req.user?.claims?.sub || "admin",
          adminEmail: req.session?.adminUsername || req.user?.claims?.email,
          purpose: "patient_profile_dissolved",
          reason,
          deletedAt: new Date().toISOString(),
        },
      });

      res.json({ message: "Patient profile dissolved successfully" });
    } catch (error: any) {
      if (error?.issues) {
        return res.status(400).json({ message: error.issues[0]?.message || "Validation error" });
      }
      console.error("Error dissolving patient profile:", error);
      res.status(500).json({ message: "Failed to dissolve patient profile" });
    }
  });

  // Blog image upload endpoint (admin only)
  app.patch("/api/admin/blog/:id/image", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.coerce.number() }).parse(req.params);
      const { imageUrl } = z.object({ imageUrl: z.string().min(1) }).parse(req.body);

      const adminId = req.user?.claims?.sub || "system";
      
      // Normalize the URL and make it public (blog images are always public)
      const normalizedUrl = await objectStorageService.trySetObjectEntityAclPolicy(
        imageUrl,
        { visibility: "public", owner: adminId }
      );

      const post = await storage.updateBlogPostImage(id, normalizedUrl);
      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }
      res.json(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating blog image:", error);
      res.status(500).json({ message: "Failed to update blog image" });
    }
  });

  // Get all users (admin only)
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Return entry-point source labels for all users (single aggregated query)
  app.get("/api/admin/users/sources", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const rows = await db.execute(sql`
        WITH leads AS (
          SELECT LOWER(email) AS email,
                 REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g') AS phone,
                 'Flu Shot' AS source
          FROM flu_shot_appointments
          WHERE email IS NOT NULL OR phone_number IS NOT NULL
          UNION ALL
          SELECT LOWER(email),
                 REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g'),
                 'Transfer'
          FROM prescription_transfer_requests
          WHERE email IS NOT NULL OR phone_number IS NOT NULL
          UNION ALL
          SELECT LOWER(email),
                 REGEXP_REPLACE(phone, '[^0-9]', '', 'g'),
                 'Wellness'
          FROM conversion_leads
          WHERE email IS NOT NULL OR phone IS NOT NULL
          UNION ALL
          SELECT LOWER(email),
                 REGEXP_REPLACE(phone, '[^0-9]', '', 'g'),
                 'Specialty Rx'
          FROM specialty_fulfillment_requests
          WHERE email IS NOT NULL OR phone IS NOT NULL
          UNION ALL
          SELECT LOWER(email),
                 REGEXP_REPLACE(phone, '[^0-9]', '', 'g'),
                 'RX Savings'
          FROM savings_requests
          WHERE email IS NOT NULL OR phone IS NOT NULL
          UNION ALL
          SELECT LOWER(patient_email),
                 REGEXP_REPLACE(patient_phone, '[^0-9]', '', 'g'),
                 'Find Doctor'
          FROM doctor_match_leads
          WHERE patient_email IS NOT NULL OR patient_phone IS NOT NULL
          UNION ALL
          SELECT LOWER(email),
                 REGEXP_REPLACE(phone, '[^0-9]', '', 'g'),
                 'Insurance Help'
          FROM insurance_assistance_requests
          WHERE email IS NOT NULL OR phone IS NOT NULL
        )
        SELECT u.id AS user_id,
               string_agg(DISTINCT l.source, ',' ORDER BY l.source) AS sources
        FROM users u
        JOIN leads l ON (
          (l.email IS NOT NULL AND l.email <> '' AND LOWER(u.email) = l.email)
          OR
          (l.phone IS NOT NULL AND l.phone <> '' AND REGEXP_REPLACE(u.phone_number, '[^0-9]', '', 'g') = l.phone)
        )
        GROUP BY u.id
      `);
      const map: Record<string, string[]> = {};
      for (const row of (rows as any).rows ?? rows) {
        map[row.user_id] = (row.sources as string).split(",");
      }
      res.json(map);
    } catch (error) {
      console.error("Error fetching user sources:", error);
      res.status(500).json({ message: "Failed to fetch user sources" });
    }
  });

  // Update customer information (admin only)
  app.patch("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Validate user ID (string, not UUID - Replit Auth uses sub claim)
      const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
      
      const updateSchema = z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phoneNumber: z.string().optional(),
        address: z.string().optional(),
        allergies: z.string().optional(),
        medicalConditions: z.string().optional(),
        insuranceProvider: z.string().optional(),
        insurancePolicyNumber: z.string().optional(),
        insuranceGroupNumber: z.string().optional(),
      });

      const updates = updateSchema.parse(req.body);
      
      // Check if user exists and get current state for audit
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const updatedUser = await storage.updateUserProfile(id, updates);

      // Audit log: Admin modified patient PHI (HIPAA compliance)
      await logAudit({
        req,
        actionType: "update",
        entityType: "user",
        entityId: id,
        oldValue: {
          ...existingUser,
          adminContext: {
            adminId: (req as any).user?.claims?.sub,
            adminEmail: (req as any).user?.claims?.email,
            purpose: "customer_profile_edit",
          }
        },
        newValue: {
          ...updates,
          adminContext: {
            adminId: (req as any).user?.claims?.sub,
            adminEmail: (req as any).user?.claims?.email,
            timestamp: new Date().toISOString(),
            fieldsModified: Object.keys(updates),
          }
        },
      });

      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating customer:", error);
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  // Update user profile (two path aliases — /api/user/profile used by complete-profile page)
  async function handleProfileUpdate(req: any, res: any) {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const updateSchema = z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        phoneNumber: z.string().optional(),
        dateOfBirth: z.string().optional(),
        address: z.string().optional(),
        insuranceProvider: z.string().optional(),
        insurancePolicyNumber: z.string().optional(),
        insuranceGroupNumber: z.string().optional(),
        allergies: z.string().optional(),
        medicalConditions: z.string().optional(),
        // prescriptionInfo is captured during profile completion and stored as medicalConditions
        prescriptionInfo: z.string().optional(),
      });

      const validated = updateSchema.parse(req.body);
      
      // Convert dateOfBirth string to Date if provided
      const { prescriptionInfo: _rx, ...profileFields } = validated as any;
      const updates: any = { ...profileFields };
      // prescriptionInfo from profile completion stored in medicalConditions when no prior value
      if (_rx) {
        updates.medicalConditions = updates.medicalConditions ?? _rx;
      }
      if (updates.dateOfBirth) {
        const date = new Date(updates.dateOfBirth);
        if (isNaN(date.getTime())) {
          return res.status(400).json({ message: "Invalid date format for dateOfBirth" });
        }
        updates.dateOfBirth = date;
      }
      
      const updated = await storage.updateUserProfile(userId, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      void (async () => {
        await pushPatientToApp(updated, "updated");
      })();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid profile data", errors: error.errors });
      }
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  }
  app.patch("/api/profile", isAuthenticated, handleProfileUpdate);
  app.patch("/api/user/profile", isAuthenticated, handleProfileUpdate);

  app.get("/api/admin/orders", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.patch("/api/admin/orders/:id/status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      // Validate ID parameter
      const { id } = z.object({
        id: z.string().uuid(),
      }).parse(req.params);
      
      // Validate request body with Zod
      const { status } = z.object({
        status: z.enum(["pending", "processing", "completed", "cancelled", "refunded"]),
      }).parse(req.body);

      const updated = await storage.updateOrderStatus(id, status);
      if (!updated) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Reverse any loyalty points awarded for this order when it is cancelled or refunded
      if ((status === "cancelled" || status === "refunded") && updated.userId) {
        void PointsService.voidOrderPoints(
          updated.id,
          updated.userId,
          updated.orderNumber
        ).catch((err) => {
          console.error(`[Loyalty] Failed to void points for order ${updated.orderNumber}:`, err);
        });
      }

      // Push order status change to ConcordiaCare app (fire-and-forget with outbox fallback)
      void (async () => {
        let patientEmail: string | null = null;
        let concordiaCareUserId: string | null = null;
        if (updated.userId) {
          try {
            const patient = await storage.getUser(updated.userId);
            patientEmail = patient?.email ?? null;
            concordiaCareUserId = (patient as any)?.concordiaCareUserId ?? null;
          } catch (_) {}
        }
        await pushOrderStatusToApp({
          orderId: updated.id,
          deliveryStatus: status,
          patientEmail,
          concordiaCareUserId,
        });
      })();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Assign delivery to order
  app.post("/api/admin/orders/:id/assign-delivery", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      
      const deliveryData = z.object({
        courierPartner: z.enum(["PKGSEND", "Burq"]),
        estimatedDelivery: z.string().optional(),
      }).parse(req.body);

      // Courier integrations are not configured. Never fabricate a tracking number
      // or mutate the order as if an external assignment succeeded.
      return res.status(501).json({
        message: "Courier assignment is not integrated; no delivery assignment was made",
        integrated: false,
        courierPartner: deliveryData.courierPartner,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error assigning delivery:", error);
      res.status(500).json({ message: "Failed to assign delivery" });
    }
  });

  // Update delivery status
  app.patch("/api/admin/orders/:id/delivery-status", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      
      const { deliveryStatus, deliveryNotes, proofOfDeliveryUrl } = z.object({
        deliveryStatus: z.enum(["not_assigned", "assigned", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned"]),
        deliveryNotes: z.string().optional(),
        proofOfDeliveryUrl: z.string().url().optional(),
      }).parse(req.body);

      const updateData: any = { deliveryStatus };
      if (deliveryNotes) updateData.deliveryNotes = deliveryNotes;
      if (proofOfDeliveryUrl) updateData.proofOfDeliveryUrl = proofOfDeliveryUrl;
      if (deliveryStatus === "delivered") updateData.actualDelivery = new Date();

      const updated = await storage.updateOrderDelivery(id, updateData);
      if (!updated) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Push delivery status to ConcordiaCare app (fire-and-forget)
      void (async () => {
        let patientEmail: string | null = null;
        let concordiaCareUserId: string | null = null;
        if (updated.userId) {
          try {
            const patient = await storage.getUser(updated.userId);
            patientEmail = patient?.email ?? null;
            concordiaCareUserId = patient?.concordiaCareUserId ?? null;
          } catch (_) {}
        }
        await pushOrderStatusToApp({
          orderId: updated.id,
          deliveryStatus,
          authoritative: false,
          patientEmail,
          concordiaCareUserId,
        });
      })();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating delivery status:", error);
      res.status(500).json({ message: "Failed to update delivery status" });
    }
  });

  // Get order tracking info (patient-facing)
  app.get("/api/orders/:id/tracking", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      const isAdmin = (req.session as any)?.isAdminLoggedIn || false;
      
      // Allow either patient auth or admin auth
      if (!userId && !isAdmin) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const { id } = req.params;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify order belongs to user (or is admin)
      if (userId && order.userId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const tracking = {
        orderNumber: order.orderNumber,
        status: order.status,
        // These are entered by staff locally and are not courier-verified.
        deliveryStatus: order.deliveryStatus,
        deliveryStatusSource: "staff-reported",
        deliveryStatusAuthoritative: false,
        deliveryNotes: order.deliveryNotes,
      };
      res.json(tracking);
    } catch (error) {
      console.error("Error fetching tracking info:", error);
      res.status(500).json({ message: "Failed to fetch tracking info" });
    }
  });

  // Delivery chat routes - two-way masked communication between customer and courier
  app.get("/api/delivery/chat/:orderId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Patient authentication required" });
      }
      const { orderId } = z.object({
        orderId: z.string().uuid(),
      }).parse(req.params);

      // Verify order exists and belongs to user
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.userId !== userId) {
        return res.status(403).json({ message: "You can only view chats for your own orders" });
      }

      const messages = await storage.getDeliveryChatsByOrderId(orderId);
      res.json(messages);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order ID", errors: error.errors });
      }
      console.error("Error fetching delivery chat:", error);
      res.status(500).json({ message: "Failed to fetch delivery chat" });
    }
  });

  app.post("/api/delivery/chat/:orderId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      const isAdminUser = (req.session as any)?.isAdminLoggedIn || false;
      
      // Allow either patient auth or admin auth
      if (!userId && !isAdminUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const { orderId } = z.object({
        orderId: z.string().uuid(),
      }).parse(req.params);

      const { message, senderType } = z.object({
        message: z.string().min(1).max(1000),
        senderType: z.enum(["customer", "courier", "system"]),
      }).parse(req.body);

      // Verify order exists
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Authorization: Only order owner can send messages as customer
      // Only admins can send messages as courier or system
      const isOrderOwner = order.userId === userId;
      
      if (senderType === "customer") {
        if (!isOrderOwner) {
          return res.status(403).json({ message: "You can only send messages for your own orders" });
        }
      } else if (senderType === "courier" || senderType === "system") {
        // Only admins can send messages as courier or system
        if (!isAdminUser) {
          return res.status(403).json({ message: "Only authorized personnel can send courier or system messages" });
        }
      }

      // Only allow chat when delivery is in progress
      const allowedStatuses = ["assigned", "picked_up", "in_transit", "out_for_delivery"];
      if (!allowedStatuses.includes(order.deliveryStatus || "")) {
        return res.status(400).json({ message: "Chat is only available when delivery is in progress" });
      }

      // Audit log for HIPAA compliance
      await storage.createAuditLog({
        userId,
        actionType: "create",
        entityType: "chat",
        entityId: orderId,
        newValue: {
          action: "delivery_chat_message",
          senderType,
          messageLength: message.length,
          timestamp: new Date().toISOString(),
        },
      });

      const chatMessage = await storage.createDeliveryChatMessage(orderId, senderType, message);
      res.json(chatMessage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error sending delivery chat message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ===== CONCORDIA CARE APP BLISTER PACK SYNC =====

  function getConcordiaCareConfig(): { baseUrl: string; apiKey: string } | null {
    let appUrl = process.env.CONCORDIA_CARE_APP_URL;
    const apiKey = getConcordiaCareApiKey();
    if (!apiKey) return null;
    if (!appUrl || (!appUrl.startsWith("http://") && !appUrl.startsWith("https://"))) {
      if (appUrl && (appUrl.includes(".replit.app") || appUrl.includes(".repl.co"))) {
        appUrl = `https://${appUrl}`;
      } else {
        return null; // no valid URL configured — skip push
      }
    }
    return { baseUrl: appUrl.replace(/\/+$/, ""), apiKey };
  }

  // Write a failed outbound push to the sync_outbox for later retry.
  async function queueToOutbox(endpoint: string, method: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      await storage.createSyncOutboxEntry({
        endpoint,
        method,
        payload,
        maxAttempts: 5,
        nextRetryAt: new Date(Date.now() + 60_000), // first retry after 1 minute
        status: "pending",
      });
      console.log(`[ConcordiaCare Outbox] Queued ${method} ${endpoint} for retry`);
      return true;
    } catch (err) {
      console.error("[ConcordiaCare Outbox] Failed to write outbox entry:", err instanceof Error ? err.message : err);
      return false;
    }
  }

  async function hasUncertainBlisterCreate(patientId: number): Promise<boolean> {
    const rows = await db.select({ id: syncOutbox.id }).from(syncOutbox).where(and(
      eq(syncOutbox.status, "failed"),
      eq(syncOutbox.method, "POST"),
      sql`${syncOutbox.payload} ->> ${BLISTER_OUTBOX_PATIENT_ID} = ${String(patientId)}`,
    )).limit(1);
    return rows.length > 0;
  }

  async function recordUncertainBlisterCreate(endpoint: string, patientId: number, reason: string): Promise<void> {
    // A non-idempotent POST may already have committed remotely. Store a
    // non-retryable marker, without copying contact or clinical details.
    await storage.createSyncOutboxEntry({
      endpoint,
      method: "POST",
      payload: { [BLISTER_OUTBOX_PATIENT_ID]: patientId },
      status: "failed",
      maxAttempts: 1,
      nextRetryAt: new Date(),
      lastError: reason,
    });
  }

  // Fire-and-forget: push a prescription workflow status change to the ConcordiaCare app.
  async function pushRxStatusToApp(params: {
    rxNumber?: string | null;
    medicationName?: string | null;
    workflowStatus: string;
    queueName?: string | null;
    patientEmail?: string | null;
    concordiaCareUserId?: string | null;
  }): Promise<void> {
    const config = getConcordiaCareConfig();
    if (!config) return;
    try {
      const payload: Record<string, unknown> = {
        rxNumber: params.rxNumber ?? null,
        medicationName: params.medicationName ?? null,
        workflowStatus: params.workflowStatus,
        queueName: params.queueName ?? null,
      };
      if (params.patientEmail) payload.patientEmail = params.patientEmail;
      if (params.concordiaCareUserId) payload.concordiaCareUserId = params.concordiaCareUserId;
      const resp = await fetch(`${config.baseUrl}/api/external/rx-status-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
        body: JSON.stringify(payload),
      });
      console.log(`[ConcordiaCare Push] rx-status-update Rx#${params.rxNumber} → ${params.workflowStatus}: HTTP ${resp.status}`);
    } catch (err) {
      console.warn(`[ConcordiaCare Push] rx-status-update failed (non-fatal):`, err instanceof Error ? err.message : err);
    }
  }

  // Fire-and-forget: push an order delivery status change to the ConcordiaCare app.
  async function pushOrderStatusToApp(params: {
    orderId: string;
    deliveryStatus: string;
    authoritative?: boolean;
    patientEmail?: string | null;
    concordiaCareUserId?: string | null;
  }): Promise<void> {
    const config = getConcordiaCareConfig();
    if (!config) return;
    const payload: Record<string, unknown> = {
      orderId: params.orderId,
      deliveryStatus: params.deliveryStatus,
      deliveryStatusSource: "staff-reported",
      deliveryStatusAuthoritative: params.authoritative === true,
    };
    if (params.patientEmail) payload.patientEmail = params.patientEmail;
    if (params.concordiaCareUserId) payload.concordiaCareUserId = params.concordiaCareUserId;
    const endpoint = `${config.baseUrl}/api/external/order-status-update`;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        console.log(`[ConcordiaCare Push] order-status-update order ${params.orderId} → ${params.deliveryStatus}: HTTP ${resp.status}`);
      } else if (isPermanentConcordiaCareAuthFailure(resp.status)) {
        console.error(`[ConcordiaCare Push] order-status-update authentication failed (${resp.status}); verify the shared integration secret`);
      } else {
        console.warn(`[ConcordiaCare Push] order-status-update HTTP ${resp.status} — queuing for retry`);
        await queueToOutbox(endpoint, "POST", payload);
      }
    } catch (err) {
      console.warn(`[ConcordiaCare Push] order-status-update failed — queuing for retry:`, err instanceof Error ? err.message : err);
      await queueToOutbox(endpoint, "POST", payload);
    }
  }

  type PatientSyncResult = "success" | "queued" | "unavailable" | "conflict";

  async function pushPatientToApp(
    user: import("@shared/schema").User,
    action: "created" | "updated" = "updated",
  ): Promise<PatientSyncResult> {
    if (user.role !== "patient") return "unavailable";
    const config = getConcordiaCareConfig();
    if (!config) return "unavailable";
    let payload: Record<string, unknown>;
    try {
      payload = buildConcordiaCarePatientPayload(user, { action });
    } catch {
      return "unavailable";
    }
    const endpoint = `${config.baseUrl}/api/external/register-patient`;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        let appUserId: string | undefined;
        try {
          const result = await resp.json() as {
            userId?: string;
            id?: string;
            concordiaCareUserId?: string;
            conflict?: boolean;
          };
          if (result.conflict) return "conflict";
          appUserId = result.userId || result.id || result.concordiaCareUserId;
        } catch {
          // Some older endpoints return an empty/non-JSON success response.
        }
        if (appUserId) {
          const linkResult = await storage.linkConcordiaCareUser(user.id, appUserId);
          if (linkResult === "conflict") return "conflict";
        }
        console.log(`[ConcordiaCare Push] register-patient: HTTP ${resp.status}`);
        return "success";
      } else {
        if (resp.status === 409) {
          console.warn("[ConcordiaCare Push] register-patient identity conflict — not retrying");
          return "conflict";
        }
        if (isPermanentConcordiaCareAuthFailure(resp.status)) {
          console.error(`[ConcordiaCare Push] register-patient authentication failed (${resp.status}); verify the shared integration secret`);
          return "unavailable";
        }
        console.warn(`[ConcordiaCare Push] register-patient HTTP ${resp.status} — queuing for retry`);
        await queueToOutbox(endpoint, "POST", payload);
        return "queued";
      }
    } catch (err) {
      console.warn(`[ConcordiaCare Push] register-patient failed — queuing for retry:`, err instanceof Error ? err.message : err);
      await queueToOutbox(endpoint, "POST", payload);
      return "queued";
    }
  }

  async function createPatientOnApp(user: import("@shared/schema").User): Promise<boolean> {
    const config = getConcordiaCareConfig();
    if (!config) return false;
    try {
      const payload = buildConcordiaCarePatientPayload(user, {
        action: "created",
        includeUsername: true,
      });

      const endpoints = [
        "/api/external/create-patient",
        "/api/external/register",
        "/api/external/sync-patient",
      ];

      for (const endpoint of endpoints) {
        try {
          const resp = await fetch(`${config.baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": config.apiKey,
            },
            body: JSON.stringify(payload),
          });
          const contentType = resp.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) continue;
          const respText = await resp.text();
          if (resp.ok) {
            try {
              const result = JSON.parse(respText) as {
                userId?: string;
                id?: string;
                concordiaCareUserId?: string;
                success?: boolean;
                conflict?: boolean;
              };
              if (result.conflict) return false;
              if (result.userId || result.id || result.concordiaCareUserId || result.success) {
                const appUserId = result.userId || result.id || result.concordiaCareUserId;
                if (appUserId) {
                  const linkResult = await storage.linkConcordiaCareUser(user.id, appUserId);
                  if (linkResult === "conflict") {
                    console.warn("[ConcordiaCare Sync] App returned a conflicting patient link");
                    return false;
                  }
                }
                console.log(`[ConcordiaCare Sync] Created patient on app via ${endpoint}`);
                return true;
              }
            } catch { /* not valid JSON */ }
          }
        } catch { /* endpoint not available */ }
      }

      const syncResp = await fetch(`${config.baseUrl}/api/external/sync-medications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": config.apiKey,
        },
        body: JSON.stringify({
          ...buildConcordiaCarePatientPayload(user, { action: "created" }),
          patientEmail: user.email || undefined,
          medications: [],
          createIfNotExists: true,
        }),
      });
      const syncContentType = syncResp.headers.get("content-type") || "";
      if (syncContentType.includes("application/json")) {
        const syncText = await syncResp.text();
        if (syncResp.ok) {
          try {
            const result = JSON.parse(syncText) as {
              userId?: string;
              id?: string;
              concordiaCareUserId?: string;
              conflict?: boolean;
            };
            if (result.conflict) return false;
            const appUserId = result.userId || result.id || result.concordiaCareUserId;
            if (appUserId) {
              const linkResult = await storage.linkConcordiaCareUser(user.id, appUserId);
              if (linkResult === "conflict") {
                console.warn("[ConcordiaCare Sync] App returned a conflicting patient link");
                return false;
              }
            }
          } catch {
            // A successful legacy response may not contain JSON identity data.
          }
          console.log("[ConcordiaCare Sync] Patient created/linked via sync-medications");
          return true;
        } else {
          console.log(`[ConcordiaCare Sync] Could not auto-create patient on app (${syncResp.status})`);
        }
      }

      return false;
    } catch (error) {
      console.error("[ConcordiaCare Sync] Error creating patient on app");
      return false;
    }
  }

  async function deleteBlisterPackFromApp(patient: any) {
    const config = getConcordiaCareConfig();
    if (!config) return;
    try {
      if (patient.concordiaCareBlisterPackId) {
        const resp = await fetch(`${config.baseUrl}/api/external/blister-pack/${patient.concordiaCareBlisterPackId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": config.apiKey,
          },
        });
        if (resp.ok) {
          console.log(`[ConcordiaCare Sync] Deleted blister pack ${patient.concordiaCareBlisterPackId} from app`);
          return;
        }
        const errText = await resp.text();
        console.error(`[ConcordiaCare Sync] Delete by ID failed (${resp.status}): ${errText}`);
      }

      const resp = await fetch(`${config.baseUrl}/api/external/delete-blister-pack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": config.apiKey,
        },
        body: JSON.stringify({
          firstName: patient.firstName,
          lastName: patient.lastName,
          phone: patient.phoneNumber,
          dateOfBirth: patient.dateOfBirth || undefined,
          patientEmail: patient.email || undefined,
        }),
      });
      if (resp.ok) {
        console.log(`[ConcordiaCare Sync] Deleted blister pack from app for patient ${patient.id}`);
      } else {
        const errText = await resp.text();
        console.error(`[ConcordiaCare Sync] Delete by patient match failed (${resp.status}): ${errText}`);
      }
    } catch (error) {
      console.error("[ConcordiaCare Sync] Error deleting from app:", error);
    }
  }

  function composeWelcomeMessage(firstName: string, username: string): string {
    let appUrl = process.env.CONCORDIA_CARE_APP_URL;
    if (!appUrl) {
      appUrl = "https://concordia-care.replit.app";
    } else if (!appUrl.startsWith("http://") && !appUrl.startsWith("https://")) {
      appUrl = `https://${appUrl}`;
    }
    return [
      `Welcome to Concordia Pharmacy, ${firstName}!`,
      ``,
      `Your ConcordiaCare account is ready. Here's everything you need to get started:`,
      ``,
      `--- Your App Link ---`,
      `${appUrl}`,
      ``,
      `--- Add to Your Home Screen ---`,
      ``,
      `iPhone (Safari):`,
      `1. Open the link above in Safari`,
      `2. Tap the Share button (square with arrow)`,
      `3. Scroll down and tap "Add to Home Screen"`,
      `4. Tap "Add" to confirm`,
      ``,
      `Android (Chrome):`,
      `1. Open the link above in Chrome`,
      `2. Tap the three-dot menu in the top right`,
      `3. Tap "Add to Home Screen"`,
      `4. Tap "Add" to confirm`,
      ``,
      `--- Your Login Info ---`,
      `Username: ${username}`,
      `Use the password you created during sign-up.`,
      ``,
      `If you need any help, call us at (212) 678-0808 or visit us at 514 W 181st St, New York, NY 10033.`,
      ``,
      `— Your Concordia Pharmacy Team`,
    ].join("\n");
  }

  async function sendWelcomeMessage(user: { id: string; firstName: string; lastName: string; username: string; email?: string | null; phoneNumber?: string | null }) {
    try {
      const message = composeWelcomeMessage(user.firstName, user.username);

      await storage.createPatientCommunication({
        userId: user.id,
        type: "welcome",
        direction: "admin_to_patient",
        message,
        subject: "Welcome to Concordia Pharmacy!",
        status: "unread",
      });
      console.log(`[Welcome] Saved welcome message for user ${user.id}`);

      await sendNotificationToApp(
        { id: user.id, firstName: user.firstName, lastName: user.lastName, phoneNumber: user.phoneNumber, email: user.email, linkedUserId: user.id },
        { title: "Welcome to Concordia Pharmacy!", message, type: "welcome" }
      );
    } catch (error) {
      console.error("[Welcome] Non-fatal: failed to send welcome message:", error);
    }
  }

  async function sendNotificationToApp(patient: any, notification: { title: string; message: string; type: string }) {
    const config = getConcordiaCareConfig();
    if (!config) return;
    const payload: Record<string, unknown> = {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phoneNumber,
      dateOfBirth: patient.dateOfBirth || undefined,
      patientEmail: patient.email || undefined,
    };
    if (patient.concordiaCareBlisterPackId) {
      payload.blisterPackId = patient.concordiaCareBlisterPackId;
    }
    if (patient.linkedUserId) {
      payload.userId = patient.linkedUserId;
    }
    const endpoint = `${config.baseUrl}/api/external/send-notification`;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": config.apiKey },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        console.log(`[ConcordiaCare Sync] Notification sent to app for patient ${patient.id}`);
      } else if (isPermanentConcordiaCareAuthFailure(resp.status)) {
        console.error(`[ConcordiaCare Sync] Notification authentication failed (${resp.status}); verify the shared integration secret`);
      } else {
        const errText = await resp.text();
        console.error(`[ConcordiaCare Sync] Send notification failed (${resp.status}): ${errText} — queuing for retry`);
        await queueToOutbox(endpoint, "POST", payload);
      }
    } catch (error) {
      console.error("[ConcordiaCare Sync] Error sending notification — queuing for retry:", error instanceof Error ? error.message : error);
      await queueToOutbox(endpoint, "POST", payload);
    }
  }

  type BlisterSyncResult = "synced" | "queued" | "blocked" | "unavailable";
  const BLISTER_CREATE_SCOPE = "concordia-care-blister-create";

  async function syncBlisterPackToApp(
    action: "create" | "update",
    patient: any,
    updates?: any,
    allowFreshCreate = false,
  ): Promise<BlisterSyncResult> {
    const config = getConcordiaCareConfig();
    if (!config) return "unavailable";
    const { baseUrl, apiKey } = config;

    // Hoisted so the catch block can queue to the outbox on network failure.
    let outboxEndpoint: string | null = null;
    let outboxMethod: string | null = null;
    let outboxPayload: Record<string, unknown> | null = null;
    let createClaimKey: string | null = null;
    let createOutboxSaved = false;

    try {
      const timeSlotMap: Record<string, string> = {
        morning: "Morning",
        noon: "Afternoon",
        evening: "Evening",
        bedtime: "Bedtime",
      };

      const customTimeMap: Record<string, string | undefined> = {
        morning: patient.morningTime || undefined,
        noon: patient.noonTime || undefined,
        evening: patient.eveningTime || undefined,
        bedtime: patient.bedtimeTime || undefined,
      };

      const durationMap: Record<string, number> = {
        weekly: 7,
        bi_weekly: 14,
        monthly: 30,
        multi_dose: 30,
        unit_dose: 30,
      };

      function mapMedications(meds: any[]): any[] {
        if (!Array.isArray(meds)) return [];
        const result: any[] = [];
        for (const m of meds) {
          if (!m || !m.name || m.isActive === false) continue;
          const times = Array.isArray(m.intakeTimes) && m.intakeTimes.length > 0
            ? m.intakeTimes
            : ["morning"];
          for (const t of times) {
            result.push({
              name: m.name,
              strength: m.dosage || m.strength || "",
              quantity: m.dosage || "1 tablet",
              timeSlot: timeSlotMap[t] || "Morning",
              customTime: customTimeMap[t] || undefined,
              instructions: m.instructions || "",
            });
          }
        }
        return result;
      }

      if (action === "create") {
        if (
          (patient.lastSyncedToApp && !patient.concordiaCareBlisterPackId) ||
          await hasUncertainBlisterCreate(patient.id)
        ) {
          // The app accepted a previous create without returning an ID. A new
          // POST could create a second pack; staff must reconcile it first.
          return "blocked";
        }
        const linkedUser = patient.linkedUserId
          ? await storage.getUser(patient.linkedUserId)
          : undefined;
        const identity = resolveBlisterSyncIdentity(patient, linkedUser);
        if (!identity.ok) {
          // Contact details cannot establish ownership in the other app.
          // Guest and unmatched records remain local for staff review.
          return "blocked";
        }

        const medications = mapBlisterCreateMedications(patient.medications || []);
        if (!patient.pharmacyEnrollmentId || !medications) {
          console.warn("[ConcordiaCare Sync] Create blocked: enrollment ID or medication schedule needs staff review");
          return "blocked";
        }
        const durationDays = durationMap[patient.blisterPackType] || 30;
        const startDate = patient.nextPackDate
          ? new Date(patient.nextPackDate).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        const payload: BlisterCreatePayload = {
          ...identity.payload,
          pharmacyEnrollmentId: patient.pharmacyEnrollmentId,
          patientEmail: linkedUser?.email || undefined,
          firstName: linkedUser?.firstName,
          lastName: linkedUser?.lastName,
          phone: linkedUser?.phoneNumber || undefined,
          dateOfBirth: linkedUser?.dateOfBirth || undefined,
          name: `${patient.firstName} ${patient.lastName} - ${(patient.blisterPackType || "monthly").replace(/_/g, " ")} Pack`,
          medications,
          durationDays,
          startDate,
        };
        if (!isValidBlisterCreatePayload(payload)) {
          console.warn("[ConcordiaCare Sync] Create blocked: invalid enrollment or linked app identifier");
          return "blocked";
        }

        outboxEndpoint = `${baseUrl}/api/external/create-blister-pack`;
        const createKey = String(patient.id);
        const claim = await claimRequest(BLISTER_CREATE_SCOPE, createKey, { patientId: patient.id });
        if (!claim || claim.kind === "mismatch") {
          outboxPayload = null;
          return "blocked";
        }
        if (claim.kind === "duplicate") {
          outboxPayload = null;
          const existingId = claim.statusCode === 200 ? getCreatedBlisterPackId(claim.body) : null;
          if (!existingId) return "blocked";
          await storage.updateBlisterPackSyncMeta(patient.id, {
            concordiaCareBlisterPackId: existingId,
            lastSyncedToApp: new Date(),
          });
          return "synced";
        }
        if (!allowFreshCreate) {
          // Historical rows may already have a remote pack from a successful
          // response whose ID the old sender ignored. Only a just-created
          // local row is eligible for an automatic first POST.
          await releaseUncompletedRequest(BLISTER_CREATE_SCOPE, createKey);
          outboxPayload = null;
          return "blocked";
        }

        createClaimKey = createKey;
        // Persist the exact body before sending. A timeout can follow a
        // committed create; the receiver deduplicates by enrollment ID.
        const outboxEntry = await storage.createSyncOutboxEntry({
          endpoint: outboxEndpoint, method: "POST",
          payload: { ...payload, [BLISTER_OUTBOX_PATIENT_ID]: patient.id },
          status: "pending", maxAttempts: 5,
          nextRetryAt: new Date(Date.now() + 60_000),
        });
        createOutboxSaved = true;

        const delivery = await postBlisterCreate(outboxEndpoint, apiKey, payload);
        if (delivery.kind === "accepted") {
          await storage.updateBlisterPackSyncMeta(patient.id, {
            concordiaCareBlisterPackId: delivery.blisterPackId,
            lastSyncedToApp: new Date(),
          });
          await storage.markSyncOutboxDelivered(outboxEntry.id);
          await completeRequest(BLISTER_CREATE_SCOPE, createKey, 200, { blisterPackId: delivery.blisterPackId });
          console.log(`[ConcordiaCare Sync] Created blister pack for enrollment ${patient.id}`);
          return "synced";
        }
        if (delivery.kind === "rejected") {
          await storage.markSyncOutboxFailed(outboxEntry.id,
            `Create rejected (HTTP ${delivery.status}${delivery.code ? `, ${delivery.code}` : ""}); staff review required`);
          await releaseUncompletedRequest(BLISTER_CREATE_SCOPE, createKey);
          console.warn(`[ConcordiaCare Sync] Create rejected (HTTP ${delivery.status}${delivery.code ? `, ${delivery.code}` : ""}); staff review required`);
          return "blocked";
        }
        if (delivery.kind === "invalid_response") {
          await storage.markSyncOutboxFailed(outboxEntry.id, "Create accepted without blisterPackId; staff review required");
          return "blocked";
        }
        console.warn("[ConcordiaCare Sync] Create delivery uncertain; identical payload queued for retry");
        return "queued";
      } else if (action === "update") {
        const mergedPatient = { ...patient, ...updates };
        const appPackId = mergedPatient.concordiaCareBlisterPackId || patient.concordiaCareBlisterPackId;
        if (!appPackId) {
          const freshPatient = await storage.getBlisterPackPatient(patient.id);
          if (freshPatient?.concordiaCareBlisterPackId) {
            return syncBlisterPackToApp("update", freshPatient, updates, allowFreshCreate);
          }
          console.log(`[ConcordiaCare Sync] No app pack ID for patient ${patient.id}, attempting create instead`);
          return syncBlisterPackToApp("create", mergedPatient, undefined, allowFreshCreate);
        }

        const statusMap: Record<string, string> = {
          active: "active",
          pending: "paused",
          on_hold: "paused",
          discontinued: "cancelled",
        };

        const patchPayload: Record<string, unknown> = {
          firstName: mergedPatient.firstName,
          lastName: mergedPatient.lastName,
          phone: mergedPatient.phoneNumber,
          dateOfBirth: mergedPatient.dateOfBirth || undefined,
          patientEmail: mergedPatient.email || undefined,
          name: `${mergedPatient.firstName} ${mergedPatient.lastName} - ${(mergedPatient.blisterPackType || "monthly").replace(/_/g, " ")} Pack`,
          medications: mapMedications(mergedPatient.medications || []),
          durationDays: durationMap[mergedPatient.blisterPackType] || 30,
          status: statusMap[mergedPatient.status] || mergedPatient.status || "active",
        };

        outboxEndpoint = `${baseUrl}/api/external/blister-pack/${appPackId}`;
        outboxMethod = "PATCH";
        outboxPayload = patchPayload;

        const resp = await fetch(outboxEndpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
          body: JSON.stringify(patchPayload),
        });

        if (resp.ok) {
          outboxPayload = null; // delivered — no retry needed
          await storage.updateBlisterPackSyncMeta(patient.id, { lastSyncedToApp: new Date() });
          console.log(`[ConcordiaCare Sync] Updated blister pack ${appPackId} for patient ${patient.id}`);
          return "synced";
        } else if (isPermanentConcordiaCareAuthFailure(resp.status)) {
          outboxPayload = null;
          console.error(`[ConcordiaCare Sync] Update authentication failed (${resp.status}); verify the shared integration secret`);
          return "blocked";
        } else if (isPermanentBlisterSyncFailure(resp.status, outboxEndpoint)) {
          outboxPayload = null;
          console.error(`[ConcordiaCare Sync] Update rejected (${resp.status}); staff reconciliation required`);
          return "blocked";
        } else {
          const errText = await resp.text();
          console.error(`[ConcordiaCare Sync] Update failed (${resp.status}): ${errText} — queuing for retry`);
          const queued = await queueToOutbox(outboxEndpoint, "PATCH", patchPayload);
          outboxPayload = null; // already queued
          return queued ? "queued" : "blocked";
        }
      }
      return "blocked";
    } catch (error) {
      console.error("[ConcordiaCare Sync] Error syncing blister pack:", error instanceof Error ? error.message : error);
      if (action === "create") {
        if (createClaimKey && !createOutboxSaved) {
          await releaseUncompletedRequest(BLISTER_CREATE_SCOPE, createClaimKey);
        }
        return createOutboxSaved ? "queued" : "blocked";
      }
      if (outboxEndpoint && outboxMethod && outboxPayload) {
        return await queueToOutbox(outboxEndpoint, outboxMethod, outboxPayload) ? "queued" : "blocked";
      }
      return "blocked";
    }
  }

  const lastMedSyncTimestamps = new Map<string, Date>();

  async function syncMedicationsToApp(userId: string, patient?: any, force?: boolean) {
    const config = getConcordiaCareConfig();
    if (!config) return;
    const { baseUrl, apiKey } = config;

    // Hoisted so the catch block can queue it to the outbox on network failure.
    let payload: Record<string, unknown> | null = null;

    try {
      const userRecord = patient || await storage.getUser(userId);
      if (!userRecord) {
        console.log(`[ConcordiaCare Med Sync] No user found for ${userId}`);
        return;
      }

      const userPrescriptions = await storage.getPrescriptionsByUserId(userId);
      if (!userPrescriptions || userPrescriptions.length === 0) {
        console.log(`[ConcordiaCare Med Sync] No prescriptions for user ${userRecord.id}`);
        return;
      }

      const medications = userPrescriptions.map((rx: any) => ({
        name: rx.medicationName,
        dosage: rx.dosage || "",
        frequency: rx.frequency || "",
        rxNumber: rx.rxNumber || "",
        refillsRemaining: rx.refillsRemaining ?? 0,
        prescribedBy: rx.prescribedBy || "",
        instructions: rx.instructions || "",
        ndc: rx.ndc || "",
        quantity: rx.quantity || 0,
        status: rx.status || "active",
        lastFilledDate: rx.lastFilledDate || null,
        nextRefillDate: rx.nextRefillDate || null,
      }));

      payload = {
        ...buildConcordiaCarePatientPayload(userRecord, { action: "updated" }),
        patientEmail: userRecord.email || undefined,
        medications,
      };

      const resp = await fetch(`${baseUrl}/api/external/sync-medications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const respText = await resp.text();
      if (resp.ok) {
        lastMedSyncTimestamps.set(userId, new Date());
        try {
          const result = JSON.parse(respText);
          console.log(`[ConcordiaCare Med Sync] Synced ${medications.length} medication(s) for user ${userRecord.id}`);
        } catch {
          console.log(`[ConcordiaCare Med Sync] Synced ${medications.length} medication(s) for user ${userRecord.id}`);
        }
      } else {
        lastMedSyncTimestamps.set(userId, new Date());
        if (isPermanentConcordiaCareAuthFailure(resp.status)) {
          payload = null;
          console.error(`[ConcordiaCare Med Sync] Authentication failed (${resp.status}); verify the shared integration secret`);
          return;
        }
        if (resp.status === 404) {
          console.log(`[ConcordiaCare Sync] Patient not found on app for user ${userId} — attempting auto-create, then queuing med sync for retry`);
          createPatientOnApp(userRecord).then(created => {
            if (created) {
              console.log(`[ConcordiaCare Sync] Auto-created patient, med sync queued for next retry cycle`);
            } else {
              console.log(`[ConcordiaCare Sync] Could not auto-create — queued for retry`);
            }
          });
        }
        // Queue on ALL non-2xx responses (including 404) so no sync event is lost
        if (payload) {
          console.error(`[ConcordiaCare Med Sync] Failed (${resp.status}) — queuing for retry`);
          await queueToOutbox(`${baseUrl}/api/external/sync-medications`, "POST", payload);
          payload = null;
        }
      }
    } catch (error) {
      console.error("[ConcordiaCare Med Sync] Error — queuing for retry:", error instanceof Error ? error.message : error);
      if (payload) {
        await queueToOutbox(`${baseUrl}/api/external/sync-medications`, "POST", payload);
      }
    }
  }

  // ===== BLISTER PACK PATIENT MANAGEMENT =====
  
  // Get all blister pack patients (admin)
  app.get("/api/admin/blister-patients", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const patients = await storage.getAllBlisterPackPatients();
      res.json(patients);
    } catch (error) {
      console.error("Error fetching blister pack patients:", error);
      res.status(500).json({ message: "Failed to fetch blister pack patients" });
    }
  });

  // Get single blister pack patient (admin)
  app.get("/api/admin/blister-patients/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const patient = await storage.getBlisterPackPatient(id);
      if (!patient) {
        return res.status(404).json({ message: "Blister pack patient not found" });
      }

      // Audit log for PHI access
      await storage.createAuditLog({
        userId: (req.session as any)?.adminId || "admin",
        actionType: "view",
        entityType: "user",
        entityId: String(id),
        newValue: {
          action: "view_blister_patient_profile",
          patientName: `${patient.firstName} ${patient.lastName}`,
          timestamp: new Date().toISOString(),
        },
      });

      res.json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient ID", errors: error.errors });
      }
      console.error("Error fetching blister pack patient:", error);
      res.status(500).json({ message: "Failed to fetch blister pack patient" });
    }
  });

  // Create new blister pack patient (admin)
  app.post("/api/admin/blister-patients", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const emptyToNull = (val: unknown) => (typeof val === "string" && val.trim() === "") ? null : val;
      const body = Object.fromEntries(
        Object.entries(req.body).map(([k, v]) => [k, emptyToNull(v)])
      );
      const patientData = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional().nullable(),
        phoneNumber: z.string().min(10),
        alternatePhone: z.string().optional().nullable(),
        dateOfBirth: z.string().optional().nullable(),
        age: z.number().int().positive().optional().nullable(),
        gender: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zipCode: z.string().optional().nullable(),
        insuranceProvider: z.string().optional().nullable(),
        insurancePolicyNumber: z.string().optional().nullable(),
        insuranceGroupNumber: z.string().optional().nullable(),
        insurancePhone: z.string().optional().nullable(),
        primaryDoctor: z.string().optional().nullable(),
        doctorPhone: z.string().optional().nullable(),
        doctorFax: z.string().optional().nullable(),
        allergies: z.string().optional().nullable(),
        medicalConditions: z.string().optional().nullable(),
        blisterPackType: z.enum(["weekly", "bi_weekly", "monthly", "multi_dose", "unit_dose"]).optional(),
        status: z.enum(["pending", "active", "on_hold", "discontinued"]).optional(),
        medications: z.array(z.any()).optional(),
        deliveryDay: z.string().optional().nullable(),
        deliveryTime: z.string().optional().nullable(),
        deliveryPreference: z.string().optional().nullable(),
        morningTime: z.string().optional().nullable(),
        noonTime: z.string().optional().nullable(),
        eveningTime: z.string().optional().nullable(),
        bedtimeTime: z.string().optional().nullable(),
        preferences: z.string().optional().nullable(),
        languagePreference: z.string().optional().nullable(),
        specialInstructions: z.string().optional().nullable(),
        emergencyContactName: z.string().optional().nullable(),
        emergencyContactPhone: z.string().optional().nullable(),
        emergencyContactRelation: z.string().optional().nullable(),
        adminNotes: z.string().optional().nullable(),
        enrollmentSource: z.string().optional().nullable(),
        previousPharmacyName: z.string().optional().nullable(),
        previousPharmacyPhone: z.string().optional().nullable(),
        isNewPatient: z.boolean().optional(),
      }).parse(body);

      const patient = await storage.createBlisterPackPatient(patientData as any);

      // Audit log for patient creation
      await storage.createAuditLog({
        userId: (req.session as any)?.adminId || "admin",
        actionType: "create",
        entityType: "user",
        entityId: String(patient.id),
        newValue: {
          action: "create_blister_patient",
          patientName: `${patient.firstName} ${patient.lastName}`,
          timestamp: new Date().toISOString(),
        },
      });

      syncBlisterPackToApp("create", patient, undefined, true);

      res.status(201).json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient data", errors: error.errors });
      }
      console.error("Error creating blister pack patient:", error);
      res.status(500).json({ message: "Failed to create blister pack patient" });
    }
  });

  // Update blister pack patient (admin)
  app.patch("/api/admin/blister-patients/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const emptyToNull = (val: unknown) => (typeof val === "string" && val.trim() === "") ? null : val;
      const body = Object.fromEntries(
        Object.entries(req.body).map(([k, v]) => [k, emptyToNull(v)])
      );

      const updates = z.object({
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().email().optional().nullable(),
        phoneNumber: z.string().min(10).optional(),
        alternatePhone: z.string().optional().nullable(),
        dateOfBirth: z.string().optional().nullable(),
        age: z.number().int().positive().optional().nullable(),
        gender: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zipCode: z.string().optional().nullable(),
        insuranceProvider: z.string().optional().nullable(),
        insurancePolicyNumber: z.string().optional().nullable(),
        insuranceGroupNumber: z.string().optional().nullable(),
        insurancePhone: z.string().optional().nullable(),
        primaryDoctor: z.string().optional().nullable(),
        doctorPhone: z.string().optional().nullable(),
        doctorFax: z.string().optional().nullable(),
        allergies: z.string().optional().nullable(),
        medicalConditions: z.string().optional().nullable(),
        blisterPackType: z.enum(["weekly", "bi_weekly", "monthly", "multi_dose", "unit_dose"]).optional(),
        status: z.enum(["pending", "active", "on_hold", "discontinued"]).optional(),
        medications: z.array(z.any()).optional(),
        deliveryDay: z.string().optional().nullable(),
        deliveryTime: z.string().optional().nullable(),
        deliveryPreference: z.string().optional().nullable(),
        morningTime: z.string().optional().nullable(),
        noonTime: z.string().optional().nullable(),
        eveningTime: z.string().optional().nullable(),
        bedtimeTime: z.string().optional().nullable(),
        preferences: z.string().optional().nullable(),
        languagePreference: z.string().optional().nullable(),
        specialInstructions: z.string().optional().nullable(),
        emergencyContactName: z.string().optional().nullable(),
        emergencyContactPhone: z.string().optional().nullable(),
        emergencyContactRelation: z.string().optional().nullable(),
        adminNotes: z.string().optional().nullable(),
        lastPackDate: z.string().optional().nullable(),
        nextPackDate: z.string().optional().nullable(),
      }).parse(body);

      // Get existing patient for audit logging
      const existing = await storage.getBlisterPackPatient(id);
      if (!existing) {
        return res.status(404).json({ message: "Blister pack patient not found" });
      }

      const updated = await storage.updateBlisterPackPatient(id, updates as any);

      // Audit log for patient update
      await storage.createAuditLog({
        userId: (req.session as any)?.adminId || "admin",
        actionType: "update",
        entityType: "user",
        entityId: String(id),
        oldValue: existing,
        newValue: {
          action: "update_blister_patient",
          patientName: `${existing.firstName} ${existing.lastName}`,
          updatedFields: Object.keys(updates),
          timestamp: new Date().toISOString(),
        },
      });

      syncBlisterPackToApp("update", existing, updates);

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient data", errors: error.errors });
      }
      console.error("Error updating blister pack patient:", error);
      res.status(500).json({ message: "Failed to update blister pack patient" });
    }
  });

  // Delete blister pack patient (admin)
  app.delete("/api/admin/blister-patients/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      // Get existing patient for audit logging
      const existing = await storage.getBlisterPackPatient(id);
      if (!existing) {
        return res.status(404).json({ message: "Blister pack patient not found" });
      }

      deleteBlisterPackFromApp(existing);

      await storage.deleteBlisterPackPatient(id);

      // Audit log for patient deletion
      await storage.createAuditLog({
        userId: (req.session as any)?.adminId || "admin",
        actionType: "delete",
        entityType: "user",
        entityId: String(id),
        oldValue: {
          action: "delete_blister_patient",
          patientName: `${existing.firstName} ${existing.lastName}`,
          timestamp: new Date().toISOString(),
        },
      });

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient ID", errors: error.errors });
      }
      console.error("Error deleting blister pack patient:", error);
      res.status(500).json({ message: "Failed to delete blister pack patient" });
    }
  });

  app.post("/api/admin/blister-patients/:id/sync-to-app", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const patient = await storage.getBlisterPackPatient(id);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      const result = patient.concordiaCareBlisterPackId
        ? await syncBlisterPackToApp("update", patient)
        : await syncBlisterPackToApp("create", patient);
      if (result === "blocked") {
        return res.status(409).json({
          success: false,
          message: "Sync needs staff review: verify the patient's ConcordiaCare account link and reconcile any pack already accepted by the app.",
        });
      }
      if (result === "unavailable") {
        return res.status(503).json({ success: false, message: "ConcordiaCare sync is not configured." });
      }
      if (result === "queued") {
        return res.status(202).json({ success: false, pending: true, message: "Sync queued for retry." });
      }

      const refreshed = await storage.getBlisterPackPatient(id);
      res.json({
        success: true,
        message: refreshed?.concordiaCareBlisterPackId
          ? `Synced to ConcordiaCare app (ID: ${refreshed.concordiaCareBlisterPackId})`
          : "Sync completed",
        lastSyncedToApp: refreshed?.lastSyncedToApp,
        concordiaCareBlisterPackId: refreshed?.concordiaCareBlisterPackId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient ID" });
      }
      console.error("Error syncing patient to app:", error);
      res.status(500).json({ message: "Sync failed" });
    }
  });

  // Get medication history for blister pack patient (admin)
  app.get("/api/admin/blister-patients/:id/medication-history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const patient = await storage.getBlisterPackPatient(id);
      if (!patient) {
        return res.status(404).json({ message: "Blister pack patient not found" });
      }

      const history = await storage.getBlisterPackMedicationHistory(id);
      res.json(history);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid patient ID", errors: error.errors });
      }
      console.error("Error fetching medication history:", error);
      res.status(500).json({ message: "Failed to fetch medication history" });
    }
  });

  // Add medication history entry for blister pack patient (admin)
  app.post("/api/admin/blister-patients/:id/medication-history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const historyData = z.object({
        action: z.string().min(1),
        medicationName: z.string().min(1),
        oldValue: z.any().optional(),
        newValue: z.any().optional(),
        changedBy: z.string().optional(),
        reason: z.string().optional(),
      }).parse(req.body);

      const patient = await storage.getBlisterPackPatient(id);
      if (!patient) {
        return res.status(404).json({ message: "Blister pack patient not found" });
      }

      const entry = await storage.addBlisterPackMedicationHistory({
        patientId: id,
        ...historyData,
      });

      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid history data", errors: error.errors });
      }
      console.error("Error adding medication history:", error);
      res.status(500).json({ message: "Failed to add medication history" });
    }
  });

  // Public blister pack enrollment endpoint (for landing page form)
  app.post("/api/blister-pack/enroll", async (req: any, res) => {
    try {
      const enrollmentData = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email().optional().nullable(),
        phoneNumber: z.string().min(10),
        dateOfBirth: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zipCode: z.string().optional().nullable(),
        insuranceProvider: z.string().optional().nullable(),
        insurancePolicyNumber: z.string().optional().nullable(),
        primaryDoctor: z.string().optional().nullable(),
        doctorPhone: z.string().optional().nullable(),
        medications: z.array(z.any()).optional(),
        allergies: z.string().optional().nullable(),
        preferences: z.string().optional().nullable(),
        isNewPatient: z.boolean().optional(),
        previousPharmacyName: z.string().optional().nullable(),
        previousPharmacyPhone: z.string().optional().nullable(),
        enrollmentSource: z.string().optional(),
      }).parse(req.body);

      // Check if patient already enrolled
      const existing = await storage.getBlisterPackPatientByPhone(enrollmentData.phoneNumber);
      if (existing) {
        return res.status(400).json({ message: "A patient with this phone number is already enrolled" });
      }

      const patient = await storage.createBlisterPackPatient({
        ...enrollmentData,
        status: "pending",
        enrollmentSource: enrollmentData.enrollmentSource || "website",
      } as any);

      // Audit log for enrollment
      await storage.createAuditLog({
        userId: "system",
        actionType: "create",
        entityType: "user",
        entityId: String(patient.id),
        newValue: {
          action: "blister_pack_enrollment",
          patientName: `${patient.firstName} ${patient.lastName}`,
          source: enrollmentData.enrollmentSource || "website",
          timestamp: new Date().toISOString(),
        },
      });

      syncBlisterPackToApp("create", patient, undefined, true);

      res.status(201).json({ 
        success: true, 
        message: "Enrollment submitted successfully. We will contact you within 24-48 hours.",
        patientId: patient.id 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid enrollment data", errors: error.errors });
      }
      console.error("Error processing blister pack enrollment:", error);
      res.status(500).json({ message: "Failed to process enrollment" });
    }
  });

  // ==================== Patient-Facing Blister Pack Routes ====================
  
  // Patient: Check blister enrollment status (for authenticated users)
  app.get("/api/my-blister-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Find blister patient by linked user ID
      const patient = await storage.getBlisterPackPatientByUserId(userId);
      
      if (!patient) {
        return res.json({ enrolled: false });
      }

      // Get communications for this patient
      const communications = await storage.getPatientCommunications(patient.id);

      res.json({
        enrolled: true,
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          status: patient.status,
          medications: patient.medications || [],
          nextPackDate: patient.nextPackDate,
          lastPackDate: patient.lastPackDate,
          deliveryPreference: patient.deliveryPreference,
          deliveryDay: patient.deliveryDay,
          morningTime: patient.morningTime,
          noonTime: patient.noonTime,
          eveningTime: patient.eveningTime,
          bedtimeTime: patient.bedtimeTime,
          enrolledAt: patient.enrolledAt,
          preferences: patient.preferences,
        },
        communications: communications.map(c => ({
          id: c.id,
          type: c.type,
          subject: c.subject,
          message: c.message,
          status: c.status,
          createdAt: c.createdAt,
          readAt: c.readAt,
        })),
        unreadCount: communications.filter(c => c.status === "unread" && c.direction === "admin_to_patient").length,
      });
    } catch (error) {
      console.error("Error getting blister status:", error);
      res.status(500).json({ message: "Failed to get blister status" });
    }
  });

  // Patient: Mark communication as read
  app.patch("/api/my-blister-communications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      // Verify the patient owns this communication
      const patient = await storage.getBlisterPackPatientByUserId(userId);
      if (!patient) {
        return res.status(404).json({ message: "Blister patient not found" });
      }

      const communication = await storage.getPatientCommunication(id);
      if (!communication || communication.blisterPatientId !== patient.id) {
        return res.status(404).json({ message: "Communication not found" });
      }

      // Mark as read
      const updated = await storage.updatePatientCommunication(id, {
        status: "read",
        readAt: new Date(),
      });

      res.json(updated);
    } catch (error) {
      console.error("Error marking communication as read:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // Patient: Send message to pharmacy (from blister info section)
  app.post("/api/my-blister-communications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const patient = await storage.getBlisterPackPatientByUserId(userId);
      if (!patient) {
        return res.status(404).json({ message: "Not enrolled in blister pack program" });
      }

      const messageData = z.object({
        type: z.enum(["request_blister", "request_new_meds", "request_blister_change", "general_inquiry"]),
        message: z.string().min(1),
        subject: z.string().optional(),
      }).parse(req.body);

      const communication = await storage.createPatientCommunication({
        blisterPatientId: patient.id,
        userId: userId,
        type: messageData.type,
        direction: "patient_to_admin",
        message: messageData.message,
        subject: messageData.subject,
        status: "unread",
      });

      // Broadcast to admin WebSocket for real-time updates
      broadcastUpdate("blister-communications", { patientId: patient.id });

      res.status(201).json(communication);
    } catch (error) {
      console.error("Error sending communication:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ==================== Patient Communications Routes ====================

  // Admin: Send notification to a blister patient
  app.post("/api/admin/blister-patients/:id/notify", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const notifyData = z.object({
        type: z.enum(["blister_ready", "blister_due_soon", "new_prescription_required", "no_more_refills", "prescription_ready", "delivery_scheduled", "custom_message", "payment_reminder", "general_update"]),
        message: z.string().min(1),
        subject: z.string().optional(),
      }).parse(req.body);

      const patient = await storage.getBlisterPackPatient(id);
      if (!patient) {
        return res.status(404).json({ message: "Blister pack patient not found" });
      }

      const adminId = req.user?.claims?.sub || "admin";

      const communication = await storage.createPatientCommunication({
        blisterPatientId: id,
        userId: patient.linkedUserId || null,
        type: notifyData.type,
        direction: "admin_to_patient",
        message: notifyData.message,
        subject: notifyData.subject,
        sentBy: adminId,
        status: "unread",
      });

      // Also create a notification if the patient has a linked user account
      if (patient.linkedUserId) {
        await storage.createNotification({
          userId: patient.linkedUserId,
          type: "system",
          title: notifyData.subject || "Pharmacy Update",
          message: notifyData.message,
          channel: "in_app",
        });
      }

      sendNotificationToApp(patient, {
        title: notifyData.subject || "Pharmacy Update",
        message: notifyData.message,
        type: notifyData.type,
      });

      // Audit log
      await storage.createAuditLog({
        userId: adminId,
        actionType: "create",
        entityType: "user",
        entityId: String(id),
        newValue: {
          action: "blister_patient_notification",
          type: notifyData.type,
          patientName: `${patient.firstName} ${patient.lastName}`,
          timestamp: new Date().toISOString(),
        },
      });

      res.status(201).json(communication);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid notification data", errors: error.errors });
      }
      console.error("Error sending notification:", error);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // Admin: Get all communications for a blister patient
  app.get("/api/admin/blister-patients/:id/communications", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const communications = await storage.getPatientCommunicationsFiltered({ blisterPatientId: id });
      res.json(communications);
    } catch (error) {
      console.error("Error fetching communications:", error);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });

  // Admin: Mark communication as acknowledged
  app.patch("/api/admin/communications/:id/acknowledge", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const adminId = req.user?.claims?.sub || "admin";
      const updated = await storage.markCommunicationAcknowledged(id, adminId);
      
      if (!updated) {
        return res.status(404).json({ message: "Communication not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging communication:", error);
      res.status(500).json({ message: "Failed to acknowledge communication" });
    }
  });

  // Admin: Mark communication as resolved
  app.patch("/api/admin/communications/:id/resolve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const adminId = req.user?.claims?.sub || "admin";
      const updated = await storage.markCommunicationResolved(id, adminId);
      
      if (!updated) {
        return res.status(404).json({ message: "Communication not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error resolving communication:", error);
      res.status(500).json({ message: "Failed to resolve communication" });
    }
  });

  // Patient: Send a request to admin
  app.post("/api/patient/communications", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestData = z.object({
        type: z.enum(["request_blister", "request_new_meds", "request_blister_change", "general_inquiry"]),
        message: z.string().min(1),
        subject: z.string().optional(),
      }).parse(req.body);

      const communication = await storage.createPatientCommunication({
        userId: patientId,
        type: requestData.type,
        direction: "patient_to_admin",
        message: requestData.message,
        subject: requestData.subject,
        status: "unread",
      });

      // Audit log
      await storage.createAuditLog({
        userId: patientId,
        actionType: "create",
        entityType: "user",
        entityId: patientId,
        newValue: {
          action: "patient_request_submitted",
          type: requestData.type,
          timestamp: new Date().toISOString(),
        },
      });

      res.status(201).json(communication);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error submitting patient request:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  // Patient: Get their communications
  app.get("/api/patient/communications", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const communications = await storage.getPatientCommunicationsFiltered({ userId: patientId });
      res.json(communications);
    } catch (error) {
      console.error("Error fetching patient communications:", error);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });

  // Patient: Mark communication as read
  app.patch("/api/patient/communications/:id/read", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const updated = await storage.markCommunicationRead(id);
      
      if (!updated) {
        return res.status(404).json({ message: "Communication not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error marking communication as read:", error);
      res.status(500).json({ message: "Failed to update communication" });
    }
  });

  // ==================== Transfer Request Notification Helper ====================

  async function sendTransferRequestNotifications(params: {
    request: { id: number };
    contactName: string;
    phoneNumber: string;
    email?: string | null;
    mode: string;
    previousPharmacyName?: string | null;
    previousPharmacyPhone?: string | null;
    expectedMedCount?: number | null;
    wellnessPackEligible: boolean;
    source: string;
    medications?: string[];
  }): Promise<void> {
    const { request, contactName, phoneNumber, email, mode, previousPharmacyName, previousPharmacyPhone, expectedMedCount, wellnessPackEligible, source, medications } = params;
    try {
      let emailRecipients: string[] = [];
      let smsRecipients: string[] = [];
      try {
        const dbRecipients = await storage.getNotificationRecipients("transfer_request");
        emailRecipients = dbRecipients.filter((r) => r.isActive && r.channel === "email").map((r) => r.address);
        smsRecipients = dbRecipients.filter((r) => r.isActive && r.channel === "sms").map((r) => r.address);
      } catch (lookupErr) {
        console.error("[TransferRequest] Failed to load notification recipients from DB:", lookupErr);
      }
      if (emailRecipients.length === 0) {
        emailRecipients = (process.env.PHARMACY_TEAM_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (smsRecipients.length === 0) {
        smsRecipients = (process.env.PHARMACY_TEAM_SMS || "").split(",").map((s) => s.trim()).filter(Boolean);
      }

      const modeLabel: Record<string, string> = {
        form_submission: "Form submission",
        label_upload: "Label upload",
        click_to_call: "Click to call",
      };
      const sourceLabel = source === "app" ? "ConcordiaCare app" : "Concordia website";
      const rows: Array<[string, string]> = [
        ["Contact name", contactName],
        ["Phone", phoneNumber],
        ["Email", email || "—"],
        ["Source", sourceLabel],
        ["Mode", modeLabel[mode] || mode],
        ["Previous pharmacy", previousPharmacyName || "—"],
        ["Previous pharmacy phone", previousPharmacyPhone || "—"],
        ...(medications && medications.length > 0 ? [["Medications", medications.join(", ")] as [string, string]] : []),
        ["Expected meds", String(expectedMedCount ?? 0)],
        ["Wellness pack eligible", wellnessPackEligible ? "Yes" : "No"],
        ["Request ID", String(request.id)],
      ];

      if (emailRecipients.length > 0) {
        const html = `
          <div style="font-family: Arial, sans-serif; color: #111;">
            <h2 style="margin:0 0 12px;">New prescription transfer request</h2>
            <p style="margin:0 0 16px;">A patient submitted a transfer request via the ${sourceLabel}.</p>
            <table style="border-collapse:collapse;font-size:14px;">
              ${rows.map(([label, value]) => `
                <tr>
                  <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td>
                  <td style="padding:6px 0;">${escapeHtml(String(value))}</td>
                </tr>`).join("")}
            </table>
            <p style="margin-top:24px;color:#777;font-size:12px;">View the full record in the admin Transfer Requests view.</p>
          </div>
        `;
        const text = ["New prescription transfer request", "", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
        const result = await sendEmail({
          to: emailRecipients,
          subject: `New transfer request — ${contactName}`,
          html,
          text,
          replyTo: email || undefined,
        });
        if (!result.ok) {
          console.error("[TransferRequest] sendEmail failed:", result.error);
        }
      } else {
        console.warn("[TransferRequest] No email recipients configured; skipping email");
      }

      if (smsRecipients.length > 0) {
        const smsBody = `New transfer request (${source === "app" ? "app" : "website"}) from ${contactName} (${phoneNumber}). Pharmacy: ${previousPharmacyName || "—"}. ID #${request.id}.`;
        const smsResult = await sendSms({ to: smsRecipients, body: smsBody });
        if (!smsResult.ok) {
          console.error("[TransferRequest] sendSms failed:", smsResult.error);
        }
      }
    } catch (notifyErr) {
      console.error("[TransferRequest] Notification error:", notifyErr);
    }
  }

  // ==================== Prescription Transfer Request Routes ====================

  // Public: Submit transfer request (no auth required). Prescription-label
  // uploads are intentionally not accepted; keep prescription details in the
  // secure transfer workflow or use click-to-call.
  app.post("/api/transfer-request", async (req: any, res) => {
    try {
      const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
      if (isMultipart || req.file || (Array.isArray(req.files) && req.files.length > 0)) {
        return res.status(415).json({ message: "Prescription-label uploads are not accepted. Use the secure transfer form or call the pharmacy." });
      }

      let transferData: {
        contactName: string;
        phoneNumber: string;
        email?: string | null;
        mode: "form_submission" | "click_to_call";
        previousPharmacyName?: string | null;
        previousPharmacyPhone?: string | null;
        previousPharmacyAddress?: string | null;
        expectedMedCount?: number | null;
      };

      transferData = z.object({
          contactName: z.string().min(1),
          phoneNumber: z.string().min(10),
          email: z.string().email().optional().nullable(),
          mode: z.enum(["form_submission", "click_to_call"]),
          previousPharmacyName: z.string().optional().nullable(),
          previousPharmacyPhone: z.string().optional().nullable(),
          previousPharmacyAddress: z.string().optional().nullable(),
          expectedMedCount: z.number().int().min(0).optional().nullable(),
        }).strict().parse(req.body);

      const wellnessPackEligible = (transferData.expectedMedCount || 0) >= 10;

      const insertPayload: typeof prescriptionTransferRequests.$inferInsert = {
        contactName: transferData.contactName,
        phoneNumber: transferData.phoneNumber,
        email: transferData.email ?? null,
        mode: transferData.mode,
        previousPharmacyName: transferData.previousPharmacyName ?? null,
        previousPharmacyPhone: transferData.previousPharmacyPhone ?? null,
        previousPharmacyAddress: transferData.previousPharmacyAddress ?? null,
        labelImageUrl: null,
        expectedMedCount: transferData.expectedMedCount ?? 0,
        status: "request_received",
        wellnessPackEligible,
        pendingPoints: 500,
      };
      const request = await storage.createTransferRequest(insertPayload);

      // Broadcast real-time update to admin panels
      broadcastUpdate("transfer-requests", { type: "new", data: request });

      // Audit log
      await storage.createAuditLog({
        userId: "system",
        actionType: "create",
        entityType: "user",
        entityId: String(request.id),
        newValue: {
          action: "prescription_transfer_request",
          contactName: transferData.contactName,
          mode: transferData.mode,
          hasLabelImage: false,
          timestamp: new Date().toISOString(),
        },
      });

      // Fire-and-forget notifications via shared helper
      void sendTransferRequestNotifications({
        request,
        contactName: transferData.contactName,
        phoneNumber: transferData.phoneNumber,
        email: transferData.email,
        mode: transferData.mode,
        previousPharmacyName: transferData.previousPharmacyName,
        previousPharmacyPhone: transferData.previousPharmacyPhone,
        expectedMedCount: transferData.expectedMedCount,
        wellnessPackEligible,
        source: "website",
      });

      res.status(201).json({
        success: true,
        message: "Transfer request submitted successfully. We will contact you shortly.",
        requestId: request.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid transfer request data", errors: error.errors });
      }
      console.error("Error submitting transfer request:", error);
      res.status(500).json({ message: "Failed to submit transfer request" });
    }
  });

  // Patient: Get their transfer requests
  app.get("/api/patient/transfer-requests", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requests = await storage.getTransferRequestsByUserId(patientId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching transfer requests:", error);
      res.status(500).json({ message: "Failed to fetch transfer requests" });
    }
  });

  // Patient: Get their flu shot appointments (requires session authentication)
  // Also supports ?ticketNumber= for unauthenticated single-record lookup
  app.get("/api/patient/flu-shots", resolveUser, async (req: any, res) => {
    try {
      const { ticketNumber } = req.query as { ticketNumber?: string };

      // Ticket-number lookup — no auth required, but response is scoped to non-PHI status fields only
      if (ticketNumber) {
        const appointment = await storage.getFluShotAppointmentByTicketNumber(ticketNumber.trim().toUpperCase());
        if (!appointment) {
          return res.status(404).json({ message: "No flu shot appointment found with that ticket number." });
        }
        return res.json([{
          id: appointment.id,
          ticketNumber: appointment.ticketNumber,
          fluShotType: appointment.fluShotType,
          status: appointment.status,
          scheduledDate: appointment.scheduledDate,
          scheduledTime: appointment.scheduledTime,
        }]);
      }

      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      let appointments: import("@shared/schema").FluShotAppointment[] = [];
      appointments = await storage.getFluShotAppointmentsByUserId(patientId);

      // Also merge records linked by the account's email to catch legacy anonymous bookings
      const user = await storage.getUser(patientId);
      if (user?.email) {
        const byEmail = await storage.getFluShotAppointmentsByEmail(user.email);
        const seen = new Set(appointments.map((a) => a.id));
        for (const a of byEmail) {
          if (!seen.has(a.id)) appointments.push(a);
        }
      }

      // Sort newest-first
      appointments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching patient flu shots:", error);
      res.status(500).json({ message: "Failed to fetch flu shot appointments" });
    }
  });

  // Patient: Get their insurance help requests (requires session authentication)
  // Also supports ?ticketNumber= for unauthenticated single-record lookup
  app.get("/api/patient/insurance-requests", resolveUser, async (req: any, res) => {
    try {
      const { ticketNumber } = req.query as { ticketNumber?: string };

      // Ticket-number lookup — no auth required, but response is scoped to non-PHI status fields only
      if (ticketNumber) {
        const request = await storage.getInsuranceAssistanceRequestByTicketNumber(ticketNumber.trim().toUpperCase());
        if (!request) {
          return res.status(404).json({ message: "No insurance help request found with that ticket number." });
        }
        return res.json([{
          id: request.id,
          ticketNumber: request.ticketNumber,
          status: request.status,
        }]);
      }

      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      let requests: import("@shared/schema").InsuranceAssistanceRequest[] = [];
      requests = await storage.getInsuranceAssistanceRequestsByUserId(patientId);

      // Also merge records linked by the account's email to catch legacy anonymous submissions
      const user = await storage.getUser(patientId);
      if (user?.email) {
        const byEmail = await storage.getInsuranceAssistanceRequestsByEmail(user.email);
        const seen = new Set(requests.map((r) => r.id));
        for (const r of byEmail) {
          if (!seen.has(r.id)) requests.push(r);
        }
      }

      // Sort newest-first
      requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(requests);
    } catch (error) {
      console.error("Error fetching patient insurance requests:", error);
      res.status(500).json({ message: "Failed to fetch insurance help requests" });
    }
  });

  // Admin: Get all transfer requests
  app.get("/api/admin/transfer-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getAllTransferRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching transfer requests:", error);
      res.status(500).json({ message: "Failed to fetch transfer requests" });
    }
  });

  // Admin: Update transfer request status
  app.patch("/api/admin/transfer-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const updateData = z.object({
        status: z.enum(["request_received", "processing", "contacting_pharmacy", "transfer_in_progress", "transfer_successful", "transfer_failed", "cancelled"]),
        statusMessage: z.string().optional(),
        notes: z.string().optional(),
        assignedTo: z.string().optional(),
      }).parse(req.body);

      const request = await storage.getTransferRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Transfer request not found" });
      }

      const updated = await storage.updateTransferRequestStatus(id, updateData.status, updateData.statusMessage, updateData.notes);

      // If transfer successful and not yet rewarded, mark reward granted (points stay pending until first fill)
      if (updateData.status === "transfer_successful" && !request.rewardPointsGranted) {
        // Mark reward as granted (but points remain "pending" — released by admin after first fill)
        await storage.markTransferRewardGranted(id);

        if (request.userId) {
          // Send notification that points are pending
          const pendingPts = request.pendingPoints ?? 500;
          await storage.createNotification({
            userId: request.userId,
            type: "system",
            title: "Welcome to Concordia Pharmacy!",
            message: `Thank you for transferring your prescriptions! You've earned ${pendingPts} Wellness Points — they'll unlock after your first fill.`,
            channel: "in_app",
          });
        }
      }

      const adminId = req.user?.claims?.sub || "admin";

      // Audit log
      await storage.createAuditLog({
        userId: adminId,
        actionType: "update",
        entityType: "user",
        entityId: String(id),
        newValue: {
          action: "transfer_request_status_update",
          oldStatus: request.status,
          newStatus: updateData.status,
          timestamp: new Date().toISOString(),
        },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid update data", errors: error.errors });
      }
      console.error("Error updating transfer request:", error);
      res.status(500).json({ message: "Failed to update transfer request" });
    }
  });

  // Admin: Link transfer request to user account
  app.patch("/api/admin/transfer-requests/:id/link-user", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const { userId } = z.object({
        userId: z.string(),
      }).parse(req.body);

      const request = await storage.getTransferRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Transfer request not found" });
      }

      // Update the request status to link user
      const updated = await storage.updateTransferRequestStatus(id, request.status, `Linked to user ${userId}`);

      res.json(updated);
    } catch (error) {
      console.error("Error linking user to transfer request:", error);
      res.status(500).json({ message: "Failed to link user" });
    }
  });

  // Admin: Mark vitamins as included for a wellness-eligible transfer request
  app.post("/api/admin/transfer-requests/:id/mark-vitamins-included", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const request = await storage.getTransferRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Transfer request not found" });
      }

      if (!request.wellnessPackEligible) {
        return res.status(400).json({ message: "This request is not eligible for the Wellness Welcome Pack" });
      }

      await db.update(prescriptionTransferRequests)
        .set({ vitaminsIncluded: true })
        .where(eq(prescriptionTransferRequests.id, id));

      const adminId = req.user?.claims?.sub || "admin";
      await storage.createAuditLog({
        userId: adminId,
        actionType: "update",
        entityType: "user",
        entityId: String(id),
        newValue: {
          action: "transfer_vitamins_included",
          timestamp: new Date().toISOString(),
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking vitamins included:", error);
      res.status(500).json({ message: "Failed to update vitamins status" });
    }
  });

  // Admin: Release pending points for a transfer request (after first fill confirmed)
  app.post("/api/admin/transfer-requests/:id/release-points", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const request = await storage.getTransferRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Transfer request not found" });
      }

      if (!request.rewardPointsGranted) {
        return res.status(400).json({ message: "Transfer must be successful before releasing points" });
      }

      if (!request.userId) {
        return res.status(400).json({ message: "No patient account linked to this transfer request. Link an account before releasing points." });
      }

      const user = await storage.getUser(request.userId);
      if (!user) {
        return res.status(400).json({ message: "Linked patient account not found." });
      }

      if (request.pendingPointsReleased) {
        return res.status(400).json({ message: "Points have already been released for this request" });
      }

      const pendingPts = request.pendingPoints ?? 500;
      const idempotencyKey = `transfer-release-${id}`;

      // Award points first via the wallet engine. The idempotency key prevents
      // double-credit even if this endpoint is called concurrently — the wallet
      // engine rejects duplicate keys and returns null.
      const awarded = await storage.awardPoints({
        userId: request.userId,
        actionType: "prescription_transfer",
        points: pendingPts,
        description: "Wellness Welcome Pack Points — First Fill Confirmed",
        referenceType: "transfer_request",
        referenceId: String(id),
        idempotencyKey,
      });

      if (awarded === null) {
        return res.status(400).json({ message: "Points have already been released for this request" });
      }

      // Mark released only after successful point award
      await db
        .update(prescriptionTransferRequests)
        .set({ pendingPointsReleased: true })
        .where(eq(prescriptionTransferRequests.id, id));

      // Non-critical post-commit side effects (notification + audit)
      try {
        await storage.createNotification({
          userId: request.userId,
          type: "system",
          title: "Your Wellness Points Are Ready!",
          message: `Your ${pendingPts} Wellness Points have been unlocked after your first fill. Enjoy your rewards!`,
          channel: "in_app",
        });
      } catch (notifErr) {
        console.error("Non-critical: failed to send wellness points notification:", notifErr);
      }

      const adminId = req.user?.claims?.sub || "admin";
      await storage.createAuditLog({
        userId: adminId,
        actionType: "update",
        entityType: "user",
        entityId: String(id),
        newValue: {
          action: "transfer_pending_points_released",
          pointsReleased: pendingPts,
          timestamp: new Date().toISOString(),
        },
      });

      broadcastUpdate("transfer-requests", { type: "points_released", id });

      res.json({ success: true, pointsReleased: pendingPts });
    } catch (error: any) {
      if (error?.code === "already_released") {
        return res.status(400).json({ message: "Points have already been released for this request" });
      }
      console.error("Error releasing pending points:", error);
      res.status(500).json({ message: "Failed to release pending points" });
    }
  });

  // Delete transfer request (admin only)
  app.delete("/api/admin/transfer-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const request = await storage.getTransferRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Transfer request not found" });
      }

      await storage.deleteTransferRequest(id);

      // Broadcast to admin clients
      broadcastUpdate("transfer_requests", { type: "deleted", id });

      res.json({ success: true, message: "Transfer request deleted" });
    } catch (error) {
      console.error("Error deleting transfer request:", error);
      res.status(500).json({ message: "Failed to delete transfer request" });
    }
  });

  // ============================================================================
  // URGENT REFILL REQUEST ROUTES (ADMIN)
  // ============================================================================

  // Get all urgent refill requests (admin)
  app.get("/api/admin/urgent-refills", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getAllUrgentRefillRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching urgent refill requests:", error);
      res.status(500).json({ message: "Failed to fetch urgent refill requests" });
    }
  });

  // Get pending urgent refill requests (admin)
  app.get("/api/admin/urgent-refills/pending", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const requests = await storage.getPendingUrgentRefillRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching pending refill requests:", error);
      res.status(500).json({ message: "Failed to fetch pending refill requests" });
    }
  });

  // Update urgent refill request status (admin)
  app.patch("/api/admin/urgent-refills/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().uuid(),
      }).parse(req.params);

      const { status, adminNotes } = z.object({
        status: z.enum(["pending", "processing", "completed", "cancelled"]),
        adminNotes: z.string().optional(),
      }).parse(req.body);

      const adminId = req.session?.adminId || "admin";
      const updated = await storage.updateUrgentRefillRequestStatus(id, status, adminId, adminNotes);

      if (!updated) {
        return res.status(404).json({ message: "Urgent refill request not found" });
      }

      // If status is completed, also update the prescription status
      if (status === "completed") {
        // PrimeRx RxFiled is the sole authority for completed-fill reward eligibility.
      }

      // Broadcast to admin clients
      broadcastUpdate("urgent_refills", { type: "updated", data: updated });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating urgent refill request:", error);
      res.status(500).json({ message: "Failed to update urgent refill request" });
    }
  });

  // ============================================================================
  // HOME ATTENDANT / CAREGIVER ROUTES
  // ============================================================================

  // Create or find existing home attendant during patient registration
  app.post("/api/attendants", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        phoneNumber: z.string().trim().max(30).refine((value) => value.replace(/\D/g, "").length >= 10, "Valid phone number required"),
        email: z.string().trim().email().max(320).optional().nullable(),
        agencyName: z.string().trim().max(200).optional().nullable(),
        licenseNumber: z.string().trim().max(100).optional().nullable(),
        patientId: z.string().optional(), // If provided, link to this patient
        relationshipType: z.string().trim().max(100).optional(),
      });

      const data = schema.parse(req.body);
      const authenticatedPatientId = getPatientId(req);
      if (!authenticatedPatientId) {
        return res.status(401).json({ message: "Patient account required" });
      }
      if (data.patientId && data.patientId !== authenticatedPatientId) {
        return res.status(403).json({ message: "Cannot add a caregiver to another patient" });
      }

      // Check if attendant already exists by phone
      let attendant = await storage.getHomeAttendantByPhone(data.phoneNumber);

      if (!attendant) {
        // Create new attendant
        attendant = await storage.createHomeAttendant({
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          email: data.email || null,
          agencyName: data.agencyName || null,
          licenseNumber: data.licenseNumber || null,
          status: "pending_verification",
        });
      }

      // If patientId provided, link the patient to this attendant
      if (authenticatedPatientId) {
        // Check if patient already has an attendant
        const existingLink = await storage.getPatientAttendant(authenticatedPatientId);
        
        if (existingLink) {
          // Revoke existing link first
          await storage.revokePatientAttendantLink(authenticatedPatientId);
        }

        // Check approval mode setting
        const regApprovalSetting = await storage.getSettingByKey("caregiver_approval_mode");
        const regAutoApprove = regApprovalSetting?.settingValue === "auto";

        // Create new link
        await storage.linkPatientToAttendant({
          attendantId: attendant.id,
          patientId: authenticatedPatientId,
          relationshipType: data.relationshipType || "home_health_aide",
          patientConsent: regAutoApprove,
          consentDate: regAutoApprove ? new Date() : undefined,
          consentMethod: regAutoApprove ? "digital" : undefined,
          addedBy: "patient_registration",
        });
      }

      res.status(201).json(attendant);
    } catch (error: any) {
      console.error("Error creating attendant:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid caregiver information", errors: error.errors });
      }
      if (error.code === "23505") { // Unique constraint violation
        return res.status(409).json({ message: "An attendant with this phone number or email already exists" });
      }
      res.status(500).json({ message: "Failed to create attendant" });
    }
  });

  // Get attendant by phone (for lookup during patient registration)
  app.get("/api/attendants/by-phone/:phone", isAuthenticated, async (req: any, res) => {
    try {
      const phone = req.params.phone;
      const attendant = await storage.getHomeAttendantByPhone(phone);
      
      if (!attendant) {
        return res.status(404).json({ message: "Attendant not found" });
      }

      res.json(attendant);
    } catch (error) {
      console.error("Error finding attendant:", error);
      res.status(500).json({ message: "Failed to find attendant" });
    }
  });

  // Attendant login with phone OTP
  app.post("/api/attendant/request-otp", async (req: any, res) => {
    try {
      const { phoneNumber } = z.object({
        phoneNumber: z.string().min(10),
      }).parse(req.body);

      // Check rate limit
      if (!checkOtpRequestRateLimit(phoneNumber)) {
        return res.status(429).json({ 
          message: "Too many OTP requests. Please wait before trying again." 
        });
      }

      // Check if attendant exists
      const attendant = await storage.getHomeAttendantByPhone(phoneNumber);
      if (!attendant) {
        return res.status(404).json({ message: "No attendant account found with this phone number" });
      }

      // Generate and store OTP (6 digit code)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await storage.createOtpCode(phoneNumber, code, expiresAt);

      // In production, send via SMS (Twilio)

      res.json({ 
        success: true, 
        message: "OTP sent successfully",
        expiresIn: 600 // 10 minutes in seconds
      });
    } catch (error) {
      console.error("Error requesting attendant OTP:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  // Attendant verify OTP and login
  app.post("/api/attendant/verify-otp", async (req: any, res) => {
    try {
      const { phoneNumber, code } = z.object({
        phoneNumber: z.string().min(10),
        code: z.string().length(6),
      }).parse(req.body);

      // Check verify rate limit
      const rateCheck = checkOtpVerifyRateLimit(phoneNumber);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          message: `Too many verification attempts. Account locked for ${rateCheck.lockoutRemaining} seconds.`,
          lockoutRemaining: rateCheck.lockoutRemaining
        });
      }

      // Verify OTP
      const otpRecord = await storage.getValidOtpCode(phoneNumber, code);
      if (!otpRecord) {
        return res.status(401).json({ message: "Invalid or expired OTP" });
      }

      // Mark OTP as verified
      await storage.markOtpVerified(otpRecord.id);

      // Get attendant
      const attendant = await storage.getHomeAttendantByPhone(phoneNumber);
      if (!attendant) {
        return res.status(404).json({ message: "Attendant not found" });
      }

      // Update last login
      await storage.updateAttendantLastLogin(attendant.id);

      // Set session
      req.session.attendantId = attendant.id;
      req.session.isAttendant = true;

      // Get list of patients this attendant manages
      const patients = await storage.getAttendantPatients(attendant.id);

      res.json({
        success: true,
        attendant: {
          id: attendant.id,
          firstName: attendant.firstName,
          lastName: attendant.lastName,
          phoneNumber: attendant.phoneNumber,
          email: attendant.email,
        },
        patients: patients.map(p => ({
          linkId: p.id,
          patientId: p.patientId,
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          relationshipType: p.relationshipType,
        })),
      });
    } catch (error) {
      console.error("Error verifying attendant OTP:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  // Attendant login with username/password
  app.post("/api/attendant/login", async (req: any, res) => {
    try {
      const { username, password } = z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }).parse(req.body);

      const attendant = await storage.getHomeAttendantByUsername(username);
      if (!attendant || !attendant.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, attendant.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Update last login
      await storage.updateAttendantLastLogin(attendant.id);

      // Set session
      req.session.attendantId = attendant.id;
      req.session.isAttendant = true;

      // Get list of patients
      const patients = await storage.getAttendantPatients(attendant.id);

      res.json({
        success: true,
        attendant: {
          id: attendant.id,
          firstName: attendant.firstName,
          lastName: attendant.lastName,
          phoneNumber: attendant.phoneNumber,
          email: attendant.email,
        },
        patients: patients.map(p => ({
          linkId: p.id,
          patientId: p.patientId,
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          relationshipType: p.relationshipType,
        })),
      });
    } catch (error) {
      console.error("Error logging in attendant:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  // Attendant set password (first time or reset)
  app.post("/api/attendant/set-password", async (req: any, res) => {
    try {
      const { phoneNumber, password, username } = z.object({
        phoneNumber: z.string().min(10),
        password: z.string().min(6),
        username: z.string().min(3).optional(),
      }).parse(req.body);

      // Verify the attendant exists
      const attendant = await storage.getHomeAttendantByPhone(phoneNumber);
      if (!attendant) {
        return res.status(404).json({ message: "Attendant not found" });
      }

      // Check if username is already taken (if provided)
      if (username) {
        const existing = await storage.getHomeAttendantByUsername(username);
        if (existing && existing.id !== attendant.id) {
          return res.status(409).json({ message: "Username already taken" });
        }
      }

      // Hash password and update
      const passwordHash = await bcrypt.hash(password, 12);
      
      await storage.updateHomeAttendant(attendant.id, {
        passwordHash,
        username: username || attendant.username,
        status: "active",
      });

      res.json({ success: true, message: "Password set successfully" });
    } catch (error) {
      console.error("Error setting attendant password:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Attendant select patient (set acting context)
  app.post("/api/attendant/select-patient", async (req: any, res) => {
    try {
      if (!req.session?.attendantId) {
        return res.status(401).json({ message: "Not logged in as attendant" });
      }

      const { patientId } = z.object({
        patientId: z.string(),
      }).parse(req.body);

      // Verify the attendant has access to this patient
      const patients = await storage.getAttendantPatients(req.session.attendantId);
      const hasAccess = patients.some(p => p.patientId === patientId);

      if (!hasAccess) {
        return res.status(403).json({ message: "You don't have access to this patient" });
      }

      // Set the acting patient in session
      req.session.actingPatientId = patientId;

      // Log the action
      await storage.createAttendantAuditLog({
        attendantId: req.session.attendantId,
        patientId,
        action: "select_patient",
        resourceType: "session",
        details: { timestamp: new Date().toISOString() },
      });

      res.json({ success: true, message: "Patient selected", patientId });
    } catch (error) {
      console.error("Error selecting patient:", error);
      res.status(500).json({ message: "Failed to select patient" });
    }
  });

  // Get current attendant session info
  app.get("/api/attendant/me", async (req: any, res) => {
    try {
      if (!req.session?.attendantId) {
        return res.status(200).json(null);
      }

      const attendant = await storage.getHomeAttendant(req.session.attendantId);
      if (!attendant) {
        delete req.session.attendantId;
        delete req.session.actingPatientId;
        return res.status(200).json(null);
      }

      const patients = await storage.getAttendantPatients(attendant.id);

      res.json({
        attendant: {
          id: attendant.id,
          firstName: attendant.firstName,
          lastName: attendant.lastName,
          phoneNumber: attendant.phoneNumber,
          email: attendant.email,
          status: attendant.status,
        },
        patients: patients.map(p => ({
          linkId: p.id,
          patientId: p.patientId,
          firstName: p.patient.firstName,
          lastName: p.patient.lastName,
          relationshipType: p.relationshipType,
          canManagePrescriptions: p.canManagePrescriptions,
          canViewMedicalInfo: p.canViewMedicalInfo,
          canRequestRefills: p.canRequestRefills,
          canPlaceOrders: p.canPlaceOrders,
        })),
        actingPatientId: req.session.actingPatientId || null,
      });
    } catch (error) {
      console.error("Error getting attendant info:", error);
      res.status(500).json({ message: "Failed to get attendant info" });
    }
  });

  // Attendant logout
  app.post("/api/attendant/logout", async (req: any, res) => {
    try {
      if (req.session?.attendantId) {
        await storage.createAttendantAuditLog({
          attendantId: req.session.attendantId,
          patientId: req.session.actingPatientId || "none",
          action: "logout",
          resourceType: "session",
        });
      }

      req.session.attendantId = null;
      req.session.isAttendant = false;
      req.session.actingPatientId = null;

      res.json({ success: true });
    } catch (error) {
      console.error("Error logging out attendant:", error);
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  // Patient: Get their home attendant info
  app.get("/api/patient/attendant", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const link = await storage.getPatientAttendant(patientId);
      if (!link) {
        return res.json({ hasAttendant: false });
      }

      res.json({
        hasAttendant: true,
        attendant: {
          id: link.attendant.id,
          firstName: link.attendant.firstName,
          lastName: link.attendant.lastName,
          phoneNumber: link.attendant.phoneNumber,
          email: link.attendant.email,
          agencyName: link.attendant.agencyName,
          username: link.attendant.username, // For display if credentials are set
        },
        relationship: {
          relationshipType: link.relationshipType,
          canManagePrescriptions: link.canManagePrescriptions,
          canViewMedicalInfo: link.canViewMedicalInfo,
          canRequestRefills: link.canRequestRefills,
          canPlaceOrders: link.canPlaceOrders,
          linkedAt: link.createdAt,
        },
      });
    } catch (error) {
      console.error("Error getting patient attendant:", error);
      res.status(500).json({ message: "Failed to get attendant info" });
    }
  });

  // Patient: Link/update their home attendant
  app.post("/api/patient/attendant", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const schema = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phoneNumber: z.string().min(10),
        email: z.string().email().optional().nullable(),
        relationshipType: z.string().optional(),
        agencyName: z.string().optional().nullable(),
        username: z.string().min(4).max(50).optional().nullable(),
        password: z.string().min(6).max(100).optional().nullable(),
      });

      const data = schema.parse(req.body);

      // If username provided, check if it's already taken
      if (data.username) {
        const existingUser = await storage.getHomeAttendantByUsername(data.username);
        if (existingUser) {
          return res.status(400).json({ message: "This username is already taken" });
        }
      }

      // Hash password if provided
      let passwordHash: string | null = null;
      if (data.password) {
        passwordHash = await bcrypt.hash(data.password, 12);
      }

      // Check if attendant exists by phone
      let attendant = await storage.getHomeAttendantByPhone(data.phoneNumber);

      if (!attendant) {
        // Create new attendant with credentials if provided
        attendant = await storage.createHomeAttendant({
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          email: data.email || null,
          agencyName: data.agencyName || null,
          username: data.username || null,
          passwordHash: passwordHash,
          status: data.username && data.password ? "active" : "pending_verification",
        });
      } else if (data.username && data.password) {
        // Update existing attendant with new credentials
        attendant = await storage.updateHomeAttendant(attendant.id, {
          username: data.username,
          passwordHash: passwordHash,
          status: "active",
        }) || attendant;
      }

      // Revoke any existing link
      await storage.revokePatientAttendantLink(patientId);

      // Check approval mode setting
      const approvalSetting = await storage.getSettingByKey("caregiver_approval_mode");
      const isAutoApprove = approvalSetting?.settingValue === "auto";

      // Create new link
      await storage.linkPatientToAttendant({
        attendantId: attendant.id,
        patientId,
        relationshipType: data.relationshipType || "home_health_aide",
        patientConsent: isAutoApprove,
        consentDate: isAutoApprove ? new Date() : undefined,
        consentMethod: isAutoApprove ? "digital" : undefined,
        addedBy: "patient",
      });

      // Audit log for setting credentials
      if (data.username) {
        await logAudit({
          req,
          actionType: "create",
          entityType: "caregiver_credentials",
          entityId: attendant.id.toString(),
          newValue: {
            action: "set_caregiver_credentials_on_create",
            patientId,
            attendantId: attendant.id,
            attendantName: `${data.firstName} ${data.lastName}`,
            username: data.username,
            timestamp: new Date().toISOString(),
          },
        });
      }

      res.json({ 
        success: true, 
        message: data.username 
          ? "Caregiver added with login credentials" 
          : "Home attendant linked successfully",
        hasCredentials: !!data.username,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error linking patient attendant:", error);
      res.status(500).json({ message: "Failed to link attendant" });
    }
  });

  // Patient: Remove their home attendant
  app.delete("/api/patient/attendant", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      await storage.revokePatientAttendantLink(patientId);

      res.json({ success: true, message: "Home attendant removed" });
    } catch (error) {
      console.error("Error removing patient attendant:", error);
      res.status(500).json({ message: "Failed to remove attendant" });
    }
  });

  // Patient: Get audit log of actions taken on their behalf
  app.get("/api/patient/attendant/audit-log", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const logs = await storage.getAttendantAuditLogs({ patientId, limit: 50 });
      
      res.json(logs.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.resourceType,
        details: log.details,
        performedAt: log.createdAt,
        attendantId: log.attendantId,
      })));
    } catch (error) {
      console.error("Error getting patient audit log:", error);
      res.status(500).json({ message: "Failed to get audit log" });
    }
  });

  // Patient: Set login credentials for their caregiver
  app.post("/api/patient/attendant/credentials", async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const schema = z.object({
        username: z.string().min(4, "Username must be at least 4 characters").max(50),
        password: z.string().min(6, "Password must be at least 6 characters").max(100),
      });

      const { username, password } = schema.parse(req.body);

      // Get the patient's caregiver link
      const link = await storage.getPatientAttendant(patientId);
      if (!link) {
        return res.status(404).json({ message: "You don't have a caregiver assigned" });
      }

      // Check if username is already taken by another attendant
      const existingAttendant = await storage.getHomeAttendantByUsername(username);
      if (existingAttendant && existingAttendant.id !== link.attendant.id) {
        return res.status(400).json({ message: "This username is already taken" });
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 12);

      // Update the attendant with credentials
      const updated = await storage.updateHomeAttendant(link.attendant.id, {
        username,
        passwordHash,
        status: "active", // Activate the attendant when credentials are set
      });

      if (!updated) {
        return res.status(500).json({ message: "Failed to set credentials" });
      }

      // Audit log
      await logAudit({
        req,
        actionType: "update",
        entityType: "caregiver_credentials",
        entityId: link.attendant.id.toString(),
        newValue: {
          action: "set_caregiver_credentials",
          patientId,
          attendantId: link.attendant.id,
          attendantName: `${link.attendant.firstName} ${link.attendant.lastName}`,
          username: username,
          timestamp: new Date().toISOString(),
        },
      });

      res.json({ 
        success: true, 
        message: "Caregiver login credentials set successfully",
        hasCredentials: true,
        username: updated.username,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error setting caregiver credentials:", error);
      res.status(500).json({ message: "Failed to set credentials" });
    }
  });

  // Admin: Get all home attendants
  app.get("/api/admin/attendants", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const attendants = await storage.getAllHomeAttendants();
      
      // Get patient count for each attendant
      const attendantsWithPatients = await Promise.all(
        attendants.map(async (attendant) => {
          const patients = await storage.getAttendantPatients(attendant.id);
          return {
            ...attendant,
            patientCount: patients.length,
            patients: patients.map(p => ({
              patientId: p.patientId,
              firstName: p.patient.firstName,
              lastName: p.patient.lastName,
            })),
          };
        })
      );

      res.json(attendantsWithPatients);
    } catch (error) {
      console.error("Error getting attendants:", error);
      res.status(500).json({ message: "Failed to get attendants" });
    }
  });

  // Admin: Update attendant status
  app.patch("/api/admin/attendants/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const schema = z.object({
        status: z.enum(["pending_verification", "active", "suspended", "inactive"]).optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional().nullable(),
        agencyName: z.string().optional().nullable(),
        licenseNumber: z.string().optional().nullable(),
      });

      const updates = schema.parse(req.body);

      const updated = await storage.updateHomeAttendant(id, updates);
      if (!updated) {
        return res.status(404).json({ message: "Attendant not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating attendant:", error);
      res.status(500).json({ message: "Failed to update attendant" });
    }
  });

  // Admin: Get attendant audit logs
  app.get("/api/admin/attendant-audit-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { attendantId, patientId, limit } = req.query;
      
      const logs = await storage.getAttendantAuditLogs({
        attendantId: attendantId ? parseInt(attendantId) : undefined,
        patientId: patientId || undefined,
        limit: limit ? parseInt(limit) : 100,
      });

      res.json(logs);
    } catch (error) {
      console.error("Error getting audit logs:", error);
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // =====================================================
  // CAREGIVER APPROVAL REQUESTS
  // =====================================================

  app.get("/api/admin/caregiver-requests", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const pendingLinks = await storage.getPendingCaregiverLinks();

      const requests = pendingLinks.map((link) => ({
        id: link.id,
        attendantId: link.attendantId,
        patientId: link.patientId,
        attendantName: `${link.attendant.firstName} ${link.attendant.lastName}`,
        attendantPhone: link.attendant.phoneNumber,
        attendantStatus: link.attendant.status,
        patientName: `${link.patient.firstName || ""} ${link.patient.lastName || ""}`.trim(),
        patientDob: link.patient.dateOfBirth,
        patientConsent: link.patientConsent,
        relationshipType: link.relationshipType,
        isActive: link.isActive,
        requestDate: link.createdAt,
      }));

      res.json(requests);
    } catch (error) {
      console.error("Error getting caregiver requests:", error);
      res.status(500).json({ message: "Failed to get caregiver requests" });
    }
  });

  app.post("/api/admin/caregiver-requests/:id/approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const link = await db.select().from(patientAttendants).where(eq(patientAttendants.id, id));
      if (!link.length) {
        return res.status(404).json({ message: "Caregiver link not found" });
      }

      const updatedLink = await storage.updatePatientAttendantLink(id, {
        isActive: true,
        patientConsent: true,
        consentDate: new Date(),
      });

      const attendant = await storage.getHomeAttendant(link[0].attendantId);
      if (attendant && attendant.status === "pending_verification") {
        await storage.updateHomeAttendant(attendant.id, { status: "active" });
      }

      await storage.createAttendantAuditLog({
        attendantId: link[0].attendantId,
        patientId: link[0].patientId,
        action: "admin_approved",
        resourceType: "caregiver_link",
        resourceId: String(id),
        details: { approvedBy: "admin" },
      });

      res.json({ success: true, link: updatedLink });
    } catch (error) {
      console.error("Error approving caregiver request:", error);
      res.status(500).json({ message: "Failed to approve caregiver request" });
    }
  });

  app.post("/api/admin/caregiver-requests/:id/deny", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const link = await db.select().from(patientAttendants).where(eq(patientAttendants.id, id));
      if (!link.length) {
        return res.status(404).json({ message: "Caregiver link not found" });
      }

      await storage.updatePatientAttendantLink(id, {
        isActive: false,
        revokedAt: new Date(),
      });

      await storage.createAttendantAuditLog({
        attendantId: link[0].attendantId,
        patientId: link[0].patientId,
        action: "admin_denied",
        resourceType: "caregiver_link",
        resourceId: String(id),
        details: { deniedBy: "admin" },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error denying caregiver request:", error);
      res.status(500).json({ message: "Failed to deny caregiver request" });
    }
  });

  // =====================================================
  // ADMIN SETTINGS (points_settings table)
  // =====================================================

  app.get("/api/admin/settings", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error getting settings:", error);
      res.status(500).json({ message: "Failed to get settings" });
    }
  });

  app.patch("/api/admin/settings/:key", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { key } = req.params;
      const { value } = z.object({
        value: z.string(),
      }).parse(req.body);

      const setting = await storage.upsertSetting(key, value, undefined, "admin");
      res.json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating setting:", error);
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // =====================================================
  // STAFF AUTHENTICATION (Email-based OTP)
  // =====================================================

  // Staff auth — all legacy email-OTP routes replaced by Clerk
  app.post("/api/staff/auth/request-otp", async (_req, res) => { return res.status(410).json({ message: "Gone: replaced by Clerk authentication." }); });
  app.post("/api/staff/auth/verify-otp", async (_req, res) => { return res.status(410).json({ message: "Gone: replaced by Clerk authentication." }); });
  app.get("/api/staff/auth/session", async (_req, res) => { return res.status(410).json({ message: "Gone: replaced by Clerk authentication." }); });
  app.post("/api/staff/auth/logout", async (_req, res) => { return res.status(410).json({ message: "Gone: replaced by Clerk authentication." }); });

  // Staff/tablet route guard — accepts Clerk JWT (role=staff|admin) OR X-STAFF-KEY header fallback
  const requireStaffKey = async (req: any, res: any, next: () => void) => {
    try {
      // 1. Try Clerk JWT first
      const { userId, sessionClaims } = getAuth(req);
      if (userId) {
        const role = (sessionClaims as any)?.metadata?.role as string | undefined;
        if (role === "staff" || role === "admin") {
          return next();
        }
      }
    } catch {
      // fall through to API key check
    }

    // 2. Fall back to X-STAFF-KEY header (tablet app / ConcordiaCare integration)
    const providedKey =
      (req.headers["x-staff-key"] as string | undefined) ||
      (req.headers["authorization"] as string | undefined)?.replace(/^Bearer\s+/i, "");
    const validKey = process.env.STAFF_API_KEY;
    if (validKey && providedKey === validKey) {
      return next();
    }

    return res.status(401).json({ message: "Staff authentication required" });
  };

  // ----- Admin: Notification recipients & settings -----
  app.get("/api/admin/notification-recipients", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const recipients = await storage.getNotificationRecipients(type);
      res.json(recipients);
    } catch (error) {
      console.error("Error fetching notification recipients:", error);
      res.status(500).json({ message: "Failed to fetch recipients" });
    }
  });

  const recipientSchema = z.object({
    notificationType: z.string().trim().min(1).max(64).default("doctor_intro_request"),
    channel: z.enum(["email", "sms"]).default("email"),
    label: z.string().trim().max(120).optional().or(z.literal("")),
    address: z.string().trim().min(1).max(200),
    isActive: z.boolean().default(true),
  });

  app.post("/api/admin/notification-recipients", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const data = recipientSchema.parse(req.body);
      if (data.channel === "email") {
        const result = z.string().email().safeParse(data.address);
        if (!result.success) return res.status(400).json({ message: "Invalid email address" });
      }
      const recipient = await storage.createNotificationRecipient({
        notificationType: data.notificationType,
        channel: data.channel,
        label: data.label || null,
        address: data.address,
        isActive: data.isActive,
      });
      res.status(201).json(recipient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating notification recipient:", error);
      res.status(500).json({ message: "Failed to create recipient" });
    }
  });

  app.patch("/api/admin/notification-recipients/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const updates = recipientSchema.partial().parse(req.body);
      if (updates.channel === "email" && updates.address) {
        const result = z.string().email().safeParse(updates.address);
        if (!result.success) return res.status(400).json({ message: "Invalid email address" });
      }
      const updated = await storage.updateNotificationRecipient(id, {
        ...updates,
        label: updates.label === "" ? null : updates.label,
      } as any);
      if (!updated) return res.status(404).json({ message: "Recipient not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating notification recipient:", error);
      res.status(500).json({ message: "Failed to update recipient" });
    }
  });

  app.delete("/api/admin/notification-recipients/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await storage.deleteNotificationRecipient(id);
      if (!ok) return res.status(404).json({ message: "Recipient not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting notification recipient:", error);
      res.status(500).json({ message: "Failed to delete recipient" });
    }
  });

  app.get("/api/admin/notification-settings/:key", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const setting = await storage.getNotificationSetting(req.params.key);
      res.json(setting ?? null);
    } catch (error) {
      console.error("Error fetching notification setting:", error);
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  app.put("/api/admin/notification-settings/:key", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const schema = z.object({ value: z.string().max(500) });
      const { value } = schema.parse(req.body);
      const setting = await storage.setNotificationSetting(req.params.key, value);
      res.json(setting);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error saving notification setting:", error);
      res.status(500).json({ message: "Failed to save setting" });
    }
  });

  // Email template settings for the patient confirmation email
  const EMAIL_TEMPLATE_KEYS = {
    responseTime: "patient_confirm_email_response_time",
    footerNote: "patient_confirm_email_footer_note",
    subject: "patient_confirm_email_subject",
    greeting: "patient_confirm_email_greeting",
  } as const;

  const EMAIL_TEMPLATE_DEFAULTS = {
    responseTime: "24 business hours",
    footerNote: "This is an automated confirmation from ConcordiaCare. Please do not reply to this email.",
    subject: "Your ConcordiaCare doctor request was received",
    greeting: "Hi",
  };

  app.get("/api/admin/email-template", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const [responseTimeSetting, footerNoteSetting, subjectSetting, greetingSetting] = await Promise.all([
        storage.getNotificationSetting(EMAIL_TEMPLATE_KEYS.responseTime),
        storage.getNotificationSetting(EMAIL_TEMPLATE_KEYS.footerNote),
        storage.getNotificationSetting(EMAIL_TEMPLATE_KEYS.subject),
        storage.getNotificationSetting(EMAIL_TEMPLATE_KEYS.greeting),
      ]);
      res.json({
        responseTime: responseTimeSetting?.settingValue ?? EMAIL_TEMPLATE_DEFAULTS.responseTime,
        footerNote: footerNoteSetting?.settingValue ?? EMAIL_TEMPLATE_DEFAULTS.footerNote,
        subject: subjectSetting?.settingValue ?? EMAIL_TEMPLATE_DEFAULTS.subject,
        greeting: greetingSetting?.settingValue ?? EMAIL_TEMPLATE_DEFAULTS.greeting,
      });
    } catch (error) {
      console.error("Error fetching email template:", error);
      res.status(500).json({ message: "Failed to fetch email template" });
    }
  });

  app.put("/api/admin/email-template", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const schema = z.object({
        responseTime: z.string().min(1).max(200),
        footerNote: z.string().min(1).max(500),
        subject: z.string().min(1).max(200),
        greeting: z.string().trim().min(1).max(50),
      });
      const { responseTime, footerNote, subject, greeting } = schema.parse(req.body);
      await Promise.all([
        storage.setNotificationSetting(EMAIL_TEMPLATE_KEYS.responseTime, responseTime),
        storage.setNotificationSetting(EMAIL_TEMPLATE_KEYS.footerNote, footerNote),
        storage.setNotificationSetting(EMAIL_TEMPLATE_KEYS.subject, subject),
        storage.setNotificationSetting(EMAIL_TEMPLATE_KEYS.greeting, greeting),
      ]);
      res.json({ responseTime, footerNote, subject, greeting });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error saving email template:", error);
      res.status(500).json({ message: "Failed to save email template" });
    }
  });

  app.post("/api/admin/email-template/test", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const schema = z.object({
        recipient: z.string().email(),
        subject: z.string().min(1).max(200),
        responseTime: z.string().min(1).max(200),
        footerNote: z.string().min(1).max(500),
        greeting: z.string().trim().min(1).max(50).optional().default("Hi"),
      });
      const { recipient, subject, responseTime, footerNote, greeting } = schema.parse(req.body);

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
          <div style="background:#1a6b5c;padding:24px 32px;border-radius:8px 8px 0 0;">
            <h1 style="color:#fff;margin:0;font-size:22px;">Your Doctor Request Was Received</h1>
          </div>
          <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none;">
            <p style="margin-top:0;">${escapeHtml(greeting)} Jane,</p>
            <p>Thank you for submitting your doctor introduction request through ConcordiaCare. We have received your information and our team will be in touch within <strong>${escapeHtml(responseTime)}</strong>.</p>
            <h2 style="font-size:16px;margin-bottom:8px;color:#1a6b5c;">Your Request Summary</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;width:40%;">Doctor</td>
                <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">Dr. Sarah Chen</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Specialty</td>
                <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">Family Medicine</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;">Location</td>
                <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">Brooklyn</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Preferred Schedule</td>
                <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">Morning · Monday, Wednesday</td>
              </tr>
            </table>
            <p style="margin-top:24px;">If you have any questions, please don't hesitate to contact us.</p>
            <p style="margin-bottom:0;color:#777;font-size:12px;">${escapeHtml(footerNote)}</p>
          </div>
        </div>
      `;

      const textBody = `${greeting} Jane,\n\nThank you for submitting your doctor introduction request through ConcordiaCare. We have received your information and our team will be in touch within ${responseTime}.\n\nYour Request Summary:\n- Doctor: Dr. Sarah Chen\n- Specialty: Family Medicine\n- Location: Brooklyn\n- Preferred Schedule: Morning · Monday, Wednesday\n\nIf you have any questions, please don't hesitate to contact us.\n\n${footerNote}`;

      const result = await sendEmail({
        to: recipient,
        subject: `[TEST] ${subject}`,
        html: htmlBody,
        text: textBody,
      });

      if (!result.ok) {
        return res.status(500).json({ message: result.error ?? "Failed to send test email" });
      }

      const sentByEmail: string | undefined =
        (req.session as any)?.staffEmail ||
        (req as any).user?.claims?.email ||
        undefined;

      await storage.appendTestEmailLog({ recipient, sentByEmail: sentByEmail ?? null });

      // Prune old records non-fatally — history is already recorded above
      storage.pruneOldTestEmailLogs(30).catch((err) =>
        console.warn("Failed to prune old test email logs:", err)
      );

      res.json({ message: "Test email sent successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email" });
    }
  });

  app.delete("/api/admin/email-template/test-logs", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      await storage.clearAllTestEmailLogs();
      res.status(204).end();
    } catch (error) {
      console.error("Error clearing test email logs:", error);
      res.status(500).json({ message: "Failed to clear test email logs" });
    }
  });

  app.delete("/api/admin/email-template/test-logs/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid log id" });
      }
      await storage.deleteTestEmailLog(id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting test email log:", error);
      res.status(500).json({ message: "Failed to delete test email log" });
    }
  });

  app.get("/api/admin/email-template/test-logs", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      // Prune stale records before reading to enforce strict 30-day retention
      storage.pruneOldTestEmailLogs(30).catch((err) =>
        console.warn("Failed to prune old test email logs on read:", err)
      );
      const logs = await storage.getTestEmailLogs(10);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching test email logs:", error);
      res.status(500).json({ message: "Failed to fetch test email logs" });
    }
  });

  app.get("/api/admin/doctor-match-leads", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const leads = await storage.getDoctorMatchLeads();
      res.json(leads);
    } catch (error) {
      console.error("Error fetching match leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // ===== ADMIN: Patient structured conditions (Care Navigator) =====

  app.get("/api/admin/patients/:id/conditions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const conditions = await storage.getPatientConditions(req.params.id);
      // HIPAA audit log — admin reading a patient's condition list (PHI access)
      const adminUser = req.user as any;
      await storage.createAuditLog({
        userId: adminUser?.id ?? null,
        actionType: "view",
        entityType: "patient_condition",
        entityId: req.params.id,
        newValue: { subAction: "admin_conditions_list", patientId: req.params.id, count: conditions.length, source: "admin_dashboard" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(conditions);
    } catch (error) {
      console.error("[Admin] Error fetching patient conditions:", error);
      res.status(500).json({ message: "Failed to fetch patient conditions" });
    }
  });

  // ===== EXTERNAL API: Care Navigator (ConcordiaCare mobile app) =====

  // List conditions for a patient
  app.get("/api/external/care-navigator/patients/:userId/conditions", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const conditions = await storage.getPatientConditions(user.id);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: user.id,
        newValue: { subAction: "list", count: conditions.length, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(conditions);
    } catch (error) {
      console.error("[External] Error fetching conditions:", error);
      res.status(500).json({ message: "Failed to fetch conditions" });
    }
  });

  // Create a condition
  app.post("/api/external/care-navigator/patients/:userId/conditions", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const parsed = insertPatientConditionSchema.parse({ ...req.body, userId: user.id });
      const condition = await storage.createPatientCondition(parsed);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "create",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { conditionName: condition.conditionName, icd10Code: condition.icd10Code, status: condition.status, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.status(201).json(condition);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0].message });
      console.error("[External] Error creating condition:", error);
      res.status(500).json({ message: "Failed to create condition" });
    }
  });

  // Update a condition
  app.patch("/api/external/care-navigator/patients/:userId/conditions/:conditionId", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const existing = await storage.getPatientCondition(req.params.conditionId);
      if (!existing || existing.userId !== user.id) return res.status(404).json({ message: "Condition not found" });
      // Whitelist mutable fields — explicitly strip userId to prevent cross-patient reassignment (IDOR)
      const MUTABLE_CONDITION_FIELDS = insertPatientConditionSchema.pick({
        conditionName: true,
        icd10Code: true,
        diagnosedAt: true,
        notes: true,
        status: true,
      }).partial();
      const updates = MUTABLE_CONDITION_FIELDS.parse(req.body);
      const updated = await storage.updatePatientCondition(req.params.conditionId, updates);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "update",
        entityType: "patient_condition",
        entityId: req.params.conditionId,
        oldValue: { conditionName: existing.conditionName, status: existing.status },
        newValue: { ...updates, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0].message });
      console.error("[External] Error updating condition:", error);
      res.status(500).json({ message: "Failed to update condition" });
    }
  });

  // Delete a condition
  app.delete("/api/external/care-navigator/patients/:userId/conditions/:conditionId", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const existing = await storage.getPatientCondition(req.params.conditionId);
      if (!existing || existing.userId !== user.id) return res.status(404).json({ message: "Condition not found" });
      await storage.deletePatientCondition(req.params.conditionId);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "delete",
        entityType: "patient_condition",
        entityId: req.params.conditionId,
        oldValue: { conditionName: existing.conditionName, icd10Code: existing.icd10Code, status: existing.status },
        newValue: { source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.status(204).end();
    } catch (error) {
      console.error("[External] Error deleting condition:", error);
      res.status(500).json({ message: "Failed to delete condition" });
    }
  });

  // List journal entries
  app.get("/api/external/care-navigator/patients/:userId/journal", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const limit = Math.min(parseInt(req.query.limit as string) || 30, 90);
      const offset = parseInt(req.query.offset as string) || 0;
      const conditionId = req.query.conditionId as string | undefined;
      const entries = await storage.getHealthJournalEntries(user.id, { conditionId, limit, offset });
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "health_journal_entry",
        entityId: user.id,
        newValue: { subAction: "list", count: entries.length, conditionId: conditionId ?? null, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json({ entries, limit, offset, count: entries.length });
    } catch (error) {
      console.error("[External] Error fetching journal:", error);
      res.status(500).json({ message: "Failed to fetch journal entries" });
    }
  });

  // Create journal entry
  app.post("/api/external/care-navigator/patients/:userId/journal", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const parsed = insertHealthJournalEntrySchema.parse({ ...req.body, userId: user.id });
      const entry = await storage.createHealthJournalEntry(parsed);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "create",
        entityType: "health_journal_entry",
        entityId: entry.id,
        newValue: { conditionId: entry.conditionId ?? null, entryDate: entry.entryDate, symptomSeverity: entry.symptomSeverity, mood: entry.mood, energyLevel: entry.energyLevel, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.status(201).json(entry);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0].message });
      console.error("[External] Error creating journal entry:", error);
      res.status(500).json({ message: "Failed to create journal entry" });
    }
  });

  // AI condition explainer (cached)
  app.get("/api/external/care-navigator/patients/:userId/conditions/:conditionId/explain", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const condition = await storage.getPatientCondition(req.params.conditionId);
      if (!condition || condition.userId !== user.id) return res.status(404).json({ message: "Condition not found" });

      const explainer = await getConditionExplainer(condition.conditionName, condition.icd10Code);

      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { subAction: "explainer_accessed", conditionName: condition.conditionName, aiGenerated: true, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        conditionId: condition.id,
        conditionName: condition.conditionName,
        icd10Code: condition.icd10Code,
        explainer,
        disclaimer: "This content is AI-generated for educational purposes only and is not medical advice. Always consult your doctor or pharmacist before making any health decisions.",
      });
    } catch (error) {
      console.error("[External] Error generating explainer:", error);
      res.status(500).json({ message: "Failed to generate condition explainer" });
    }
  });

  // Prescriptions linked to a condition (by name matching)
  app.get("/api/external/care-navigator/patients/:userId/conditions/:conditionId/prescriptions", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const condition = await storage.getPatientCondition(req.params.conditionId);
      if (!condition || condition.userId !== user.id) return res.status(404).json({ message: "Condition not found" });

      const allRx = await storage.getPrescriptionsByUserId(user.id);
      const { linked, unlinked } = matchPrescriptionsToCondition(
        condition.conditionName,
        condition.icd10Code,
        allRx
      );

      // HIPAA audit log — reading linked prescription list for a condition
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { subAction: "linked_prescriptions_read", linkedCount: linked.length, unlinkedCount: unlinked.length, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        conditionId: condition.id,
        conditionName: condition.conditionName,
        icd10Code: condition.icd10Code,
        linked,
        unlinked,
        matchNote: "Linked prescriptions are automatically matched from pharmacy records using medication class and condition keywords. Always confirm with your prescriber.",
      });
    } catch (error) {
      console.error("[External] Error fetching linked prescriptions:", error);
      res.status(500).json({ message: "Failed to fetch linked prescriptions" });
    }
  });

  // Next steps / platform CTAs for a condition
  app.get("/api/external/care-navigator/patients/:userId/conditions/:conditionId/next-steps", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const condition = await storage.getPatientCondition(req.params.conditionId);
      if (!condition || condition.userId !== user.id) return res.status(404).json({ message: "Condition not found" });

      // HIPAA audit log — reading care navigation CTAs for a condition
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { subAction: "next_steps_read", conditionName: condition.conditionName, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      const steps = getNextSteps(condition.conditionName);
      res.json({
        conditionId: condition.id,
        conditionName: condition.conditionName,
        nextSteps: steps,
      });
    } catch (error) {
      console.error("[External] Error fetching next steps:", error);
      res.status(500).json({ message: "Failed to fetch next steps" });
    }
  });

  app.get("/api/staff/orders", requireStaffKey, async (req: any, res) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const allOrders = await storage.getAllOrders();
      let filtered = statusFilter ? allOrders.filter((o: any) => o.status === statusFilter) : allOrders;
      filtered = [...filtered].sort((a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      res.json(filtered.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        type: o.type,
        status: o.status,
        paymentStatus: o.paymentStatus ?? null,
        deliveryMethod: o.deliveryMethod ?? null,
        total: o.total,
        items: (o.orderItems || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          productId: item.productId ?? null,
        })),
        customer: {
          name: o.customerName || o.guestName || null,
          phone: o.customerPhone || o.guestPhone || null,
        },
        createdAt: o.createdAt,
      })));
    } catch (error) {
      console.error("Staff: error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Staff: Look up a single order by order number
  app.get("/api/staff/orders/by-number/:orderNumber", requireStaffKey, async (req: any, res) => {
    try {
      const o = await storage.getOrderByOrderNumberWithItems(req.params.orderNumber.toUpperCase());
      if (!o) return res.status(404).json({ found: false, message: "Order not found" });
      res.json({
        id: o.id,
        orderNumber: o.orderNumber,
        type: o.type,
        status: o.status,
        paymentStatus: (o as any).paymentStatus ?? null,
        deliveryMethod: o.deliveryMethod ?? null,
        total: o.total,
        items: (o.orderItems || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          productId: item.productId ?? null,
        })),
        customer: {
          name: o.customerName || null,
          phone: o.customerPhone || null,
        },
        createdAt: o.createdAt,
      });
    } catch (error) {
      console.error("Staff: error fetching order by number:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Staff: Advance order fulfillment status
  async function relayStaffStatusToCare(order: { id: string; userId: string | null; status: string }) {
    if (!order.userId) return;
    const patient = await storage.getUser(order.userId);
    if (!patient?.concordiaCareUserId) return;
    await pushOrderStatusToApp({
      orderId: order.id,
      deliveryStatus: order.status,
      authoritative: false,
      concordiaCareUserId: patient.concordiaCareUserId,
    });
  }

  async function applyStaffFulfillmentStatus(
    findOrder: () => Promise<Awaited<ReturnType<typeof storage.getOrderByOrderNumber>>>,
    status: import("./staff-order-status").StaffFulfillmentStatus,
  ): Promise<
    | { kind: "updated"; order: NonNullable<Awaited<ReturnType<typeof storage.getOrderByOrderNumber>>> }
    | { kind: "duplicate"; order: NonNullable<Awaited<ReturnType<typeof storage.getOrderByOrderNumber>>> }
    | { kind: "missing" }
    | { kind: "conflict" }
  > {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await findOrder();
      if (!current || (current.source !== "website" && current.source !== "app") || current.type !== "otc") {
        return { kind: "missing" };
      }
      const decision = checkStaffStatusTransition(current.status, status, current.deliveryMethod);
      if (decision === "duplicate") return { kind: "duplicate", order: current };
      if (decision === "conflict") return { kind: "conflict" };
      const [updated] = await db.update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(ordersTable.id, current.id), eq(ordersTable.status, current.status)))
        .returning();
      if (updated) return { kind: "updated", order: updated };
    }
    return { kind: "conflict" };
  }

  app.patch("/api/staff/orders/:id/status", requireStaffKey, async (req: any, res) => {
    try {
      const { id } = req.params;
      const schema = z.object({
        status: z.enum([
          "preparing", "ready_for_pickup", "sent_for_delivery", "delivered", "picked_up",
        ]),
      });
      const { status } = schema.parse(req.body);
      const result = await applyStaffFulfillmentStatus(
        async () => storage.getOrder(id), status,
      );
      if (result.kind === "missing") return res.status(404).json({ message: "OTC order not found" });
      if (result.kind === "conflict") return res.status(409).json({ message: "Status conflicts with order fulfillment state" });
      if (result.kind === "duplicate") return res.json(result.order);
      broadcastUpdate("orders", { type: "order_updated", orderId: id, status });
      void relayStaffStatusToCare(result.order).catch((error) =>
        console.error("[Staff Order Status] ConcordiaCare relay failed:", error));
      await logAudit({
        req,
        actionType: "update",
        entityType: "order",
        entityId: id,
        newValue: { status, updatedBy: req.session?.staffEmail ?? "api-key" },
      });
      res.json(result.order);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      console.error("Staff: error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Separate staff-app callback. Only the shared server key can report
  // fulfillment; a Clerk browser session alone is not enough. Callbacks are
  // idempotent by state and compare-and-set prevents stale concurrent events
  // from overwriting a newer order status.
  app.post("/api/external/staff/orders/status", async (req: any, res) => {
    const expectedKey = process.env.STAFF_API_KEY;
    const providedKey = req.get("X-API-KEY") || "";
    if (!expectedKey) return res.status(503).json({ message: "Staff integration is unavailable" });
    if (Buffer.byteLength(providedKey) !== Buffer.byteLength(expectedKey) ||
        !timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey))) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const parsed = z.object({
      orderNumber: z.string().trim().min(1).max(100),
      status: z.enum(["preparing", "ready_for_pickup", "sent_for_delivery", "delivered", "picked_up"]),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid staff order status" });

    try {
      const { orderNumber, status } = parsed.data;
      const result = await applyStaffFulfillmentStatus(
        () => storage.getOrderByOrderNumber(orderNumber), status,
      );
      if (result.kind === "missing") return res.status(404).json({ message: "OTC order not found" });
      if (result.kind === "conflict") return res.status(409).json({ message: "Status conflicts with order fulfillment state" });
      if (result.kind === "duplicate") return res.json({ ok: true, changed: false, orderNumber: result.order.orderNumber });
      broadcastUpdate("orders", { type: "order_updated", orderId: result.order.id, status });
      await logAudit({
        req, actionType: "update", entityType: "order", entityId: result.order.id,
        newValue: { status, source: "staff-app" },
      });
      void relayStaffStatusToCare(result.order).catch((error) =>
        console.error("[Staff Order Status] ConcordiaCare relay failed:", error));
      return res.json({ ok: true, changed: true, orderNumber: result.order.orderNumber });
    } catch (error) {
      console.error("[Staff Order Status] Callback failed:", error);
      return res.status(500).json({ message: "Failed to update staff order status" });
    }
  });

  // Staff: Full product catalog for inventory management
  app.get("/api/staff/products", requireStaffKey, async (_req, res) => {
    try {
      const allProducts = await storage.getAllProducts();
      res.json(allProducts.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        stockQuantity: p.stockQuantity,
        inStock: p.inStock,
        ndc: p.ndc ?? null,
        externalId: p.externalId ?? null,
        showOnWebsite: p.showOnWebsite ?? true,
        showInApp: p.showInApp ?? true,
      })));
    } catch (error) {
      console.error("Staff: error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Staff: Search products by name / NDC / id
  app.get("/api/staff/products/search", requireStaffKey, async (req: any, res) => {
    try {
      const q = String(req.query.q || "").trim().toLowerCase();
      if (!q) return res.json([]);
      const prods = await storage.getAllProducts();
      const matches = prods.filter((p: any) =>
        p.name.toLowerCase().includes(q) ||
        (p.ndc && p.ndc.toLowerCase().includes(q)) ||
        p.id.toLowerCase() === q ||
        (p.externalId && String(p.externalId).toLowerCase().includes(q))
      );
      matches.sort((a: any, b: any) => {
        const aExact = a.id.toLowerCase() === q || String(a.externalId ?? "").toLowerCase() === q;
        const bExact = b.id.toLowerCase() === q || String(b.externalId ?? "").toLowerCase() === q;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.name.toLowerCase().startsWith(q) ? -1 : b.name.toLowerCase().startsWith(q) ? 1 : 0;
      });
      res.json(matches.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        stockQuantity: p.stockQuantity,
        inStock: p.inStock,
        ndc: p.ndc ?? null,
        externalId: p.externalId ?? null,
        showOnWebsite: p.showOnWebsite ?? true,
        showInApp: p.showInApp ?? true,
      })));
    } catch (error) {
      console.error("Staff: error searching products:", error);
      res.status(500).json({ message: "Failed to search products" });
    }
  });

  // Staff: Atomic stock delta adjustment (positive = add, negative = remove, clamped at 0)
  app.patch("/api/staff/products/:id/stock", requireStaffKey, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { delta } = z.object({ delta: z.number().int() }).parse(req.body);
      // Fetch current state before update to detect false→true inStock transitions
      const prevProduct = await storage.getProduct(id).catch(() => null);
      const [updated] = await db
        .update(productsTable)
        .set({
          stockQuantity: sql`GREATEST(0, stock_quantity + ${delta})`,
          inStock: sql`GREATEST(0, stock_quantity + ${delta}) > 0`,
          updatedAt: new Date(),
        })
        .where(eq(productsTable.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Product not found" });
      await logAudit({
        req,
        actionType: "update",
        entityType: "product",
        entityId: id,
        newValue: { delta, updatedBy: req.session?.staffEmail ?? "api-key" },
      });
      notifyProductChanged("sync", updated).catch(() => {});
      // Fire restock notifications only on a false→true inStock transition
      if (updated.inStock && prevProduct && !prevProduct.inStock) {
        fireRestockNotifications(updated.id, updated.category, updated.name).catch(() => {});
      }
      broadcastPublicSSE("product_updated", {
        id: updated.id,
        name: updated.name,
        price: updated.price,
        stockQuantity: updated.stockQuantity,
        inStock: updated.inStock,
        category: updated.category,
      });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      console.error("Staff: error adjusting stock:", error);
      res.status(500).json({ message: "Failed to adjust stock" });
    }
  });

  // Fire-and-forget: send restock alerts when a product goes back in stock
  async function fireRestockNotifications(productId: string, category: string | null | undefined, productName: string): Promise<void> {
    try {
      const pending = await storage.getPendingRestockNotificationsByTarget(category ?? undefined, productId);
      if (pending.length === 0) return;
      let sentCount = 0;
      for (const notif of pending) {
        let delivered = false;
        if (notif.email) {
          const emailResult = await sendEmail({
            to: notif.email,
            subject: `Back in stock: ${productName}`,
            html: `<p>Hi${notif.name ? ` ${htmlEscape(notif.name)}` : ""},</p><p>Great news — <strong>${htmlEscape(productName)}</strong> is back in stock at Concordia Pharmacy!</p><p><a href="https://concordianyc.com/shop">Shop now</a> or call us at (718) 328-2833.</p><p style="color:#888;font-size:12px;">You received this because you signed up for a back-in-stock notification. Reply STOP to unsubscribe.</p>`,
          }).catch((e) => { console.error("[RestockNotify] email error:", e); return { ok: false } as { ok: boolean }; });
          if (emailResult.ok) delivered = true;
        }
        if (notif.phone) {
          const smsResult = await sendSms({
            to: [notif.phone],
            body: `Concordia Pharmacy: ${productName} is back in stock! Shop at concordianyc.com/shop or call (718) 328-2833. Reply STOP to opt out.`,
          }).catch((e) => { console.error("[RestockNotify] sms error:", e); return { ok: false } as { ok: boolean }; });
          if (smsResult.ok) delivered = true;
        }
        if (delivered) {
          await storage.markRestockNotificationSent(notif.id).catch((e) => console.error("[RestockNotify] markSent error:", e));
          sentCount++;
        } else {
          console.warn(`[RestockNotify] Delivery failed for notification id=${notif.id} — keeping as pending for retry`);
        }
      }
      console.log(`[RestockNotify] Fired ${sentCount}/${pending.length} notification(s) for product ${productId} (${productName})`);
    } catch (err) {
      console.error("[RestockNotify] fireRestockNotifications error:", err);
    }
  }

  // Fire-and-forget: push a product change to the concordianyc.com website.
  // action = "sync" for add/update, "hide" for delete or hidden.
  async function notifyProductChanged(
    action: "sync" | "hide",
    product: { id: string; externalId?: string | null; name?: string; price?: string | null; stockQuantity?: number; inStock?: boolean; category?: string | null; imageUrl?: string | null }
  ): Promise<void> {
    const rawUrl = process.env.CONCORDIA_WEBSITE_URL || "https://concordianyc.com";
    const apiKey = process.env.CONCORDIA_WEBSITE_API_KEY;
    if (!apiKey) {
      console.warn("[ProductSync] CONCORDIA_WEBSITE_API_KEY not set — skipping push");
      return;
    }
    const baseUrl = rawUrl.replace(/\/+$/, "");
    const endpoint = action === "sync"
      ? `${baseUrl}/api/external/products/sync`
      : `${baseUrl}/api/external/products/hide`;
    const payload = action === "sync"
      ? {
          concordiaId: product.id,
          externalProductId: product.externalId ?? null,
          name: product.name,
          price: product.price != null ? parseFloat(product.price as string) : null,
          stockCount: product.stockQuantity ?? 0,
          inStock: product.inStock ?? (product.stockQuantity ?? 0) > 0,
          category: product.category ?? null,
          imageUrl: product.imageUrl ?? null,
        }
      : {
          concordiaId: product.id,
          externalProductId: product.externalId ?? null,
        };
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        console.warn(`[ProductSync] ${action} push returned ${resp.status} for product ${product.id}`);
      } else {
        console.log(`[ProductSync] ${action} push OK for product ${product.id}`);
      }
    } catch (err) {
      console.warn(`[ProductSync] ${action} push failed for product ${product.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // Staff: Create a new product
  app.post("/api/staff/products", requireStaffKey, async (req: any, res) => {
    try {
      const body = z.object({
        name: z.string().min(1),
        category: z.string().min(1),
        price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid amount"),
        stockQuantity: z.number().int().min(0).default(0),
        ndc: z.string().optional(),
      }).parse(req.body);

      const product = await storage.createProduct({
        name: body.name,
        category: body.category,
        price: body.price,
        stockQuantity: body.stockQuantity,
        inStock: body.stockQuantity > 0,
        ndc: body.ndc ?? null,
        status: "active",
        showOnWebsite: true,
        showInApp: true,
        requiresPrescription: false,
      } as any);

      await logAudit({
        req,
        actionType: "create",
        entityType: "product",
        entityId: product.id,
        newValue: { name: body.name, createdBy: req.session?.staffEmail ?? "api-key" },
      });

      notifyProductChanged("sync", product).catch(() => {});
      broadcastPublicSSE("product_updated", {
        id: product.id,
        name: product.name,
        price: product.price,
        stockQuantity: product.stockQuantity,
        inStock: product.inStock,
        category: product.category,
      });

      res.status(201).json({
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        stockQuantity: product.stockQuantity,
        inStock: product.inStock,
        ndc: product.ndc ?? null,
        externalId: (product as any).externalId ?? null,
        showOnWebsite: product.showOnWebsite ?? true,
        showInApp: product.showInApp ?? true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      console.error("Staff: error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  // Staff: Delete a product
  app.delete("/api/staff/products/:id", requireStaffKey, async (req: any, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getProduct(id);
      if (!existing) return res.status(404).json({ message: "Product not found" });
      await storage.deleteProduct(id);
      await logAudit({
        req,
        actionType: "delete",
        entityType: "product",
        entityId: id,
        newValue: { deletedBy: req.session?.staffEmail ?? "api-key" },
      });
      notifyProductChanged("hide", { id, externalId: (existing as any).externalId ?? null }).catch(() => {});
      broadcastPublicSSE("product_deleted", { id });
      res.json({ success: true });
    } catch (error) {
      console.error("Staff: error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Staff: Toggle product visibility on website / in-app
  app.patch("/api/staff/products/:id/visibility", requireStaffKey, async (req: any, res) => {
    try {
      const { id } = req.params;
      const body = z.object({
        showOnWebsite: z.boolean().optional(),
        showInApp: z.boolean().optional(),
      }).refine((d) => d.showOnWebsite !== undefined || d.showInApp !== undefined, {
        message: "At least one of showOnWebsite or showInApp is required",
      }).parse(req.body);
      const updated = await storage.updateProduct(id, body as any);
      if (!updated) return res.status(404).json({ message: "Product not found" });
      // If hidden from website, send a hide signal; otherwise sync latest state
      const action = updated.showOnWebsite === false ? "hide" : "sync";
      notifyProductChanged(action, updated).catch(() => {});
      if (updated.showOnWebsite === false) {
        broadcastPublicSSE("product_hidden", { id: updated.id });
      } else {
        broadcastPublicSSE("product_updated", {
          id: updated.id,
          name: updated.name,
          price: updated.price,
          stockQuantity: updated.stockQuantity,
          inStock: updated.inStock,
          category: updated.category,
        });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      console.error("Staff: error updating visibility:", error);
      res.status(500).json({ message: "Failed to update product visibility" });
    }
  });

  // =====================================================
  // ADMIN: Staff Email Management
  // =====================================================

  // Admin: Get all staff emails
  app.get("/api/admin/staff-emails", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const staffEmails = await storage.getAllStaffEmails();
      res.json(staffEmails);
    } catch (error) {
      console.error("Error getting staff emails:", error);
      res.status(500).json({ message: "Failed to get staff emails" });
    }
  });

  // Admin: Add new staff email
  app.post("/api/admin/staff-emails", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        email: z.string().email().transform(e => e.toLowerCase()),
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        role: z.enum(["staff", "manager", "pharmacist", "technician", "admin"]).default("staff"),
        isActive: z.boolean().default(true),
      });

      const data = schema.parse(req.body);

      // Check if email already exists
      const existing = await storage.getStaffEmailByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "This email is already registered" });
      }

      const newStaff = await storage.createStaffEmail({
        ...data,
        addedBy: req.session.staffEmail || req.session.phoneNumber || "admin",
      });

      // Audit log
      await logAudit({
        req,
        actionType: "create",
        entityType: "staff_email" as any,
        entityId: newStaff.id.toString(),
        newValue: {
          id: newStaff.id,
          email: newStaff.email,
          firstName: newStaff.firstName,
          lastName: newStaff.lastName,
          role: newStaff.role,
        },
      });

      res.status(201).json(newStaff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating staff email:", error);
      res.status(500).json({ message: "Failed to create staff email" });
    }
  });

  // Admin: Update staff email
  app.patch("/api/admin/staff-emails/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const schema = z.object({
        email: z.string().email().transform(e => e.toLowerCase()).optional(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        role: z.enum(["staff", "manager", "pharmacist", "technician", "admin"]).optional(),
        isActive: z.boolean().optional(),
      });

      const updates = schema.parse(req.body);

      // If email is being changed, check for duplicates
      if (updates.email) {
        const existing = await storage.getStaffEmailByEmail(updates.email);
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "This email is already registered" });
        }
      }

      const oldStaff = await storage.getStaffEmail(id);
      const updated = await storage.updateStaffEmail(id, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "Staff email not found" });
      }

      // Audit log
      await logAudit({
        req,
        actionType: "update",
        entityType: "staff_email" as any,
        entityId: id.toString(),
        oldValue: oldStaff,
        newValue: updated,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating staff email:", error);
      res.status(500).json({ message: "Failed to update staff email" });
    }
  });

  // Admin: Delete staff email
  app.delete("/api/admin/staff-emails/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const staff = await storage.getStaffEmail(id);
      if (!staff) {
        return res.status(404).json({ message: "Staff email not found" });
      }

      await storage.deleteStaffEmail(id);

      // Audit log
      await logAudit({
        req,
        actionType: "delete",
        entityType: "staff_email" as any,
        entityId: id.toString(),
        oldValue: staff,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting staff email:", error);
      res.status(500).json({ message: "Failed to delete staff email" });
    }
  });

  // ==========================================
  // OTC LOYALTY CARD API ROUTES
  // ==========================================

  // Patient: Get my OTC card
  app.get("/api/otc-card", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const card = await storage.getOtcCard(userId);
      res.json(card || null);
    } catch (error) {
      console.error("Error getting OTC card:", error);
      res.status(500).json({ message: "Failed to get OTC card" });
    }
  });

  // Patient: Create or update OTC card
  app.post("/api/otc-card", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { cardNumber, cardholderName } = z.object({
        cardNumber: z.string().min(1, "Card number is required"),
        cardholderName: z.string().min(1, "Cardholder name is required"),
      }).parse(req.body);

      // Check if card exists
      const existingCard = await storage.getOtcCard(userId);
      
      let card;
      if (existingCard) {
        // Update existing card
        card = await storage.updateOtcCard(userId, {
          cardNumber,
          cardholderName,
          barcodeData: cardNumber, // Use card number as barcode data
        });
      } else {
        // Create new card
        card = await storage.createOtcCard({
          userId,
          cardNumber,
          cardholderName,
          barcodeData: cardNumber,
          isActive: true,
        });
      }

      // Audit log
      await logAudit({
        req,
        actionType: existingCard ? "update" : "create",
        entityType: "otc_card" as any,
        entityId: card?.id?.toString() || "new",
        oldValue: existingCard,
        newValue: card,
      });

      res.json(card);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error saving OTC card:", error);
      res.status(500).json({ message: "Failed to save OTC card" });
    }
  });

  // Patient: Delete OTC card
  app.delete("/api/otc-card", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const existingCard = await storage.getOtcCard(userId);
      if (!existingCard) {
        return res.status(404).json({ message: "OTC card not found" });
      }

      await storage.deleteOtcCard(userId);

      // Audit log
      await logAudit({
        req,
        actionType: "delete",
        entityType: "otc_card" as any,
        entityId: existingCard.id.toString(),
        oldValue: existingCard,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting OTC card:", error);
      res.status(500).json({ message: "Failed to delete OTC card" });
    }
  });

  // ==========================================
  // POINTS & REWARDS ENGINE API ROUTES
  // ==========================================

  // Patient: Get my points wallet and balance
  app.get("/api/points/wallet", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const wallet = await storage.getOrCreatePointsWallet(userId);
      const streaks = await storage.getUserStreaks(userId);
      
      res.json({ wallet, streaks });
    } catch (error) {
      console.error("Error getting points wallet:", error);
      res.status(500).json({ message: "Failed to get points wallet" });
    }
  });

  // Patient: Get my points history
  app.get("/api/points/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const ledger = await storage.getPointsLedger(userId, limit);
      
      res.json(ledger);
    } catch (error) {
      console.error("Error getting points history:", error);
      res.status(500).json({ message: "Failed to get points history" });
    }
  });

  // Patient: Get available rewards I can redeem
  app.get("/api/points/rewards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const availableRewards = await storage.getAvailableRewardsForUser(userId);
      const allActiveRewards = await storage.getActiveRewards();
      const wallet = await storage.getPointsWallet(userId);
      
      res.json({
        availableRewards,
        allActiveRewards,
        currentBalance: wallet?.currentBalance || 0,
      });
    } catch (error) {
      console.error("Error getting rewards:", error);
      res.status(500).json({ message: "Failed to get rewards" });
    }
  });

  // Patient: Redeem a reward
  app.post("/api/points/rewards/:rewardId/redeem", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { rewardId } = z.object({
        rewardId: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const { orderId } = z.object({
        orderId: z.string().optional(),
      }).parse(req.body);

      // Check if can redeem
      const canRedeem = await storage.canUserRedeemReward(userId, rewardId);
      if (!canRedeem.canRedeem) {
        return res.status(400).json({ message: canRedeem.reason || "Cannot redeem this reward" });
      }

      const redemption = await storage.redeemReward(userId, rewardId, orderId);
      if (!redemption) {
        return res.status(400).json({ message: "Failed to redeem reward" });
      }

      // Audit log
      await logAudit({
        req,
        actionType: "create",
        entityType: "reward" as any,
        entityId: rewardId.toString(),
        newValue: { action: "redemption", ...redemption },
      });

      res.json(redemption);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error redeeming reward:", error);
      res.status(500).json({ message: "Failed to redeem reward" });
    }
  });

  // Patient: Get my redemption history
  app.get("/api/points/redemptions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const redemptions = await storage.getUserRedemptions(userId);
      res.json(redemptions);
    } catch (error) {
      console.error("Error getting redemptions:", error);
      res.status(500).json({ message: "Failed to get redemptions" });
    }
  });

  // Patient: Get my referral info
  app.get("/api/points/referrals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const referrals = await storage.getUserReferrals(userId);
      const referralsThisMonth = await storage.countUserReferralsThisMonth(userId);
      
      res.json({
        referrals,
        referralsThisMonth,
        referralCode: userId.slice(0, 8).toUpperCase(), // Simple referral code from user ID
      });
    } catch (error) {
      console.error("Error getting referrals:", error);
      res.status(500).json({ message: "Failed to get referrals" });
    }
  });

  // Patient: Get earning rules (what actions earn points)
  app.get("/api/points/earning-rules", async (req, res) => {
    try {
      const rules = await storage.getActiveEarningRules();
      res.json(rules);
    } catch (error) {
      console.error("Error getting earning rules:", error);
      res.status(500).json({ message: "Failed to get earning rules" });
    }
  });

  // Admin: Get all points analytics
  app.get("/api/admin/points/analytics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const analytics = await storage.getPointsAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error getting points analytics:", error);
      res.status(500).json({ message: "Failed to get points analytics" });
    }
  });

  // Admin: Get comprehensive gamification analytics
  app.get("/api/admin/points/gamification-analytics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const analytics = await storage.getGamificationAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error getting gamification analytics:", error);
      res.status(500).json({ message: "Failed to get gamification analytics" });
    }
  });

  // Admin: Get all earning rules
  app.get("/api/admin/points/earning-rules", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const rules = await storage.getAllEarningRules();
      res.json(rules);
    } catch (error) {
      console.error("Error getting earning rules:", error);
      res.status(500).json({ message: "Failed to get earning rules" });
    }
  });

  // Admin: Update earning rule
  app.patch("/api/admin/points/earning-rules/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const { points, ...updates } = z.object({
        basePoints: z.number().int().nonnegative().optional(),
        points: z.number().int().nonnegative().optional(),
        isActive: z.boolean().optional(),
        description: z.string().optional(),
      }).parse(req.body);

      const updated = await storage.updateEarningRule(id, {
        ...updates,
        ...(points !== undefined && updates.basePoints === undefined ? { basePoints: points } : {}),
        lastModifiedBy: req.session?.userId || "admin",
      });

      if (!updated) {
        return res.status(404).json({ message: "Earning rule not found" });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "earning_rule" as any,
        entityId: id.toString(),
        newValue: updated,
      });

      // Invalidate rules cache so changes take effect immediately
      PointsService.invalidateRulesCache();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating earning rule:", error);
      res.status(500).json({ message: "Failed to update earning rule" });
    }
  });

  // Admin: Create earning rule
  app.post("/api/admin/points/earning-rules", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        ruleKey: z.string().min(1),
        actionType: z.enum([
          "on_time_refill", "perfect_adherence_month", "streak_3_refills", "streak_5_refills",
          "streak_10_refills", "weekly_app_engagement", "enable_delivery", "profile_completion",
          "otc_purchase", "delivery_completed", "vaccine_completed", "prescription_transfer",
          "referral_completed", "redeem_otc", "redeem_delivery_fee", "redeem_copay",
          "admin_adjustment", "expiration", "signup_bonus", "campaign_bonus"
        ]),
        name: z.string().min(1),
        description: z.string().optional(),
        basePoints: z.number().int(),
        pointsPerDollar: z.string().optional(),
        maxPointsPerEvent: z.number().int().optional(),
        maxEventsPerDay: z.number().int().optional(),
        maxEventsPerMonth: z.number().int().optional(),
        isOneTime: z.boolean().default(false),
        isActive: z.boolean().default(true),
      });

      const data = schema.parse(req.body);
      
      // Check if rule key already exists
      const existingRule = await storage.getEarningRule(data.ruleKey);
      if (existingRule) {
        return res.status(400).json({ message: "A rule with this key already exists" });
      }

      const rule = await storage.createEarningRule({
        ...data,
        lastModifiedBy: req.session?.userId || "admin",
      });

      await logAudit({
        req,
        actionType: "create",
        entityType: "earning_rule" as any,
        entityId: rule.id.toString(),
        newValue: rule,
      });

      // Invalidate rules cache so changes take effect immediately
      PointsService.invalidateRulesCache();

      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating earning rule:", error);
      res.status(500).json({ message: "Failed to create earning rule" });
    }
  });

  // Admin: Delete earning rule
  app.delete("/api/admin/points/earning-rules/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      await storage.deleteEarningRule(id);

      await logAudit({
        req,
        actionType: "delete",
        entityType: "earning_rule" as any,
        entityId: id.toString(),
      });

      // Invalidate rules cache so changes take effect immediately
      PointsService.invalidateRulesCache();

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error deleting earning rule:", error);
      res.status(500).json({ message: "Failed to delete earning rule" });
    }
  });

  // Admin: Get all rewards
  app.get("/api/admin/points/rewards", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const rewards = await storage.getAllRewards();
      res.json(rewards);
    } catch (error) {
      console.error("Error getting rewards:", error);
      res.status(500).json({ message: "Failed to get rewards" });
    }
  });

  // Admin: Create reward
  app.post("/api/admin/points/rewards", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        pointsCost: z.number().positive(),
        rewardType: z.enum(["otc_discount", "delivery_waiver", "copay_assistance", "points_multiplier", "free_item"]),
        discountValue: z.string().optional(), // Decimal stored as string
        discountType: z.enum(["percentage", "fixed"]).optional(),
        status: z.enum(["active", "inactive", "expired"]).default("active"),
        isReusable: z.boolean().default(false),
        maxRedemptionsPerUser: z.number().positive().optional(),
        maxRedemptionsTotal: z.number().positive().optional(),
        minPointsBalance: z.number().positive().optional(),
        requiredStreakType: z.enum(["refill_adherence", "weekly_engagement", "monthly_adherence"]).optional(),
        requiredStreakCount: z.number().positive().optional(),
        startsAt: z.string().transform(s => new Date(s)).optional(),
        expiresAt: z.string().transform(s => new Date(s)).optional(),
      });

      const data = schema.parse(req.body);
      const reward = await storage.createReward({
        ...data,
        startsAt: data.startsAt || new Date(),
        createdBy: req.session?.userId || "admin",
      });

      await logAudit({
        req,
        actionType: "create",
        entityType: "reward" as any,
        entityId: reward.id.toString(),
        newValue: reward,
      });

      res.status(201).json(reward);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating reward:", error);
      res.status(500).json({ message: "Failed to create reward" });
    }
  });

  // Admin: Update reward
  app.patch("/api/admin/points/rewards/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const updates = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        pointsCost: z.number().positive().optional(),
        status: z.enum(["active", "inactive", "expired"]).optional(),
        discountValue: z.union([z.string(), z.number()]).transform(v => v?.toString()).optional(),
        discountType: z.enum(["percentage", "fixed"]).optional(),
        isReusable: z.boolean().optional(),
        maxRedemptionsPerUser: z.number().positive().nullable().optional(),
        maxRedemptionsTotal: z.number().positive().nullable().optional(),
        expiresAt: z.string().transform(s => new Date(s)).optional().nullable(),
      }).parse(req.body);

      const oldReward = await storage.getReward(id);
      const updated = await storage.updateReward(id, updates);

      if (!updated) {
        return res.status(404).json({ message: "Reward not found" });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "reward" as any,
        entityId: id.toString(),
        oldValue: oldReward,
        newValue: updated,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating reward:", error);
      res.status(500).json({ message: "Failed to update reward" });
    }
  });

  // Admin: Delete reward
  app.delete("/api/admin/points/rewards/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const reward = await storage.getReward(id);
      if (!reward) {
        return res.status(404).json({ message: "Reward not found" });
      }

      await storage.deleteReward(id);

      await logAudit({
        req,
        actionType: "delete",
        entityType: "reward" as any,
        entityId: id.toString(),
        oldValue: reward,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting reward:", error);
      res.status(500).json({ message: "Failed to delete reward" });
    }
  });

  // Admin: Get all campaigns
  app.get("/api/admin/points/campaigns", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const campaigns = await storage.getAllCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error("Error getting campaigns:", error);
      res.status(500).json({ message: "Failed to get campaigns" });
    }
  });

  // Admin: Create campaign
  app.post("/api/admin/points/campaigns", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        campaignType: z.enum(["double_points", "bonus_points", "multiplier"]),
        multiplier: z.number().positive().optional(),
        bonusPoints: z.number().positive().optional(),
        applicableActions: z.array(z.string()).optional(),
        startsAt: z.string().transform(s => new Date(s)),
        endsAt: z.string().transform(s => new Date(s)),
        isActive: z.boolean().default(true),
      });

      const data = schema.parse(req.body);
      const campaign = await storage.createCampaign({
        ...data,
        createdBy: req.session?.userId || "admin",
      });

      await logAudit({
        req,
        actionType: "create",
        entityType: "campaign" as any,
        entityId: campaign.id.toString(),
        newValue: campaign,
      });

      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Admin: Update campaign
  app.patch("/api/admin/points/campaigns/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const updates = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        multiplier: z.number().positive().optional(),
        bonusPoints: z.number().positive().optional(),
        endsAt: z.string().transform(s => new Date(s)).optional(),
      }).parse(req.body);

      const updated = await storage.updateCampaign(id, updates);

      if (!updated) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "campaign" as any,
        entityId: id.toString(),
        newValue: updated,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Admin: Delete campaign
  app.delete("/api/admin/points/campaigns/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.params);

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      await storage.deleteCampaign(id);

      await logAudit({
        req,
        actionType: "delete",
        entityType: "campaign" as any,
        entityId: id.toString(),
        oldValue: campaign,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Admin: Award points to patient manually
  app.post("/api/admin/points/award", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        userId: z.string().min(1),
        points: z.number().positive(),
        reason: z.string().min(1),
      });

      const { userId, points, reason } = schema.parse(req.body);

      // Use PointsService for real-time broadcasts
      const entry = await PointsService.awardPoints({
        userId,
        actionType: "admin_adjustment",
        points,
        description: reason,
        adminId: req.session?.userId || "admin",
        adminReason: reason,
      });

      if (!entry) {
        return res.status(400).json({ message: "Failed to award points. Wallet may be frozen or user not found." });
      }

      await logAudit({
        req,
        actionType: "create",
        entityType: "points_ledger" as any,
        entityId: entry.id.toString(),
        newValue: { action: "award_points", userId, points, reason },
      });

      res.json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error awarding points:", error);
      res.status(500).json({ message: "Failed to award points" });
    }
  });

  // Admin: Deduct points from patient
  app.post("/api/admin/points/deduct", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const schema = z.object({
        userId: z.string().min(1),
        points: z.number().positive(),
        reason: z.string().min(1),
      });

      const { userId, points, reason } = schema.parse(req.body);

      // Use PointsService for real-time broadcasts
      const entry = await PointsService.deductPoints({
        userId,
        actionType: "admin_adjustment",
        points,
        description: reason,
        adminId: req.session?.userId || "admin",
        adminReason: reason,
      });

      if (!entry) {
        return res.status(400).json({ message: "Failed to deduct points. Insufficient balance or wallet frozen." });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "points_ledger" as any,
        entityId: entry.id.toString(),
        newValue: { action: "deduct_points", userId, points, reason },
      });

      res.json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error deducting points:", error);
      res.status(500).json({ message: "Failed to deduct points" });
    }
  });

  // Admin: Freeze/unfreeze patient wallet
  app.post("/api/admin/points/wallet/:userId/freeze", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { reason } = z.object({
        reason: z.string().min(1),
      }).parse(req.body);

      const wallet = await storage.freezeWallet(userId, reason, req.session?.userId || "admin");

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "points_wallet" as any,
        entityId: userId,
        newValue: { action: "freeze_wallet", reason, frozenAt: wallet.frozenAt },
      });

      res.json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error freezing wallet:", error);
      res.status(500).json({ message: "Failed to freeze wallet" });
    }
  });

  app.post("/api/admin/points/wallet/:userId/unfreeze", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;

      const wallet = await storage.unfreezeWallet(userId);

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "points_wallet" as any,
        entityId: userId,
        newValue: { action: "unfreeze_wallet" },
      });

      res.json(wallet);
    } catch (error) {
      console.error("Error unfreezing wallet:", error);
      res.status(500).json({ message: "Failed to unfreeze wallet" });
    }
  });

  // Admin: Get patient's points wallet (for customer management view)
  app.get("/api/admin/points/wallet/:userId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;

      const wallet = await storage.getPointsWallet(userId);
      const ledger = await storage.getPointsLedger(userId, 20);
      const streaks = await storage.getUserStreaks(userId);

      res.json({ wallet, ledger, streaks });
    } catch (error) {
      console.error("Error getting patient wallet:", error);
      res.status(500).json({ message: "Failed to get patient wallet" });
    }
  });

  // Admin: Get patient's points ledger (detailed transaction history)
  app.get("/api/admin/points/wallet/:userId/ledger", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const ledger = await storage.getPointsLedger(userId, limit);

      res.json(ledger);
    } catch (error) {
      console.error("Error getting patient ledger:", error);
      res.status(500).json({ message: "Failed to get patient ledger" });
    }
  });

  // Admin: Restore patient streak
  app.post("/api/admin/streaks/:userId/restore", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { streakType, newCount, reason } = z.object({
        streakType: z.enum(["refill_adherence", "weekly_engagement", "monthly_adherence"]),
        newCount: z.number().int().min(0),
        reason: z.string().min(1),
      }).parse(req.body);

      // Get or create streak
      let streak = await storage.getStreak(userId, streakType);
      if (!streak) {
        streak = await storage.updateStreak(userId, streakType, false);
      }

      // Update streak with admin override
      const updatedStreak = await storage.restoreStreak(userId, streakType, newCount, req.session?.userId || "admin", reason);

      await logAudit({
        req,
        actionType: "update",
        entityType: "streak" as any,
        entityId: `${userId}_${streakType}`,
        newValue: { action: "restore_streak", newCount, reason, previousCount: streak.currentCount },
      });

      res.json(updatedStreak);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error restoring streak:", error);
      res.status(500).json({ message: "Failed to restore streak" });
    }
  });

  // Admin: Clear gaming flag
  app.post("/api/admin/points/wallet/:userId/clear-flag", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { reason } = z.object({
        reason: z.string().min(1),
      }).parse(req.body);

      const wallet = await storage.updatePointsWallet(userId, {
        isFlagged: false,
        flaggedReason: null,
        flaggedAt: null,
        anomalyScore: 0,
      });

      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      await logAudit({
        req,
        actionType: "update",
        entityType: "points_wallet" as any,
        entityId: userId,
        newValue: { action: "clear_gaming_flag", reason },
      });

      res.json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error clearing gaming flag:", error);
      res.status(500).json({ message: "Failed to clear gaming flag" });
    }
  });

  // Admin: Get flagged users for review
  app.get("/api/admin/points/flagged-users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const flaggedUsers = await storage.getFlaggedUsers();
      res.json(flaggedUsers);
    } catch (error) {
      console.error("Error getting flagged users:", error);
      res.status(500).json({ message: "Failed to get flagged users" });
    }
  });

  // ==========================================
  // PATIENT REQUEST QUEUE ROUTES (T007)
  // ==========================================

  app.post("/api/patient-requests", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(403).json({ message: "Patient context required" });
      }

      const validated = insertPatientRequestSchema.parse({
        ...req.body,
        patientId,
      });

      const request = await storage.createPatientRequest(validated);

      broadcastUpdate("patient_request", {
        type: "new_request",
        request,
      });

      res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating patient request:", error);
      res.status(500).json({ message: "Failed to create patient request" });
    }
  });

  app.get("/api/admin/patient-requests", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters: { status?: string; type?: string; assignedStaffId?: number } = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.type) filters.type = req.query.type as string;
      if (req.query.assignedStaffId) filters.assignedStaffId = parseInt(req.query.assignedStaffId as string);

      const requests = await storage.getPatientRequests(filters);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching patient requests:", error);
      res.status(500).json({ message: "Failed to fetch patient requests" });
    }
  });

  app.get("/api/admin/patient-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const request = await storage.getPatientRequest(parseInt(req.params.id));
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }
      res.json(request);
    } catch (error) {
      console.error("Error fetching patient request:", error);
      res.status(500).json({ message: "Failed to fetch patient request" });
    }
  });

  app.patch("/api/admin/patient-requests/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, notes } = req.body;
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const staffId = req.session?.staffId || null;
      const updated = await storage.updatePatientRequestStatus(
        parseInt(req.params.id),
        status,
        staffId,
        notes,
      );

      if (!updated) {
        return res.status(404).json({ message: "Request not found" });
      }

      broadcastUpdate("patient_request", {
        type: "status_update",
        request: updated,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating patient request status:", error);
      res.status(500).json({ message: "Failed to update patient request status" });
    }
  });

  app.patch("/api/admin/patient-requests/:id/assign", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { staffId } = req.body;
      if (!staffId) {
        return res.status(400).json({ message: "Staff ID is required" });
      }

      const updated = await storage.assignPatientRequest(
        parseInt(req.params.id),
        parseInt(staffId),
      );

      if (!updated) {
        return res.status(404).json({ message: "Request not found" });
      }

      broadcastUpdate("patient_request", {
        type: "assignment_update",
        request: updated,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error assigning patient request:", error);
      res.status(500).json({ message: "Failed to assign patient request" });
    }
  });

  app.get("/api/admin/patient-requests/:id/history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const history = await storage.getRequestStatusHistory(parseInt(req.params.id));
      res.json(history);
    } catch (error) {
      console.error("Error fetching request history:", error);
      res.status(500).json({ message: "Failed to fetch request history" });
    }
  });

  // Send ConcordiaCare app download link to a patient (triggered from admin PharmFlow queue)
  app.post("/api/admin/patient-requests/:id/send-app-link", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const patientRequest = await storage.getPatientRequest(requestId);
      if (!patientRequest) {
        return res.status(404).json({ message: "Request not found" });
      }

      const appUrl = process.env.CONCORDIA_CARE_APP_URL || "https://concordiapharmacy.app";
      let patientEmail: string | null = null;
      let patientName: string | null = null;

      if (patientRequest.patientId) {
        const patient = await storage.getUser(patientRequest.patientId);
        if (patient) {
          patientEmail = patient.email ?? null;
          patientName = [patient.firstName, patient.lastName].filter(Boolean).join(' ') || patient.email || null;
        }
      }

      // Mark the request as completed with a note
      const staffId = req.session?.staffId ?? null;
      await storage.updatePatientRequestStatus(requestId, 'completed', staffId, 'App download link sent to patient');

      broadcastUpdate("patient_request", {
        type: "status_update",
        request: { id: requestId, status: 'completed' },
      });

      res.json({
        success: true,
        appUrl,
        patientEmail,
        patientName,
        message: patientEmail
          ? `App link ready. Email ${patientEmail} with the download link: ${appUrl}`
          : `App link: ${appUrl} (no email on file for this patient)`,
      });
    } catch (error) {
      console.error("Error sending app link:", error);
      res.status(500).json({ message: "Failed to send app link" });
    }
  });

  // ==========================================
  // BLISTER DOSE TRACKING & REMINDERS ROUTES (T008)
  // ==========================================

  app.post("/api/blister/dose-log", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(403).json({ message: "Patient context required" });
      }

      const blisterPatient = await storage.getBlisterPackPatientByUserId(patientId);
      if (!blisterPatient) {
        return res.status(404).json({ message: "No blister pack enrollment found" });
      }

      const validated = insertBlisterDoseLogSchema.parse({
        ...req.body,
        blisterPatientId: blisterPatient.id,
      });

      const log = await storage.createBlisterDoseLog(validated);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating dose log:", error);
      res.status(500).json({ message: "Failed to create dose log" });
    }
  });

  app.get("/api/blister/dose-log", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(403).json({ message: "Patient context required" });
      }

      const blisterPatient = await storage.getBlisterPackPatientByUserId(patientId);
      if (!blisterPatient) {
        return res.status(404).json({ message: "No blister pack enrollment found" });
      }

      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const logs = await storage.getBlisterDoseLogs(blisterPatient.id, dateFrom, dateTo);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching dose logs:", error);
      res.status(500).json({ message: "Failed to fetch dose logs" });
    }
  });

  app.post("/api/blister/reminders", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(403).json({ message: "Patient context required" });
      }

      const blisterPatient = await storage.getBlisterPackPatientByUserId(patientId);
      if (!blisterPatient) {
        return res.status(404).json({ message: "No blister pack enrollment found" });
      }

      const validated = insertBlisterReminderSchema.parse({
        ...req.body,
        blisterPatientId: blisterPatient.id,
      });

      const reminder = await storage.createBlisterReminder({
        ...validated,
        daysOfWeek: validated.daysOfWeek ? Array.from(validated.daysOfWeek) as number[] : undefined,
      });
      res.status(201).json(reminder);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating reminder:", error);
      res.status(500).json({ message: "Failed to create reminder" });
    }
  });

  app.get("/api/blister/reminders", isAuthenticated, async (req: any, res) => {
    try {
      const patientId = getPatientId(req);
      if (!patientId) {
        return res.status(403).json({ message: "Patient context required" });
      }

      const blisterPatient = await storage.getBlisterPackPatientByUserId(patientId);
      if (!blisterPatient) {
        return res.status(404).json({ message: "No blister pack enrollment found" });
      }

      const reminders = await storage.getActiveBlisterReminders(blisterPatient.id);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      res.status(500).json({ message: "Failed to fetch reminders" });
    }
  });

  app.delete("/api/blister/reminders/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteBlisterReminder(parseInt(req.params.id));
      res.json({ message: "Reminder deleted" });
    } catch (error) {
      console.error("Error deleting reminder:", error);
      res.status(500).json({ message: "Failed to delete reminder" });
    }
  });

  app.get("/api/admin/blister-patients/:id/dose-log", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const logs = await storage.getBlisterDoseLogs(parseInt(req.params.id), dateFrom, dateTo);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching patient dose logs:", error);
      res.status(500).json({ message: "Failed to fetch patient dose logs" });
    }
  });

  // ==========================================
  // BLISTER PACK — LATEST DOSE LOGS PER MED
  // ==========================================

  app.get("/api/blister/latest-doses", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const patient = await storage.getBlisterPackPatientByUserId(userId);
      if (!patient) return res.status(404).json({ message: "Not enrolled in blister pack program" });

      const logs = await storage.getLatestDoseLogsByPatient(patient.id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching latest dose logs:", error);
      res.status(500).json({ message: "Failed to fetch latest dose logs" });
    }
  });

  app.get("/api/admin/blister-patients/:id/latest-doses", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/).transform(Number) }).parse(req.params);
      const logs = await storage.getLatestDoseLogsByPatient(id);
      res.json(logs);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid patient ID" });
      console.error("Error fetching latest dose logs:", error);
      res.status(500).json({ message: "Failed to fetch latest dose logs" });
    }
  });

  // ==========================================
  // BLISTER PACK — ALL ACTIVE REMINDERS (ADMIN)
  // ==========================================

  app.get("/api/admin/blister-reminders", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const reminders = await storage.getAllActiveBlisterReminders();
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching all blister reminders:", error);
      res.status(500).json({ message: "Failed to fetch blister reminders" });
    }
  });

  // ==========================================
  // BLISTER PACK — UPDATE REMINDER
  // ==========================================

  app.patch("/api/blister/reminders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const patient = await storage.getBlisterPackPatientByUserId(userId);
      if (!patient) return res.status(404).json({ message: "Not enrolled in blister pack program" });

      const { id } = z.object({ id: z.string().regex(/^\d+$/).transform(Number) }).parse(req.params);

      const existingReminders = await storage.getActiveBlisterReminders(patient.id);
      const ownsReminder = existingReminders.some(r => r.id === id);
      if (!ownsReminder) return res.status(404).json({ message: "Reminder not found" });

      const updateData = z.object({
        reminderTime: z.string().optional(),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);

      const updated = await storage.updateBlisterReminder(id, updateData);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error updating reminder:", error);
      res.status(500).json({ message: "Failed to update reminder" });
    }
  });

  // ==========================================
  // COMMUNICATIONS — UNREAD COUNT
  // ==========================================

  app.get("/api/communications/unread", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const unread = await storage.getUnreadCommunications({ userId });
      res.json({ count: unread.length, items: unread });
    } catch (error) {
      console.error("Error fetching unread communications:", error);
      res.status(500).json({ message: "Failed to fetch unread communications" });
    }
  });

  // ==========================================
  // COMMUNICATIONS — ACKNOWLEDGE & RESOLVE
  // ==========================================

  app.patch("/api/my-blister-communications/:id/acknowledge", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const { id } = z.object({ id: z.string().regex(/^\d+$/).transform(Number) }).parse(req.params);

      const patient = await storage.getBlisterPackPatientByUserId(userId);
      if (!patient) return res.status(404).json({ message: "Blister patient not found" });

      const communication = await storage.getPatientCommunication(id);
      if (!communication || communication.blisterPatientId !== patient.id) {
        return res.status(404).json({ message: "Communication not found" });
      }

      const updated = await storage.markCommunicationAcknowledged(id, userId);
      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging communication:", error);
      res.status(500).json({ message: "Failed to acknowledge communication" });
    }
  });

  app.patch("/api/admin/blister-communications/:id/resolve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/).transform(Number) }).parse(req.params);
      const adminId = (req.session as any)?.adminId || "admin";
      const updated = await storage.markCommunicationResolved(id, adminId);
      if (!updated) return res.status(404).json({ message: "Communication not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error resolving communication:", error);
      res.status(500).json({ message: "Failed to resolve communication" });
    }
  });

  // ==========================================
  // DOCTORS — SINGLE + PATIENT-FACING
  // ==========================================

  app.get("/api/admin/doctors/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = z.object({ id: z.string().regex(/^\d+$/).transform(Number) }).parse(req.params);
      const doctor = await storage.getDoctorById(id);
      if (!doctor) return res.status(404).json({ message: "Doctor not found" });
      res.json(doctor);
    } catch (error) {
      console.error("Error fetching doctor:", error);
      res.status(500).json({ message: "Failed to fetch doctor" });
    }
  });

  app.get("/api/my-doctors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const doctors = await storage.getDoctorsByPatient(userId);
      res.json(doctors);
    } catch (error) {
      console.error("Error fetching patient doctors:", error);
      res.status(500).json({ message: "Failed to fetch your doctors" });
    }
  });

  // ==========================================
  // POINTS — EXPIRING POINTS & STREAK MILESTONES
  // ==========================================

  app.get("/api/admin/points/expiring", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId, days } = z.object({
        userId: z.string(),
        days: z.string().regex(/^\d+$/).transform(Number).optional(),
      }).parse(req.query);

      const daysAhead = days || 30;
      const beforeDate = new Date();
      beforeDate.setDate(beforeDate.getDate() + daysAhead);

      const expiring = await storage.getExpiringPoints(userId, beforeDate);
      res.json({ userId, expiresWithin: `${daysAhead} days`, entries: expiring });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "userId query param required" });
      console.error("Error fetching expiring points:", error);
      res.status(500).json({ message: "Failed to fetch expiring points" });
    }
  });

  app.post("/api/admin/points/expire", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { entryId } = z.object({ entryId: z.number() }).parse(req.body);
      await storage.markPointsExpired(entryId);

      await storage.createAuditLog({
        userId: (req.session as any)?.adminId || "admin",
        actionType: "update",
        entityType: "points_ledger",
        entityId: String(entryId),
        newValue: { action: "mark_points_expired", entryId },
      });

      res.json({ message: "Points entry marked as expired" });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "entryId required", errors: error.errors });
      console.error("Error expiring points:", error);
      res.status(500).json({ message: "Failed to expire points" });
    }
  });

  app.get("/api/admin/points/streak-milestone-bonus", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { currentCount, lastMilestone } = z.object({
        currentCount: z.string().regex(/^\d+$/).transform(Number),
        lastMilestone: z.string().regex(/^\d+$/).transform(Number),
      }).parse(req.query);

      const bonus = storage.getStreakMilestoneBonus(currentCount, lastMilestone);
      res.json(bonus || { milestone: null, points: 0 });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "currentCount and lastMilestone required" });
      console.error("Error checking milestone bonus:", error);
      res.status(500).json({ message: "Failed to check milestone bonus" });
    }
  });

  // ==========================================
  // PHARMACY ALERTS — CLEANUP EXPIRED
  // ==========================================

  app.post("/api/admin/alerts/cleanup-expired", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const deleted = await storage.deleteExpiredAlerts();

      await storage.createAuditLog({
        userId: (req.session as any)?.adminId || "admin",
        actionType: "delete",
        entityType: "product",
        entityId: "expired-alerts",
        newValue: { action: "cleanup_expired_alerts", deletedCount: deleted },
      });

      res.json({ message: `${deleted} expired alert(s) removed`, deletedCount: deleted });
    } catch (error) {
      console.error("Error cleaning up expired alerts:", error);
      res.status(500).json({ message: "Failed to cleanup expired alerts" });
    }
  });

  // ==========================================
  // USERS — FAMILY GROUP
  // ==========================================

  app.get("/api/my-family", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getPatientId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const user = await storage.getUser(userId);
      if (!user?.familyGroupId) return res.json([]);

      const familyMembers = (await storage.getUsersByFamilyGroup(user.familyGroupId))
        .filter(m => m.id !== userId)
        .map(m => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          dateOfBirth: m.dateOfBirth,
        }));

      res.json(familyMembers);
    } catch (error) {
      console.error("Error fetching family group:", error);
      res.status(500).json({ message: "Failed to fetch family members" });
    }
  });

  // ==========================================
  // PRODUCT BARCODE LOOKUP
  // ==========================================

  app.get("/api/admin/products/lookup", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ndc } = req.query;
      if (!ndc || typeof ndc !== "string") {
        return res.status(400).json({ message: "NDC/barcode parameter required" });
      }
      const product = await storage.getProductByNdc(ndc.trim());
      if (!product) {
        return res.json({ found: false });
      }
      res.json({ found: true, product });
    } catch (error) {
      console.error("Error looking up product by barcode:", error);
      res.status(500).json({ message: "Failed to look up product" });
    }
  });

  // PRODUCT VISIBILITY ROUTES (T006)
  // ==========================================

  app.patch("/api/admin/products/:id/visibility", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { showOnWebsite, showInApp } = req.body;
      const updated = await storage.updateProductVisibility(req.params.id, showOnWebsite, showInApp);
      if (!updated) {
        return res.status(404).json({ message: "Product not found" });
      }
      // Notify SSE clients when a product is hidden from the website
      if (showOnWebsite === false) {
        broadcastPublicSSE("product_hidden", { id: req.params.id });
      } else if (showOnWebsite === true && updated.status === "active" && !updated.requiresPrescription) {
        broadcastPublicSSE("product_updated", {
          id: updated.id,
          name: updated.name,
          price: updated.price,
          stockQuantity: updated.stockQuantity,
          inStock: updated.inStock,
          category: updated.category,
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating product visibility:", error);
      res.status(500).json({ message: "Failed to update product visibility" });
    }
  });

  app.post("/api/admin/products/sync-otc-visibility", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const count = await storage.syncOtcVisibility();
      res.json({ success: true, message: `${count} OTC/grocery product(s) synced to app`, count });
    } catch (error) {
      console.error("Error syncing OTC visibility:", error);
      res.status(500).json({ message: "Failed to sync OTC visibility" });
    }
  });

  // ── OTC bulk sync helpers ────────────────────────────────────────────────────
  function mapExternalProductToDb(p: any, source: string) {
    const stockQty = p.stockQuantity ?? p.stock_quantity ?? 0;
    return {
      name: p.name ?? p.productName ?? p.product_name ?? "Unnamed",
      description: p.description ?? null,
      category: p.category ?? "General",
      price: String(p.price ?? p.retailPrice ?? p.retail_price ?? "0.00"),
      imageUrl: p.imageUrl ?? p.image_url ?? p.imageURL ?? null,
      inStock: p.inStock ?? p.in_stock ?? (typeof stockQty === "number" ? stockQty > 0 : true),
      stockQuantity: typeof stockQty === "number" ? stockQty : 0,
      stockThreshold: p.stockThreshold ?? p.stock_threshold ?? 10,
      requiresPrescription: p.requiresPrescription ?? p.requires_prescription ?? false,
      ndc: p.ndc ?? null,
      showOnWebsite: p.showOnWebsite ?? p.show_on_website ?? true,
      showInApp: p.showInApp ?? p.show_in_app ?? true,
      status: p.status ?? "active",
      externalId: p.externalId ?? p.external_id ?? String(p.id ?? ""),
      importSource: source,
      importBatchId: p.importBatchId ?? p.import_batch_id ?? null,
      expiryDate: p.expiryDate ?? p.expiry_date ?? null,
    };
  }

  // Admin-triggered bulk sync (POST /api/sync/concordia-products)
  app.post("/api/sync/concordia-products", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const body = z.object({
        products: z.array(z.record(z.any())).default([]),
        source: z.string().optional().default("concordia"),
      }).parse(req.body);
      const mapped = body.products
        .map((p) => mapExternalProductToDb(p, body.source))
        .filter((p) => !!p.externalId);
      const result = await storage.bulkSyncOtcProducts(mapped, body.source);
      res.json({ success: true, upserted: result.upserted, markedUnavailable: result.markedUnavailable });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request body", errors: error.errors });
      console.error("Error in concordia product bulk sync:", error);
      res.status(500).json({ message: "Failed to sync products" });
    }
  });

  app.get("/api/products/website", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const products = await getStaffShopProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching website products:", error);
      res.status(500).json({ message: "Failed to fetch website products" });
    }
  });

  app.get("/api/products/app", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const products = await getStaffShopProducts("app");
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const withAbsoluteImages = products.map((p: any) => ({
        ...p,
        imageUrl: p.imageUrl && p.imageUrl.startsWith("/") ? `${baseUrl}${p.imageUrl}` : p.imageUrl,
      }));
      res.json(withAbsoluteImages);
    } catch (error) {
      console.error("Error fetching app products:", error);
      res.status(500).json({ message: "Failed to fetch app products" });
    }
  });

  // ==========================================
  // PUBLIC API — concordianyc.com integration
  // No authentication required. CORS open to concordianyc.com.
  // ==========================================

  // GET /api/external/products
  // Returns our full active OTC product catalog in the agreed external format.
  // Authenticated by X-API-KEY header matching CONCORDIA_RX_API_KEY env var.
  app.get("/api/external/products", async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
    const expectedKey = process.env.CONCORDIA_RX_API_KEY;
    if (expectedKey) {
      const provided = req.headers["x-api-key"] as string | undefined;
      if (!provided || provided !== expectedKey) {
        return res.status(401).json({ message: "Invalid or missing X-API-KEY" });
      }
    }
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const products = await getStaffShopProducts();
      const payload = products.map((p: any) => {
        const imageUrl = p.imageUrl && p.imageUrl.startsWith("/")
          ? `${baseUrl}${p.imageUrl}`
          : (p.imageUrl || null);
        return {
          id: String(p.id),
          name: p.name,
          sku: p.ndc || p.externalId || String(p.id),
          category: p.category || null,
          price: p.price != null ? String(parseFloat(p.price).toFixed(2)) : null,
          stockCount: p.stockQuantity ?? 0,
          inStock: p.inStock ?? (p.stockQuantity ?? 0) > 0,
          active: p.status === "active",
          imageUrl,
          description: p.description || null,
        };
      });
      res.json(payload);
    } catch (error) {
      console.error("Error fetching external products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  const PUBLIC_STATUS_LABELS: Record<string, string> = {
    pending:          "Order received — we'll have it ready soon",
    preparing:        "Being prepared by our pharmacists",
    ready_for_pickup: "Ready for pickup at the pharmacy",
    sent_for_delivery:"On its way to you",
    delivered:        "Delivered",
    picked_up:        "Picked up — thank you!",
    processing:       "Being processed",
    completed:        "Order complete",
    cancelled:        "Order cancelled",
    refunded:         "Refunded",
  };

  function mapPublicProduct(p: any, baseUrl: string) {
    const imageUrl = p.imageUrl && p.imageUrl.startsWith("/")
      ? `${baseUrl}${p.imageUrl}`
      : (p.imageUrl || null);
    return {
      id: p.id,
      name: p.name,
      category: p.category || null,
      description: p.description || null,
      price: p.price != null ? parseFloat(p.price) : null,
      packSize: null,
      sellerName: null,
      inStock: p.inStock ?? (p.stockQuantity > 0),
      stockCount: p.stockQuantity ?? 0,
      imageUrl,
      barcode: p.ndc || null,
      expirationDate: null,
      requiresPrescription: p.requiresPrescription ?? false,
      stockQuantity: p.stockQuantity ?? 0,
    };
  }

  app.get("/api/public/products", async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const allProducts = await getStaffShopProducts();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const { category, search, inStockOnly } = req.query;

      let filtered = (allProducts as any[]).filter(p => p.externalId && /^[1-9]\d*$/.test(p.externalId));

      if (category && typeof category === "string") {
        const cat = category.toLowerCase();
        filtered = filtered.filter((p: any) =>
          (p.category || "").toLowerCase() === cat
        );
      }

      if (search && typeof search === "string") {
        const q = search.toLowerCase();
        filtered = filtered.filter((p: any) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.ndc || "").toLowerCase().includes(q)
        );
      }

      if (inStockOnly === "true") {
        filtered = filtered.filter((p: any) => p.inStock && p.stockQuantity > 0);
      }

      res.json(filtered.map((p: any) => mapPublicProduct(p, baseUrl)));
    } catch (error) {
      console.error("Error fetching public products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get("/api/public/products/categories", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const allProducts = await getStaffShopProducts();
      const seen = new Set<string>();
      const categories: string[] = [];
      for (const p of allProducts as any[]) {
        const cat = (p.category || "").trim();
        if (cat && !seen.has(cat)) {
          seen.add(cat);
          categories.push(cat);
        }
      }
      categories.sort((a, b) => a.localeCompare(b));
      res.json(categories);
    } catch (error) {
      console.error("Error fetching public categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.get("/api/public/products/:id", async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const allProducts = await getStaffShopProducts();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const product = (allProducts as any[]).find((p: any) => p.id === req.params.id);
      if (!product) {
        return res.status(404).json({ found: false, message: "Product not found" });
      }
      res.json(mapPublicProduct(product, baseUrl));
    } catch (error) {
      console.error("Error fetching public product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // The legacy public submit route accepted client-provided prices and paid status.
  // Keep historical status lookups below, but use the guarded guest cash route for new orders.
  app.post("/api/public/orders", (_req, res) => {
    return res.status(410).json({ message: "This order submission route is retired. Use guest cash-at-counter pickup checkout." });
  });

  app.get("/api/public/orders/:orderNumber", async (req: any, res) => {
    try {
      const order = await storage.getOrderByOrderNumber(req.params.orderNumber.toUpperCase());
      if (!order) {
        return res.status(404).json({ found: false, message: "Order not found" });
      }
      const statusLabel = PUBLIC_STATUS_LABELS[order.status] ?? order.status;
      res.json({
        orderNumber: order.orderNumber,
        status: order.status,
        statusLabel,
        fulfillmentType: order.deliveryMethod || "pickup",
        createdAt: order.createdAt,
      });
    } catch (error) {
      console.error("Error tracking public order:", error);
      res.status(500).json({ message: "Failed to track order" });
    }
  });

  // ==========================================
  // PUBLIC SSE — real-time product & order events
  // ==========================================

  app.get("/api/public/events", (req: any, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send a heartbeat every 25 seconds to keep the connection alive
    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 25_000);

    sseClients.add(res);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // ==========================================
  // PRODUCT IMAGE UPLOAD
  // ==========================================

  app.post("/api/admin/products/upload-image", isAuthenticated, isAdmin, upload.single("image"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Invalid file type. Use JPEG, PNG, WebP, or GIF." });
      }

      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "Image too large. Maximum 5MB." });
      }

      const url = await objectStorageService.uploadPublicFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      res.json({ url });
    } catch (error) {
      console.error("Error uploading product image:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  });

  app.get("/api/public-images/*path", async (req, res) => {
    try {
      const imagePath = req.path.replace("/api/public-images/", "");
      const file = await objectStorageService.searchPublicObject(imagePath);
      if (!file) {
        return res.status(404).json({ message: "Image not found" });
      }
      await objectStorageService.downloadObject(file, res, 86400);
    } catch (error) {
      console.error("Error serving public image:", error);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  app.post("/api/admin/products/upload-invoice", isAuthenticated, isAdmin, upload.single("invoice"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No invoice file uploaded" });
      }

      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large. Maximum 10MB." });
      }

      const allowedTypes = [
        "image/jpeg", "image/png", "image/webp", "image/heic",
        "application/pdf",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/csv", "application/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel",
        "application/octet-stream", // fallback MIME for XLS/XLSX from some browsers
        "text/plain",
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Invalid file type. Accepted: JPEG/PNG, PDF, DOC/DOCX, CSV, XLSX, or TXT." });
      }

      const privatePath = await objectStorageService.uploadPrivateFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        "invoices"
      );

      const proxyUrl = `/api/admin/invoices/${encodeURIComponent(privatePath)}`;

      res.json({ invoiceUrl: proxyUrl, fileName: req.file.originalname, mimeType: req.file.mimetype });
    } catch (error) {
      console.error("Error uploading invoice:", error);
      res.status(500).json({ message: "Failed to upload invoice" });
    }
  });

  app.post("/api/admin/invoices/extract", isAuthenticated, isAdmin, upload.single("invoice"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No invoice file uploaded" });
      }

      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "File too large. Maximum 10MB." });
      }

      let rawText = "";
      const mime = req.file.mimetype;

      if (mime === "application/pdf") {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
        const pdfData = await pdfParse(req.file.buffer);
        rawText = pdfData.text;
      } else if (mime.startsWith("image/")) {
        const Tesseract = await import("tesseract.js");
        const worker = await Tesseract.createWorker("eng");
        const { data } = await worker.recognize(req.file.buffer);
        rawText = data.text;
        await worker.terminate();
      } else if (
        mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mime === "application/vnd.ms-excel" ||
        (mime === "application/octet-stream" && req.file.originalname.match(/\.xlsx?$/i))
      ) {
        const XLSX = await import("@e965/xlsx");
        const wb = XLSX.read(req.file.buffer, { type: "buffer" });
        const rows: string[] = [];
        for (const sheetName of wb.SheetNames) {
          const sheet = wb.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          rows.push(csv);
        }
        rawText = rows.join("\n");
      } else if (
        mime === "application/msword" ||
        (mime === "application/octet-stream" && req.file.originalname.match(/\.docx?$/i))
      ) {
        // Legacy binary .doc format — parsed with word-extractor (CFB/OLE compound doc)
        const WordExtractor = (await import("word-extractor")).default;
        const extractor = new WordExtractor();
        const doc = await extractor.extract(req.file.buffer);
        rawText = doc.getBody();
      } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        rawText = result.value;
      } else if (
        mime === "text/plain" ||
        mime === "text/csv" ||
        mime === "application/csv"
      ) {
        rawText = req.file.buffer.toString("utf-8");
      } else {
        return res.status(400).json({ message: "Unsupported file type. Accepted: PDF, JPEG/PNG (image), CSV, XLSX, DOC, DOCX, or TXT." });
      }

      const lines = rawText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const items: Array<{ name: string; quantity: number; price: string; ndc: string; confidence: string }> = [];

      const ndcRegex = /(\d{4,5}[-\s]?\d{3,4}[-\s]?\d{1,2})/;
      const qtyRegex = /(?:qty|shipped|shppd|quantity|qte|units|packs?|ea|each|count)\s*[:\.]?\s*(\d+)/i;

      const skipPatterns = [
        /^(invoice|date|page|total|subtotal|sub\s*total|tax|ship\s*to|bill\s*to|sold\s*to|terms|po\s*#|po\s*number|account|phone|fax|remit|payment|balance|due|thank|customer|vendor|supplier|from|to|attn|attention|company|address|city|state|zip|email|www\.|http|order\s*(number|#|no)|tracking|delivery|note|memo|credit|debit|freight|shipping|handling|discount|net\s*amount|amount\s*due|grand\s*total)/i,
        /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
        /^[A-Z][a-z]+ [A-Z][a-z]+$/,
        /^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/,
        /^\d+\s+(st|nd|rd|th|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|rd|road|ct|court|way|pl|place)\b/i,
        /^[a-zA-Z]+,?\s*[A-Z]{2}\s+\d{5}/,
        /^(Mr|Mrs|Ms|Dr|Dear|Attn|Attention)\b/i,
        /^(sincerely|regards|thank\s*you|please\s*remit|net\s*\d+|cod|prepaid)/i,
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.length < 5) continue;
        if (skipPatterns.some(p => p.test(line))) continue;

        const hasDollarPrice = /\$\s*\d{1,6}[,.]?\d{0,2}/.test(line);
        const hasDecimalPrice = /\b\d{1,6}\.\d{2}\b/.test(line);

        if (!hasDollarPrice && !hasDecimalPrice) continue;

        const prices: string[] = [];
        const dollarMatches = line.match(/\$\s*[\d,]+\.?\d{0,2}/g);
        if (dollarMatches) {
          dollarMatches.forEach(p => {
            const val = parseFloat(p.replace(/[$ ,]/g, "").trim());
            if (val >= 0.01 && val < 100000) {
              prices.push(val.toFixed(2));
            }
          });
        }

        if (prices.length === 0) {
          const decimalMatches = line.match(/\b(\d{1,6}\.\d{2})\b/g);
          if (decimalMatches) {
            decimalMatches.forEach(n => {
              const val = parseFloat(n);
              if (val >= 0.50 && val < 100000) {
                prices.push(val.toFixed(2));
              }
            });
          }
        }

        if (prices.length === 0) continue;

        let qty = 1;
        const qtyMatch = line.match(qtyRegex);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1]) || 1;
        } else {
          const leadingQty = line.match(/^\s*(\d{1,3})\s+[A-Za-z]/);
          if (leadingQty) {
            const potentialQty = parseInt(leadingQty[1]);
            if (potentialQty > 0 && potentialQty <= 999) {
              qty = potentialQty;
            }
          }
        }

        let ndc = "";
        const ndcMatch = line.match(ndcRegex);
        if (ndcMatch) {
          ndc = ndcMatch[1].replace(/\s/g, "-");
        }

        let nameCandidate = line
          .replace(/\$\s*[\d,]+\.?\d{0,2}/g, "")
          .replace(ndcRegex, "")
          .replace(/\b\d{1,6}\.\d{2}\b/g, "")
          .replace(/(?:qty|shipped|shppd|quantity|qte|units|packs?|ea|each|count)\s*[:\.]?\s*\d+/gi, "")
          .replace(/^\s*\d{1,3}\s+/, "")
          .replace(/\b(each|per|unit|case|box|bottle|pk|tab|cap|mg|ml|oz|g|kg|lb)\b/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();

        if (nameCandidate.length < 3) continue;
        if (/^\d+$/.test(nameCandidate)) continue;

        const hasAlpha = /[a-zA-Z]{2,}/.test(nameCandidate);
        if (!hasAlpha) continue;

        if (/^\d+\s+(st|nd|rd|th|street|ave|blvd|dr|ln|rd|ct|way)\b/i.test(nameCandidate)) continue;
        if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(nameCandidate) && !ndc) continue;

        const price = prices[prices.length - 1];

        let confidence = "low";
        if (ndc && prices.length > 0) confidence = "high";
        else if (prices.length > 0 && nameCandidate.length > 5) confidence = "high";
        else if (prices.length > 0) confidence = "medium";

        items.push({
          name: nameCandidate.substring(0, 200),
          quantity: qty,
          price: price,
          ndc: ndc,
          confidence: confidence,
        });
      }

      const privatePath = await objectStorageService.uploadPrivateFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        "invoices"
      );
      const proxyUrl = `/api/admin/invoices/${encodeURIComponent(privatePath)}`;

      res.json({
        items,
        rawText: rawText.substring(0, 5000),
        invoiceUrl: proxyUrl,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        totalLinesScanned: lines.length,
      });
    } catch (error) {
      console.error("Error extracting invoice data:", error);
      res.status(500).json({ message: "Failed to extract invoice data. Try a clearer image or PDF." });
    }
  });

  app.get("/api/admin/invoices/:filePath", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filePath = decodeURIComponent(req.params.filePath);
      const privateDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateDir}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ message: "Invoice file not found" });
      }
      await objectStorageService.downloadObject(file, res, 300);
    } catch (error) {
      console.error("Error serving invoice file:", error);
      res.status(500).json({ message: "Failed to serve invoice file" });
    }
  });

  // ==========================================
  // CHANGE LOG ROUTES (T012)
  // ==========================================

  app.get("/api/admin/change-log/:entityType/:entityId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const entries = await storage.getChangeLogEntries(req.params.entityType, req.params.entityId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching change log:", error);
      res.status(500).json({ message: "Failed to fetch change log" });
    }
  });

  // ==========================================
  // DOCTOR DIRECTORY ROUTES (T003)
  // ==========================================

  app.get("/api/admin/doctors", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const search = req.query.search as string | undefined;
      const doctors = await storage.getAllDoctors(search);
      res.json(doctors);
    } catch (error) {
      console.error("Error fetching doctors:", error);
      res.status(500).json({ message: "Failed to fetch doctors" });
    }
  });

  app.post("/api/admin/doctors/csv-import", isAuthenticated, isAdmin, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString("utf-8");

      function parseCsvLine(line: string): string[] {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
              current += '"';
              i++;
            } else if (ch === '"') {
              inQuotes = false;
            } else {
              current += ch;
            }
          } else {
            if (ch === '"') {
              inQuotes = true;
            } else if (ch === ',') {
              result.push(current.trim());
              current = "";
            } else {
              current += ch;
            }
          }
        }
        result.push(current.trim());
        return result;
      }

      const lines = csvContent.split(/\r?\n/).filter((line: string) => line.trim());

      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file must have a header row and at least one data row" });
      }

      const headers = parseCsvLine(lines[0]).map((h: string) => h.toLowerCase().replace(/\s+/g, ""));
      const requiredHeaders = ["firstname", "lastname", "phone"];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

      if (missingHeaders.length > 0) {
        return res.status(400).json({
          message: `Missing required columns: ${missingHeaders.join(", ")}. Required: firstName, lastName, phone`
        });
      }

      const doctors: any[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);

        if (values.length < headers.length) {
          errors.push(`Row ${i + 1}: Not enough columns`);
          continue;
        }

        const row: any = {};
        headers.forEach((header: string, idx: number) => {
          row[header] = values[idx];
        });

        if (!row.firstname || !row.lastname || !row.phone) {
          errors.push(`Row ${i + 1}: Missing required fields (firstName, lastName, or phone)`);
          continue;
        }

        doctors.push({
          firstName: row.firstname,
          lastName: row.lastname,
          phone: row.phone,
          specialty: row.specialty || null,
          fax: row.fax || null,
          email: row.email || null,
          npi: row.npi || null,
          address: row.address || null,
          notes: row.notes || null,
          primeRxId: row.primerxid || null,
        });
      }

      if (doctors.length === 0) {
        return res.status(400).json({
          message: "No valid doctors found in CSV",
          errors
        });
      }

      const result = await storage.bulkCreateDoctors(doctors);

      res.json({
        message: `Successfully imported ${result.created} doctors`,
        created: result.created,
        total: doctors.length,
        errors: [...errors, ...result.errors].length > 0 ? [...errors, ...result.errors] : undefined
      });
    } catch (error) {
      console.error("Error bulk importing doctors:", error);
      res.status(500).json({ message: "Failed to import doctors" });
    }
  });

  app.get("/api/admin/doctors/export", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const doctors = await storage.getAllDoctors();
      const activeDoctors = doctors.filter(d => d.isActive);

      const csvHeaders = ["firstName", "lastName", "specialty", "phone", "fax", "email", "npi", "address", "notes", "primeRxId"];
      const csvLines = [csvHeaders.join(",")];

      for (const doc of activeDoctors) {
        const row = csvHeaders.map(h => {
          const value = (doc as any)[h];
          if (value === null || value === undefined) return "";
          const str = String(value);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvLines.push(row.join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=doctors_export.csv");
      res.send(csvLines.join("\n"));
    } catch (error) {
      console.error("Error exporting doctors:", error);
      res.status(500).json({ message: "Failed to export doctors" });
    }
  });

  app.post("/api/admin/doctors", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = insertPatientDoctorSchema.parse(req.body);
      const doctor = await storage.createDoctor(data);
      res.status(201).json(doctor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid doctor data", errors: error.errors });
      }
      console.error("Error creating doctor:", error);
      res.status(500).json({ message: "Failed to create doctor" });
    }
  });

  app.patch("/api/admin/doctors/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid doctor ID" });
      }
      const existing = await storage.getDoctorById(id);
      if (!existing) {
        return res.status(404).json({ message: "Doctor not found" });
      }
      const updated = await storage.updateDoctor(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating doctor:", error);
      res.status(500).json({ message: "Failed to update doctor" });
    }
  });

  app.delete("/api/admin/doctors/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid doctor ID" });
      }

      const permanent = req.query.permanent === "true";

      if (permanent) {
        const doctor = await storage.hardDeleteDoctor(id);
        if (!doctor) {
          return res.status(404).json({ message: "Doctor not found" });
        }
        await logAudit({
          req,
          actionType: "delete",
          entityType: "doctor",
          entityId: String(id),
          oldValue: {
            firstName: doctor.firstName,
            lastName: doctor.lastName,
            npi: doctor.npi,
            specialty: doctor.specialty,
          },
          newValue: {
            adminId: req.session?.adminId || "admin",
            purpose: "permanent_doctor_deletion",
            deletedAt: new Date().toISOString(),
          },
        });
        res.json({ message: "Doctor permanently deleted", doctor });
      } else {
        const doctor = await storage.softDeleteDoctor(id);
        if (!doctor) {
          return res.status(404).json({ message: "Doctor not found" });
        }
        res.json({ message: "Doctor deactivated", doctor });
      }
    } catch (error) {
      console.error("Error deleting doctor:", error);
      res.status(500).json({ message: "Failed to delete doctor" });
    }
  });

  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time admin updates
  // ===== EXTERNAL API ENDPOINTS (for ConcordiaCare app) =====

  function requireApiKey(req: any, res: any, next: any) {
    const apiKey = process.env.CONCORDIA_RX_API_KEY || process.env.API_KEY;
    if (!apiKey) return res.status(503).json({ message: "API key not configured" });
    const provided = req.headers["x-api-key"];
    if (typeof provided !== "string" || provided !== apiKey) {
      return res.status(401).json({ message: "Invalid or missing API key" });
    }
    next();
  }

  const APP_FRAUD_SUMMARIES = {
    account_takeover: "ConcordiaCare detected behavior consistent with a possible account takeover.",
    identity_switching: "ConcordiaCare detected rapid switching among claimed patient identities.",
    verification_abuse: "ConcordiaCare detected excessive or suspicious identity verification attempts.",
    session_anomaly: "ConcordiaCare detected an unusual authenticated session pattern.",
    profile_change_anomaly: "ConcordiaCare detected a high-risk profile change sequence.",
    checkout_abuse: "ConcordiaCare detected suspicious checkout behavior.",
    reward_abuse: "ConcordiaCare detected suspicious rewards or points activity.",
    prescription_access_abuse: "ConcordiaCare detected suspicious prescription-access behavior.",
    delivery_address_abuse: "ConcordiaCare detected suspicious delivery-address activity.",
    automation_abuse: "ConcordiaCare detected automated or high-velocity abuse.",
  } as const;

  app.post("/api/external/fraud-alerts", requireApiKey, async (req, res) => {
    try {
      const input = z.object({
        eventId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
        signalType: z.enum([
          "account_takeover",
          "identity_switching",
          "verification_abuse",
          "session_anomaly",
          "profile_change_anomaly",
          "checkout_abuse",
          "reward_abuse",
          "prescription_access_abuse",
          "delivery_address_abuse",
          "automation_abuse",
        ]),
        severity: z.enum(["medium", "high", "critical"]),
        occurredAt: z.string().datetime().optional(),
        metadata: z.object({
          action: z.enum([
            "sign_in", "verification", "profile_change", "checkout", "reward",
            "prescription", "delivery", "session",
          ]).optional(),
          reasonCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/).optional(),
          failedAttempts: z.number().int().min(0).max(10000).optional(),
          distinctIdentities: z.number().int().min(0).max(10000).optional(),
          windowMinutes: z.number().int().min(1).max(1440).optional(),
          deviceRisk: z.enum(["low", "medium", "high"]).optional(),
          platform: z.enum(["ios", "android", "web"]).optional(),
          appVersion: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._+-]+$/).optional(),
        }).strict().optional(),
      }).strict().parse(req.body);

      const eventHash = createHash("sha256")
        .update(`concordiacare_app\u001f${input.eventId}`)
        .digest("hex");
      const alert = await recordFraudSignal({
        eventHash,
        signalType: input.signalType,
        severity: input.severity,
        source: "concordiacare_app",
        summary: APP_FRAUD_SUMMARIES[input.signalType],
        metadata: input.metadata,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      });

      if (!alert) return res.json({ success: true, duplicate: true });
      res.status(201).json({
        success: true,
        duplicate: false,
        alertId: alert.id,
        status: alert.status,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid fraud alert", errors: error.errors });
      }
      console.error("Error receiving ConcordiaCare fraud alert:", error);
      res.status(500).json({ message: "Failed to record fraud alert" });
    }
  });

  // External push endpoint — API-key protected (POST /api/sync/products)
  app.post("/api/sync/products", requireApiKey, async (req: any, res) => {
    try {
      const body = z.object({
        products: z.array(z.record(z.any())).default([]),
        source: z.string().optional().default("external"),
      }).parse(req.body);
      const mapped = body.products
        .map((p) => mapExternalProductToDb(p, body.source))
        .filter((p) => !!p.externalId);
      const result = await storage.bulkSyncOtcProducts(mapped, body.source);
      res.json({ success: true, upserted: result.upserted, markedUnavailable: result.markedUnavailable });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request body", errors: error.errors });
      console.error("Error in external product bulk sync:", error);
      res.status(500).json({ message: "Failed to sync products" });
    }
  });

  app.get("/api/external/blister-packs", requireApiKey, async (req, res) => {
    try {
      const patients = await storage.getAllBlisterPackPatients();
      const result = patients.map((p) => ({
        id: p.id,
        concordiaCareBlisterPackId: p.concordiaCareBlisterPackId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phoneNumber: p.phoneNumber,
        dateOfBirth: p.dateOfBirth,
        blisterPackType: p.blisterPackType,
        status: p.status,
        medications: p.medications,
        morningTime: p.morningTime,
        noonTime: p.noonTime,
        eveningTime: p.eveningTime,
        bedtimeTime: p.bedtimeTime,
        lastPackDate: p.lastPackDate,
        nextPackDate: p.nextPackDate,
        updatedAt: p.updatedAt,
        lastSyncedToApp: p.lastSyncedToApp,
      }));
      res.json(result);
    } catch (error) {
      console.error("Error fetching blister packs for external API:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/external/blister-packs/updated-since/:timestamp", requireApiKey, async (req, res) => {
    try {
      const since = new Date(req.params.timestamp);
      if (isNaN(since.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp" });
      }
      const allPatients = await storage.getAllBlisterPackPatients();
      const filtered = allPatients.filter((p) => p.updatedAt > since);
      const result = filtered.map((p) => ({
        id: p.id,
        concordiaCareBlisterPackId: p.concordiaCareBlisterPackId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phoneNumber: p.phoneNumber,
        dateOfBirth: p.dateOfBirth,
        blisterPackType: p.blisterPackType,
        status: p.status,
        medications: p.medications,
        morningTime: p.morningTime,
        noonTime: p.noonTime,
        eveningTime: p.eveningTime,
        bedtimeTime: p.bedtimeTime,
        lastPackDate: p.lastPackDate,
        nextPackDate: p.nextPackDate,
        updatedAt: p.updatedAt,
        lastSyncedToApp: p.lastSyncedToApp,
      }));
      res.json(result);
    } catch (error) {
      console.error("Error fetching updated blister packs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/external/blister-packs/:id", requireApiKey, async (req, res) => {
    try {
      const patient = await storage.getBlisterPackPatient(parseInt(req.params.id));
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      res.json({
        id: patient.id,
        concordiaCareBlisterPackId: patient.concordiaCareBlisterPackId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        dateOfBirth: patient.dateOfBirth,
        blisterPackType: patient.blisterPackType,
        status: patient.status,
        medications: patient.medications,
        morningTime: patient.morningTime,
        noonTime: patient.noonTime,
        eveningTime: patient.eveningTime,
        bedtimeTime: patient.bedtimeTime,
        lastPackDate: patient.lastPackDate,
        nextPackDate: patient.nextPackDate,
        updatedAt: patient.updatedAt,
        lastSyncedToApp: patient.lastSyncedToApp,
      });
    } catch (error) {
      console.error("Error fetching blister pack:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/external/blister-pack-sync", requireApiKey, async (req, res) => {
    try {
      const { concordiaCareBlisterPackId, status, medications, doseLog } = req.body;
      if (!concordiaCareBlisterPackId) {
        return res.status(400).json({ message: "concordiaCareBlisterPackId is required" });
      }

      const allPatients = await storage.getAllBlisterPackPatients();
      const patient = allPatients.find(
        (p) => p.concordiaCareBlisterPackId === String(concordiaCareBlisterPackId)
      );

      if (!patient) {
        return res.status(404).json({ message: "No matching blister pack patient found" });
      }

      const updateData: any = {};
      let hasBusinessUpdate = false;

      if (status) {
        const statusMap: Record<string, string> = {
          active: "active",
          pending: "pending",
          paused: "on_hold",
          discontinued: "discontinued",
        };
        updateData.status = statusMap[status] || status;
        hasBusinessUpdate = true;
      }

      if (medications && Array.isArray(medications)) {
        updateData.medications = medications;
        hasBusinessUpdate = true;
      }

      let updated;
      if (hasBusinessUpdate) {
        updated = await storage.updateBlisterPackPatient(patient.id, updateData);
      }
      await storage.updateBlisterPackSyncMeta(patient.id, { lastAppSync: new Date() });

      if (doseLog && Array.isArray(doseLog)) {
        for (const log of doseLog) {
          try {
            await storage.createBlisterDoseLog({
              blisterPatientId: patient.id,
              medicationName: log.medicationName,
              scheduledTime: log.timeSlot || log.scheduledTime || "08:00",
              scheduledDate: log.scheduledDate ? new Date(log.scheduledDate).toISOString() : new Date().toISOString(),
              action: (log.status || log.action || "taken") as "taken" | "skipped" | "snoozed" | "missed",
              notes: log.notes || null,
            });
          } catch (e) {
            console.error(`[ConcordiaCare Sync] Failed to add dose log:`, e);
          }
        }
      }

      console.log(`[ConcordiaCare Sync] Received sync from app for patient ${patient.id}`);
      res.json({ success: true, patientId: patient.id, updatedAt: updated?.updatedAt });
    } catch (error) {
      console.error("Error processing external blister pack sync:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== ORDER SYNC ENDPOINT (ConcordiaCare app → Website) =====

  app.post("/api/orders/sync", requireApiKey, async (req, res) => {
    try {
      const schema = z.object({
        concordiaCareOrderId: z.number().or(z.string()),
        patientId: z.string().optional(),
        patientName: z.string(),
        patientEmail: z.string().optional(),
        patientPhone: z.string().optional(),
        items: z.array(z.object({
          productName: z.string(),
          productType: z.string().optional(),
          quantity: z.number().int().positive(),
        })).default([]),
        orderType: z.enum(["otc", "prescription", "mixed"]).default("otc"),
        status: z.enum(["preparing", "received", "verified", "ready", "picked_up", "delivered", "cancelled"]),
        deliveryMethod: z.string().nullable().optional(),
        deliveryAddress: z.string().nullable().optional(),
        pickupSlot: z.string().nullable().optional(),
        estimatedReadyTime: z.string().nullable().optional(),
        totalItems: z.number().optional(),
        createdAt: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const ccOrderId = String(data.concordiaCareOrderId);

      const statusMap: Record<string, string> = {
        preparing: "pending",
        received: "processing",
        verified: "processing",
        ready: "completed",
        picked_up: "completed",
        delivered: "completed",
        cancelled: "cancelled",
      };
      const websiteStatus = statusMap[data.status] || "pending";

      const updateExistingOrder = async (existing: any) => {
        await storage.updateOrderDelivery(existing.id, {
          status: websiteStatus as any,
          appStatus: data.status,
          deliveryMethod: data.deliveryMethod ?? existing.deliveryMethod,
          pickupSlot: data.pickupSlot ?? existing.pickupSlot,
          estimatedReadyTime: data.estimatedReadyTime ?? existing.estimatedReadyTime,
          shippingAddress: data.deliveryAddress ?? existing.shippingAddress,
          notes: `ConcordiaCare Order #${ccOrderId} — Status: ${data.status}`,
        } as any);
        console.log(`[Order Sync] Updated order ${existing.orderNumber} (CC #${ccOrderId}) → ${data.status}`);
        broadcastUpdate("orders", { type: "order_updated", orderId: existing.id, status: data.status });
      };

      const existing = await storage.getOrderByConcordiaCareId(ccOrderId);

      if (existing) {
        await updateExistingOrder(existing);
        return res.json({ success: true });
      }

      const nameParts = data.patientName.trim().split(/\s+/);
      const firstName = nameParts[0] || "App";
      const lastName = nameParts.slice(1).join(" ") || "Patient";

      let userId: string | undefined;
      const allUsers = await storage.getAllUsers();
      const match = allUsers.find((u: any) => {
        if (data.patientEmail && u.email?.toLowerCase() === data.patientEmail.toLowerCase()) return true;
        if (data.patientPhone && u.phoneNumber === data.patientPhone) return true;
        return false;
      });

      if (match) {
        userId = match.id;
      } else {
        const { randomUUID } = await import("crypto");
        const newUser = await storage.upsertUser({
          id: randomUUID(),
          email: data.patientEmail || `app_${Date.now()}@concordiapharmacy.app`,
          firstName,
          lastName,
          phoneNumber: data.patientPhone || "",
        });
        userId = newUser.id;
      }

      const orderNumber = generateOrderNumber();

      let order;
      try {
        order = await storage.createOrder({
          userId,
          orderNumber,
          type: data.orderType,
          status: websiteStatus as any,
          subtotal: "0.00",
          total: "0.00",
          pointsUsed: 0,
          pointsEarned: 0,
          source: "app",
          concordiaCareOrderId: ccOrderId,
          appStatus: data.status,
          deliveryMethod: data.deliveryMethod ?? null,
          pickupSlot: data.pickupSlot ?? null,
          estimatedReadyTime: data.estimatedReadyTime ?? null,
          shippingAddress: data.deliveryAddress ?? null,
          notes: `ConcordiaCare Order #${ccOrderId} — Status: ${data.status}`,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        } as any);
      } catch (createError: any) {
        if (createError.code === "23505" && createError.constraint?.includes("concordia_care_order_id")) {
          const retryExisting = await storage.getOrderByConcordiaCareId(ccOrderId);
          if (retryExisting) {
            await updateExistingOrder(retryExisting);
            return res.json({ success: true });
          }
        }
        throw createError;
      }

      for (const item of data.items) {
        await storage.createOrderItem({
          orderId: order.id,
          name: item.productName,
          quantity: item.quantity,
          price: "0.00",
        });
      }

      console.log(`[Order Sync] Created order ${orderNumber} (CC #${ccOrderId}) — ${data.status}`);
      broadcastUpdate("orders", { type: "new_order", order });
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        console.error("[Order Sync] Validation error:", error.errors);
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("[Order Sync] Error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== EXTERNAL ORDER ENDPOINTS (for ConcordiaCare app) =====

  app.post(["/api/external/checkout/session", "/api/external/checkout/payment-intent"], requireApiKey, (_req, res) => {
    return res.status(410).json({ message: "Online payments are no longer available." });
  });

  app.post("/api/external/orders", requireApiKey, async (req, res) => {
    try {
      const schema = z.object({
        items: z.array(z.object({
          productId: z.string().optional(),
          productName: z.string().optional(),
          quantity: z.number().int().positive(),
          price: z.string().or(z.number()).optional(),
        })).min(1),
        customer: z.object({
          firstName: z.string(),
          lastName: z.string(),
          phone: z.string().optional(),
          email: z.string().optional(),
          userId: z.string().optional(),
        }),
        type: z.enum(["otc", "prescription", "mixed"]).default("otc"),
        deliveryMethod: z.enum(["pickup", "delivery"]).default("pickup"),
        shippingAddress: z.string().trim().max(1000).optional(),
        shippingAddressUnit: z.string().trim().max(100).optional(),
        shippingAddressVerification: shopAddressSelectionSchema.optional(),
        subtotal: z.string().or(z.number()),
        total: z.string().or(z.number()),
        status: z.enum(["pending", "processing", "completed", "cancelled"]).default("pending"),
        notes: z.string().optional(),
        paymentIntentId: z.string().optional(),
        paymentStatus: z.enum(["paid_online", "collect_at_counter", "unpaid"]).default("collect_at_counter"),
      });

      const data = schema.parse(req.body);
      if (data.paymentStatus === "paid_online" || data.paymentIntentId || (data.type !== "otc" && data.deliveryMethod !== "pickup")) {
        return res.status(503).json({ message: "Online payments are unavailable. Shop orders are unpaid pickup or delivery requests." });
      }
      if (data.type === "otc") {
        return handleAppShopRequest(req, res, data, (orderId) => {
          broadcastUpdate("orders", { type: "new_order_request", orderId });
        });
      }

      let userId = data.customer.userId;
      if (!userId) {
        const allUsers = await storage.getAllUsers();
        const match = allUsers.find((u: any) => {
          if (data.customer.email && u.email?.toLowerCase() === data.customer.email.toLowerCase()) return true;
          if (data.customer.phone && u.phoneNumber === data.customer.phone) return true;
          return false;
        });
        if (match) {
          userId = match.id;
        } else {
          const { randomUUID } = await import("crypto");
          const newUser = await storage.upsertUser({
            id: randomUUID(),
            email: data.customer.email || `app_${Date.now()}@concordiapharmacy.app`,
            firstName: data.customer.firstName,
            lastName: data.customer.lastName,
            phoneNumber: data.customer.phone || "",
          });
          userId = newUser.id;
        }
      }

      const orderNumber = generateOrderNumber();
      // Staff owns all reservations and stock transitions, including app requests.

      let order;
      try {
        order = await storage.createOrder({
          userId,
          orderNumber,
          type: data.type,
          status: "pending",
          subtotal: String(data.subtotal),
          total: String(data.total),
          pointsUsed: 0,
          pointsEarned: 0,
          paymentIntentId: null,
          paymentStatus: "collect_at_counter",
          paymentMethod: "cash",
          deliveryMethod: "pickup",
          notes: data.notes || `Order from ConcordiaCare App`,
          source: "app",
        });
      } catch (error) {
        throw error;
      }

      try {
        for (const item of data.items) {
          await storage.createOrderItem({
            orderId: order.id,
            productId: item.productId || null,
            name: item.productName || "App Product",
            quantity: item.quantity,
            price: String(item.price ?? "0.00"),
          });
        }
      } catch (error) {
        throw error;
      }

      broadcastUpdate("orders", { type: "new_order", order });
      console.log(`[External Orders] App order ${orderNumber} created (total: $${data.total})`);
      res.status(201).json({ success: true, orderId: order.id, orderNumber });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating external order:", error);
      return res.status(503).json({
        message: "External order could not be processed.",
      });
    }
  });

  app.get("/api/external/orders", requireApiKey, async (req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      res.json(allOrders);
    } catch (error) {
      console.error("Error fetching external orders:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/order-status/:orderNumber", requireApiKey, async (req, res) => {
    const { pharmacyCode } = req.query;
    if (!pharmacyCode || pharmacyCode !== "PHARMFLOWS") {
      return res.status(400).json({ message: "Missing or invalid pharmacyCode" });
    }
    try {
      const order = await storage.getOrderByOrderNumber(req.params.orderNumber);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json({
        orderNumber: order.orderNumber,
        status: order.status,
        deliveryStatus: order.deliveryStatus ?? null,
        trackingNumber: order.trackingNumber ?? null,
        updatedAt: order.updatedAt ?? null,
      });
    } catch (error) {
      console.error("[Order Status] Error fetching order:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/external/orders/since/:timestamp", requireApiKey, async (req, res) => {
    try {
      const since = new Date(parseInt(req.params.timestamp));
      const allOrders = await storage.getAllOrders();
      const recent = allOrders.filter((o: any) => new Date(o.updatedAt ?? o.createdAt) > since)
        .map(o => ({ ...o, orderItems: o.orderItems.map(item => ({
          ...item, concordiaProductId: item.product?.externalId ? Number(item.product.externalId) : null,
        })) }));
      res.json(recent);
    } catch (error) {
      console.error("Error fetching external orders since:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== EXTERNAL MEDICATION PUSH API =====
  
  app.post("/api/external/medications", requireApiKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        concordiaCareUserId: z.string().trim().min(1),
        operation: z.enum(["add", "update", "deactivate"]),
        medication: z.object({
          name: z.string().min(1),
          dosage: z.string().optional().default(""),
          frequency: z.string().optional().default(""),
          rxNumber: z.string().trim().min(1),
          refillsRemaining: z.number().optional(),
          nextRefillDate: z.string().optional(),
          lastFilledDate: z.string().optional(),
          prescribedBy: z.string().optional().default(""),
          instructions: z.string().optional(),
          ndc: z.string().optional(),
          quantity: z.number().optional(),
          strength: z.string().optional(),
          genericName: z.string().optional(),
          brandName: z.string().optional(),
          copayAmount: z.string().optional(),
        }),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid request body", 
          errors: parsed.error.flatten().fieldErrors 
        });
      }

      const data = parsed.data;
      const patient = await storage.getUserByConcordiaCareUserId(data.concordiaCareUserId);

      if (!patient || patient.role !== "patient") {
        return res.status(404).json({
          success: false,
          message: "No linked patient found for this ConcordiaCare account.",
        });
      }

      const med = data.medication;

      // Build instructions combining frequency and explicit instructions
      const fullInstructions = [med.frequency, med.instructions].filter(Boolean).join(" — ");

      if (data.operation === "add") {
        // Check if rxNumber already exists
        const existing = await storage.getPrescriptionByRxNumber(med.rxNumber);
        if (existing) {
          return res.status(409).json({
            success: false,
            message: "ownership_conflict",
          });
        }

        const sigText = fullInstructions || med.frequency || "";
        const sigParseResult = sigText ? parseSig(sigText) : null;

        let newRx;
        try {
          newRx = await storage.createPrescription({
          userId: patient.id,
          rxNumber: med.rxNumber,
          medicationName: med.name,
          dosage: med.dosage || "",
          quantity: med.quantity || 0,
          refillsRemaining: med.refillsRemaining ?? 0,
          prescribedBy: med.prescribedBy || "Provider",
          instructions: fullInstructions || null,
          sig: sigText || null,
          parsedSig: sigParseResult ? {
            dose: sigParseResult.dose,
            unit: sigParseResult.unit,
            route: sigParseResult.route,
            frequencyCode: sigParseResult.frequencyCode,
            intakeTimes: sigParseResult.intakeTimes,
            intervalHours: sigParseResult.intervalHours,
            withFood: sigParseResult.withFood,
            specialFlag: sigParseResult.specialFlag,
            autoParsed: sigParseResult.autoParsed,
          } : null,
          status: "active",
          workflowStatus: "received",
          nextRefillDate: med.nextRefillDate ? new Date(med.nextRefillDate) : null,
          lastFilledDate: med.lastFilledDate ? new Date(med.lastFilledDate) : null,
          ndc: med.ndc || null,
          strength: med.strength || null,
          genericName: med.genericName || null,
          brandName: med.brandName || null,
          copayAmount: med.copayAmount || null,
          });
        } catch (error: any) {
          if (error?.code === "23505") {
            return res.status(409).json({ success: false, message: "ownership_conflict" });
          }
          throw error;
        }

        // Send notification to patient
        await storage.createNotification({
          userId: patient.id,
          type: "prescription_status",
          channel: "in_app",
          title: "New Medication Added",
          message: `${med.name}${med.dosage ? ` (${med.dosage})` : ""} has been added to your medications.`,
          entityId: newRx.id,
        });

        console.log("[External Medications] ADD completed");

        syncMedicationsToApp(patient.id, patient).catch(err =>
          console.log("[External Medications] App sync after ADD failed")
        );

        return res.status(201).json({
          success: true,
          operation: "add",
          prescriptionId: newRx.id,
          patientId: patient.id,
          message: `Medication ${med.name} added successfully for ${patient.firstName} ${patient.lastName}.`,
        });
      }

      if (data.operation === "update") {
        const existing = await storage.getPrescriptionByRxNumber(med.rxNumber);
        if (!existing) {
          return res.status(404).json({
            success: false,
            message: `No prescription found with rxNumber ${med.rxNumber}.`,
          });
        }

        if (existing.userId !== patient.id) {
          return res.status(403).json({
            success: false,
            message: "This prescription does not belong to the matched patient.",
          });
        }

        const updates: any = { updatedAt: new Date() };
        if (med.name) updates.medicationName = med.name;
        if (med.dosage) updates.dosage = med.dosage;
        if (med.quantity !== undefined) updates.quantity = med.quantity;
        if (med.refillsRemaining !== undefined) updates.refillsRemaining = med.refillsRemaining;
        if (med.prescribedBy) updates.prescribedBy = med.prescribedBy;
        if (fullInstructions) updates.instructions = fullInstructions;
        if (med.nextRefillDate) updates.nextRefillDate = new Date(med.nextRefillDate);
        if (med.lastFilledDate) updates.lastFilledDate = new Date(med.lastFilledDate);
        if (med.ndc) updates.ndc = med.ndc;
        if (med.strength) updates.strength = med.strength;
        if (med.genericName) updates.genericName = med.genericName;
        if (med.brandName) updates.brandName = med.brandName;
        if (med.copayAmount) updates.copayAmount = med.copayAmount;

        const updated = await storage.updatePrescription(existing.id, updates);

        await storage.createNotification({
          userId: patient.id,
          type: "prescription_status",
          channel: "in_app",
          title: "Medication Updated",
          message: `Your prescription for ${med.name}${med.dosage ? ` (${med.dosage})` : ""} has been updated.`,
          entityId: existing.id,
        });

        console.log("[External Medications] UPDATE completed");

        syncMedicationsToApp(patient.id, patient).catch(err =>
          console.log("[External Medications] App sync after UPDATE failed")
        );

        return res.json({
          success: true,
          operation: "update",
          prescriptionId: existing.id,
          patientId: patient.id,
          message: `Medication ${med.name} updated successfully.`,
        });
      }

      if (data.operation === "deactivate") {
        const existing = await storage.getPrescriptionByRxNumber(med.rxNumber);
        if (!existing) {
          return res.status(404).json({
            success: false,
            message: `No prescription found with rxNumber ${med.rxNumber}.`,
          });
        }

        if (existing.userId !== patient.id) {
          return res.status(403).json({
            success: false,
            message: "This prescription does not belong to the matched patient.",
          });
        }

        await storage.updatePrescriptionStatus(existing.id, "cancelled");

        await storage.createNotification({
          userId: patient.id,
          type: "prescription_status",
          channel: "in_app",
          title: "Medication Discontinued",
          message: `${med.name}${med.dosage ? ` (${med.dosage})` : ""} has been discontinued.`,
          entityId: existing.id,
        });

        console.log("[External Medications] DEACTIVATE completed");

        syncMedicationsToApp(patient.id, patient).catch(err =>
          console.log("[External Medications] App sync after DEACTIVATE failed")
        );

        return res.json({
          success: true,
          operation: "deactivate",
          prescriptionId: existing.id,
          patientId: patient.id,
          message: `Medication ${med.name} has been deactivated.`,
        });
      }

      return res.status(400).json({ success: false, message: "Invalid operation." });
    } catch (error: any) {
      console.error("[External Medications] ingestion failed");
      if (error?.code === "23505") {
        return res.status(409).json({ success: false, message: "ownership_conflict" });
      }
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  // ===== BACKGROUND SYNC ENGINE =====
  
  let syncInProgress = false;

  async function runSyncCycle() {
    if (syncInProgress) return;
    syncInProgress = true;
    try {
      const allPatients = await storage.getAllBlisterPackPatients();
      let synced = 0;

      for (const patient of allPatients) {
        if (patient.status === "discontinued") continue;
        // Creating a pack again without a confirmed remote ID can duplicate
        // it. Creation happens once at enrollment or by explicit staff action.
        if (!patient.concordiaCareBlisterPackId) continue;

        const needsSync =
          !patient.lastSyncedToApp ||
          patient.updatedAt > patient.lastSyncedToApp;

        if (needsSync) {
          if (await syncBlisterPackToApp("update", patient) === "synced") synced++;
        }
      }

      if (synced > 0) {
        console.log(`[ConcordiaCare Sync Engine] Synced ${synced} blister pack patient(s)`);
      }

      if (getConcordiaCareConfig()) {
        const allUsers = await storage.getAllUsers();
        const patientUsers = allUsers.filter((u: any) => u.role === "patient");
        let medsSynced = 0;
        for (const user of patientUsers) {
          const rxList = await storage.getPrescriptionsByUserId(user.id);
          if (!rxList || rxList.length === 0) continue;

          const latestRxUpdate = rxList.reduce((latest: Date, rx: any) => {
            const rxDate = rx.updatedAt ? new Date(rx.updatedAt) : new Date(0);
            return rxDate > latest ? rxDate : latest;
          }, new Date(0));

          const lastSync = lastMedSyncTimestamps.get(user.id);
          if (!lastSync || latestRxUpdate > lastSync) {
            await syncMedicationsToApp(user.id, user);
            medsSynced++;
          }
        }
        if (medsSynced > 0) {
          console.log(`[ConcordiaCare Sync Engine] Synced medications for ${medsSynced} patient(s)`);
        }
      }
    } catch (error) {
      console.error("[ConcordiaCare Sync Engine] Error:", error);
    } finally {
      syncInProgress = false;
    }
  }

  const SYNC_INTERVAL_MS = 30_000;
  let syncTimer: ReturnType<typeof setInterval> | null = null;

  function startSyncEngine() {
    if (syncTimer) return;
    console.log(`[ConcordiaCare Sync Engine] Started (interval: ${SYNC_INTERVAL_MS / 1000}s)`);
    syncTimer = setInterval(runSyncCycle, SYNC_INTERVAL_MS);
    setTimeout(runSyncCycle, 5000);
  }

  startSyncEngine();

  const sessionMiddleware = getSession();

  const wss = new WebSocketServer({
    noServer: true,
    verifyClient: (info, done) => {
      // Clerk JWT check for admin role (reads from cookies/Authorization header)
      try {
        const auth = getAuth(info.req as any);
        if (auth.userId) {
          const role = (auth.sessionClaims?.metadata as any)?.role as string | undefined;
          if (role === "admin") return done(true);
        }
      } catch { /* Clerk not configured or token absent */ }
      // Fallback: session-based check (legacy / transition)
      sessionMiddleware(info.req as any, {} as any, (err?: any) => {
        if (err) return done(false, 500, "Internal Server Error");
        const session = (info.req as any).session;
        if (!session?.isAdminLoggedIn) return done(false, 401, "Unauthorized");
        done(true);
      });
    },
  });

  // Short-lived WebSocket ticket endpoint — issue a 30-second ticket to authenticated staff
  app.post("/api/staff/ws-ticket", requireStaffKey, (_req, res) => {
    const ticket = randomUUID();
    staffWsTickets.set(ticket, Date.now() + 30_000);
    // Prune expired tickets lazily
    for (const [t, exp] of staffWsTickets) { if (Date.now() > exp) staffWsTickets.delete(t); }
    res.json({ ticket });
  });

  // Staff tablet WebSocket — Clerk-authenticated browsers use ?ticket=<uuid>;
  // tablet/integration callers may use X-STAFF-KEY header or ?key= query param
  const wssStaff = new WebSocketServer({
    noServer: true,
    verifyClient: (info, done) => {
      const params = new URL(info.req.url || "", "http://localhost").searchParams;

      // 1. One-time ticket (issued by /api/staff/ws-ticket after Clerk auth)
      const ticket = params.get("ticket");
      if (ticket && staffWsTickets.has(ticket)) {
        const exp = staffWsTickets.get(ticket)!;
        staffWsTickets.delete(ticket); // consume immediately
        if (Date.now() <= exp) return done(true);
      }

      // 2. Legacy X-STAFF-KEY — header or ?key= (tablet / ConcordiaCare integration)
      const staffKey = process.env.STAFF_API_KEY;
      if (staffKey) {
        const headerKey = info.req.headers["x-staff-key"] as string | undefined;
        const urlKey = params.get("key") || undefined;
        if (headerKey === staffKey || urlKey === staffKey) return done(true);
      }

      done(false, 401, "Unauthorized");
    },
  });

  // Route application WebSocket upgrades explicitly. Multiple WebSocketServer
  // instances attached directly to the same HTTP server can reject upgrades
  // intended for Vite HMR before Vite sees them.
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    const target = pathname === "/ws/admin"
      ? wss
      : pathname === "/ws/staff"
        ? wssStaff
        : null;

    if (!target) return;
    target.handleUpgrade(request, socket, head, (webSocket) => {
      target.emit("connection", webSocket, request);
    });
  });

  wssStaff.on("connection", (ws) => {
    staffConnections.add(ws);
    console.log("[Staff WS] Connected. Total:", staffConnections.size);
    ws.on("close", () => {
      staffConnections.delete(ws);
      console.log("[Staff WS] Disconnected. Total:", staffConnections.size);
    });
    ws.on("error", () => staffConnections.delete(ws));
  });
  
  // ── Sync outbox retry worker ─────────────────────────────────────────────
  // Retries failed outbound ConcordiaCare pushes with exponential back-off.
  // Delays: 1 m, 2 m, 4 m, 8 m, 16 m — permanently marks failed after 5 attempts.
  const OUTBOX_RETRY_DELAYS_MS = [60_000, 120_000, 240_000, 480_000, 960_000];

  setInterval(async () => {
    try {
      const pending = await storage.getPendingSyncOutboxEntries();
      for (const entry of pending) {
        try {
          if (entry.endpoint === STAFF_ORDER_WEBHOOK) {
            await deliverStaffWebhook(entry);
            continue;
          }
          if (entry.method === "POST" && entry.endpoint.endsWith("/api/external/create-blister-pack")) {
            const saved = entry.payload;
            const localId = saved && typeof saved === "object" && !Array.isArray(saved)
              ? Number((saved as Record<string, unknown>)[BLISTER_OUTBOX_PATIENT_ID]) : NaN;
            const body = saved && typeof saved === "object" && !Array.isArray(saved)
              ? { ...saved } as Record<string, unknown> : {};
            delete body[BLISTER_OUTBOX_PATIENT_ID];
            if (!Number.isSafeInteger(localId) || localId < 1 || !isValidBlisterCreatePayload(body)) {
              // Old queued creates lack a receiver-enforced enrollment ID.
              await storage.markSyncOutboxFailed(entry.id, "Legacy or invalid create; staff reconciliation required");
              continue;
            }
            const enrollment = await storage.getBlisterPackPatient(localId);
            if (!enrollment || enrollment.pharmacyEnrollmentId !== body.pharmacyEnrollmentId) {
              await storage.markSyncOutboxFailed(entry.id, "Enrollment identity mismatch; staff review required");
              continue;
            }
            if (enrollment.concordiaCareBlisterPackId) {
              await storage.markSyncOutboxDelivered(entry.id);
              continue;
            }
            const partnerKey = getConcordiaCareApiKey();
            if (!partnerKey) {
              await storage.markSyncOutboxFailed(entry.id, "Partner key unavailable; staff review required");
              continue;
            }
            const delivery = await postBlisterCreate(entry.endpoint, partnerKey, body);
            if (delivery.kind === "accepted") {
              await storage.updateBlisterPackSyncMeta(localId, {
                concordiaCareBlisterPackId: delivery.blisterPackId,
                lastSyncedToApp: new Date(),
              });
              await storage.markSyncOutboxDelivered(entry.id);
              await completeRequest(BLISTER_CREATE_SCOPE, String(localId), 200, { blisterPackId: delivery.blisterPackId });
            } else if (delivery.kind === "rejected") {
              await storage.markSyncOutboxFailed(entry.id,
                `Create rejected (HTTP ${delivery.status}${delivery.code ? `, ${delivery.code}` : ""}); staff review required`);
            } else if (delivery.kind === "invalid_response") {
              await storage.markSyncOutboxFailed(entry.id, "Create accepted without blisterPackId; staff review required");
            } else {
              const nextAttempt = entry.attempts + 1;
              const reason = delivery.status ? `HTTP ${delivery.status}` : "Create response timed out or unavailable";
              if (nextAttempt >= entry.maxAttempts) {
                await storage.markSyncOutboxFailed(entry.id, `${reason}; staff review required`);
              } else {
                const delayMs = OUTBOX_RETRY_DELAYS_MS[nextAttempt] ?? OUTBOX_RETRY_DELAYS_MS[OUTBOX_RETRY_DELAYS_MS.length - 1];
                await storage.incrementSyncOutboxAttempt(entry.id, new Date(Date.now() + delayMs), reason);
              }
            }
            continue;
          }
          const apiKey = getConcordiaCareApiKey() || "";
          if (!entry.payload || typeof entry.payload !== "object" || Array.isArray(entry.payload)) {
            await storage.markSyncOutboxFailed(entry.id, "Invalid stored sync payload");
            continue;
          }
          const outgoingPayload = { ...entry.payload } as Record<string, unknown>;
          const resp = await fetch(entry.endpoint, {
            method: entry.method,
            headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
            body: JSON.stringify(outgoingPayload),
          });
          if (resp.ok) {
            await storage.markSyncOutboxDelivered(entry.id);
            console.log(`[ConcordiaCare Outbox] Delivered ${entry.method} ${entry.endpoint} (attempt ${entry.attempts + 1})`);
          } else if (
            isPermanentConcordiaCareAuthFailure(resp.status) ||
            isPermanentBlisterSyncFailure(resp.status, entry.endpoint)
          ) {
            await storage.markSyncOutboxFailed(entry.id, `HTTP ${resp.status}: request requires configuration or staff review`);
            console.error(`[ConcordiaCare Outbox] Non-retryable response (${resp.status}) for ${entry.endpoint}; marked failed`);
          } else {
            const errText = await resp.text().catch(() => "");
            const nextAttempt = entry.attempts + 1;
            if (nextAttempt >= entry.maxAttempts) {
              await storage.markSyncOutboxFailed(entry.id, `HTTP ${resp.status}: ${errText.slice(0, 300)}`);
              console.error(`[ConcordiaCare Outbox] Permanently failed ${entry.endpoint} after ${nextAttempt} attempts`);
            } else {
              const delayMs = OUTBOX_RETRY_DELAYS_MS[nextAttempt] ?? OUTBOX_RETRY_DELAYS_MS[OUTBOX_RETRY_DELAYS_MS.length - 1];
              await storage.incrementSyncOutboxAttempt(entry.id, new Date(Date.now() + delayMs), `HTTP ${resp.status}: ${errText.slice(0, 300)}`);
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const nextAttempt = entry.attempts + 1;
          if (nextAttempt >= entry.maxAttempts) {
            await storage.markSyncOutboxFailed(entry.id, errMsg);
          } else {
            const delayMs = OUTBOX_RETRY_DELAYS_MS[nextAttempt] ?? OUTBOX_RETRY_DELAYS_MS[OUTBOX_RETRY_DELAYS_MS.length - 1];
            await storage.incrementSyncOutboxAttempt(entry.id, new Date(Date.now() + delayMs), errMsg);
          }
        }
      }
    } catch (err) {
      console.error("[ConcordiaCare Outbox] Worker error:", err instanceof Error ? err.message : err);
    }
  }, 60_000);

  // ── Inventory consistency cron ──────────────────────────────────────────
  // Runs hourly. Clamps any negative stock to 0 and keeps the inStock flag
  // in sync with stock_quantity > 0 across all products.
  setInterval(async () => {
    try {
      await db.execute(
        sql`UPDATE products
            SET
              stock_quantity = GREATEST(stock_quantity, 0),
              in_stock       = (GREATEST(stock_quantity, 0) > 0),
              updated_at     = NOW()
            WHERE stock_quantity < 0
               OR in_stock != (stock_quantity > 0)`
      );
      console.log("[Inventory] Hourly consistency check complete");
    } catch (err) {
      console.error("[Inventory] Consistency check error:", err instanceof Error ? err.message : err);
    }
  }, 60 * 60 * 1000);

  // ── Admin sync-outbox read-only endpoint ────────────────────────────────
  app.get("/api/admin/sync-outbox", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const entries = await storage.getRecentSyncOutboxEntries(100);
      // Never send the stored payload or upstream error body to a browser:
      // both can contain patient data. This is an operational projection.
      res.json(entries.map((entry) => {
        let path = "";
        try { path = new URL(entry.endpoint).pathname; } catch { /* legacy malformed endpoint */ }
        const staffOrder = path.endsWith("/api/public/orders") || path.endsWith("/api/public/webhooks/new-order");
        const operation = staffOrder ? "Staff order submission"
          : path.endsWith("/create-blister-pack") ? "Blister pack create"
          : path.includes("/blister-pack/") ? "Blister pack update"
          : path.endsWith("/sync-medications") ? "Medication sync"
          : path.endsWith("/order-status-update") ? "Order status update"
          : "Other ConcordiaCare sync";
        const httpStatus = entry.lastError?.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
        return {
          id: entry.id, operation, destination: staffOrder ? "Staff app" : "ConcordiaCare", method: entry.method,
          orderNumber: staffOrder && typeof (entry.payload as Record<string, unknown>)?.orderNumber === "string"
            ? (entry.payload as Record<string, unknown>).orderNumber : null,
          status: entry.status, attempts: entry.attempts,
          createdAt: entry.createdAt,
          errorSummary: httpStatus ? `HTTP ${httpStatus}` : entry.lastError
            ? (staffOrder && [
                "Staff integration not configured", "Staff product mapping needs review",
                "Staff product lookup failed", "Staff acknowledgment pending",
                "Staff acknowledgment missing or mismatched", "Staff order delivery uncertain",
              ].includes(entry.lastError) ? entry.lastError : "Delivery attempt failed") : null,
        };
      }));
    } catch (error) {
      console.error("Error fetching sync outbox:", error);
      res.status(500).json({ message: "Failed to fetch sync outbox" });
    }
  });

  wss.on("connection", (ws) => {
    adminConnections.add(ws);
    console.log("Admin WebSocket connected. Total connections:", adminConnections.size);
    
    ws.on("close", () => {
      adminConnections.delete(ws);
      console.log("Admin WebSocket disconnected. Total connections:", adminConnections.size);
    });
    
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      adminConnections.delete(ws);
    });
  });

  // Initialize PointsService with admin connections for real-time broadcasts
  PointsService.setAdminConnections(adminConnections);

  // ==========================================
  // DOCTOR PARTNER ROUTES (Find Your Doctor quiz)
  // ==========================================
  app.get("/api/doctor-partners", async (_req, res) => {
    try {
      const partners = await storage.getAllDoctorPartners(true);
      res.json(partners);
    } catch (error) {
      console.error("Error fetching doctor partners:", error);
      res.status(500).json({ message: "Failed to fetch doctor partners" });
    }
  });

  const matchSchema = z.object({
    specialty: z.string().min(1),
    language: z.string().min(1),
    genderPreference: z.string().min(1),
    borough: z.string().min(1).default("any"),
  });

  app.post("/api/find-doctor/match", async (req, res) => {
    try {
      const criteria = matchSchema.parse(req.body);
      const matches = await storage.matchDoctorPartners(criteria);
      const requestToken = randomBytes(24).toString("base64url");
      const lead = await storage.createDoctorMatchLead({
        specialty: criteria.specialty,
        language: criteria.language,
        genderPreference: criteria.genderPreference,
        borough: criteria.borough,
        requestToken,
      });
      res.json({ matches, leadId: lead.id, requestToken });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid match criteria", errors: error.errors });
      }
      console.error("Error matching doctors:", error);
      res.status(500).json({ message: "Failed to find matches" });
    }
  });

  const selectSchema = z.object({
    leadId: z.number().int().positive(),
    requestToken: z.string().min(8).max(128),
    doctorId: z.number().int().positive(),
  });
  app.post("/api/find-doctor/select", async (req, res) => {
    try {
      const { leadId, requestToken, doctorId } = selectSchema.parse(req.body);
      const lead = await storage.getDoctorMatchLeadById(leadId);
      if (!lead || !lead.requestToken || lead.requestToken !== requestToken) {
        return res.status(404).json({ message: "Lead not found" });
      }
      const updated = await storage.updateDoctorMatchLeadSelection(leadId, doctorId);
      if (!updated) return res.status(404).json({ message: "Lead not found" });
      res.json({ success: true, lead: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid selection", errors: error.errors });
      }
      console.error("Error saving doctor selection:", error);
      res.status(500).json({ message: "Failed to save selection" });
    }
  });

  app.get("/api/admin/doctor-partners", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const partners = await storage.getAllDoctorPartners(false);
      res.json(partners);
    } catch (error) {
      console.error("Error fetching doctor partners (admin):", error);
      res.status(500).json({ message: "Failed to fetch doctor partners" });
    }
  });

  app.post("/api/admin/doctor-partners/photo", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { uploadUrl } = z.object({ uploadUrl: z.string().min(1) }).parse(req.body);
      const adminId = req.user?.claims?.sub || "system";
      const normalizedUrl = await objectStorageService.trySetObjectEntityAclPolicy(
        uploadUrl,
        { visibility: "public", owner: adminId }
      );
      res.json({ photoUrl: normalizedUrl });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error normalizing doctor photo URL:", error);
      res.status(500).json({ message: "Failed to set photo" });
    }
  });

  app.post("/api/admin/doctor-partners", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const data = insertDoctorPartnerSchema.parse(req.body);
      const created = await storage.createDoctorPartner(data);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating doctor partner:", error);
      res.status(500).json({ message: "Failed to create doctor partner" });
    }
  });

  app.patch("/api/admin/doctor-partners/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const data = insertDoctorPartnerSchema.partial().parse(req.body);
      const updated = await storage.updateDoctorPartner(id, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating doctor partner:", error);
      res.status(500).json({ message: "Failed to update doctor partner" });
    }
  });

  app.delete("/api/admin/doctor-partners/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await storage.deleteDoctorPartner(id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ message: "Deleted" });
    } catch (error) {
      console.error("Error deleting doctor partner:", error);
      res.status(500).json({ message: "Failed to delete doctor partner" });
    }
  });

  const requestSchema = z.object({
    leadId: z.number().int().positive(),
    requestToken: z.string().min(8).max(128),
    doctorId: z.number().int().positive().optional(),
    patientName: z.string().trim().min(1, "Name is required").max(120),
    patientPhone: z.string().trim().min(7, "Phone is required").max(40),
    patientEmail: z.string().trim().email("Invalid email").max(160).optional().or(z.literal("")),
    preferredTime: z.string().trim().max(100).optional().or(z.literal("")),
    preferredDays: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).max(7).optional(),
    preferredTimesOfDay: z.array(z.enum(["Morning", "Afternoon", "Evening"])).max(3).optional(),
    patientNotes: z.string().trim().max(1000).optional().or(z.literal("")),
  });
  app.post("/api/find-doctor/request", async (req, res) => {
    try {
      const data = requestSchema.parse(req.body);
      const lead = await storage.getDoctorMatchLeadById(data.leadId);
      if (!lead || !lead.requestToken || lead.requestToken !== data.requestToken) {
        return res.status(404).json({ message: "Lead not found" });
      }
      if (lead.requestedAt) {
        return res.status(409).json({ message: "Request already submitted for this lead" });
      }
      const updated = await storage.submitDoctorMatchRequest(data.leadId, {
        patientName: data.patientName,
        patientPhone: data.patientPhone,
        patientEmail: data.patientEmail || null,
        preferredTime: data.preferredTime || null,
        preferredDays: data.preferredDays && data.preferredDays.length > 0
          ? [...new Set(data.preferredDays)].sort((a, b) =>
              ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(a) - ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(b)
            )
          : null,
        preferredTimesOfDay: data.preferredTimesOfDay && data.preferredTimesOfDay.length > 0
          ? [...new Set(data.preferredTimesOfDay)].sort((a, b) =>
              ["Morning","Afternoon","Evening"].indexOf(a) - ["Morning","Afternoon","Evening"].indexOf(b)
            )
          : null,
        patientNotes: data.patientNotes || null,
        selectedDoctorId: data.doctorId ?? null,
      });
      if (!updated) return res.status(404).json({ message: "Lead not found" });

      console.log(
        `[FindDoctor] New patient request received — leadId=${updated.id}` +
          ` doctorId=${updated.selectedDoctorId ?? "unselected"}` +
          ` (PII redacted; view full record in admin Doctor Match Leads)`
      );

      // Fire-and-forget notification to pharmacy team (and optionally doctor's office).
      // Recipients and the CC-doctor-office toggle are managed from the admin
      // Notification Settings page, with the legacy env vars as a fallback.
      // Failures must not break the patient-facing request flow.
      void (async () => {
        try {
          // 1. Resolve recipients: active DB recipients first, env var fallback for email.
          let pharmacyRecipients: string[] = [];
          let smsRecipients: Array<{ address: string; label: string | null }> = [];
          try {
            const dbRecipients = await storage.getNotificationRecipients("doctor_intro_request");
            pharmacyRecipients = dbRecipients
              .filter((r) => r.isActive && r.channel === "email")
              .map((r) => r.address);
            smsRecipients = dbRecipients
              .filter((r) => r.isActive && r.channel === "sms")
              .map((r) => ({ address: r.address, label: r.label ?? null }));
          } catch (lookupErr) {
            console.error(
              "[FindDoctor] Failed to load notification recipients from DB:",
              lookupErr
            );
          }
          if (pharmacyRecipients.length === 0) {
            pharmacyRecipients = (process.env.PHARMACY_TEAM_EMAIL || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }

          if (pharmacyRecipients.length === 0 && smsRecipients.length === 0) {
            console.warn(
              "[FindDoctor] No notification recipients configured (DB or PHARMACY_TEAM_EMAIL); skipping notification"
            );
            return;
          }

          let doctor: Awaited<ReturnType<typeof storage.getDoctorPartner>> | undefined;
          if (updated.selectedDoctorId) {
            doctor = await storage.getDoctorPartner(updated.selectedDoctorId);
          }

          // 2. Resolve CC-doctor-office toggle: DB setting first, env var fallback.
          let ccDoctor = false;
          try {
            const ccSetting = await storage.getNotificationSetting(
              "doctor_intro_cc_doctor_office"
            );
            ccDoctor =
              ccSetting?.settingValue != null
                ? ccSetting.settingValue === "true"
                : (process.env.NOTIFY_DOCTOR_OFFICE || "").toLowerCase() === "true";
          } catch (settingErr) {
            console.error(
              "[FindDoctor] Failed to load CC doctor office setting:",
              settingErr
            );
            ccDoctor = (process.env.NOTIFY_DOCTOR_OFFICE || "").toLowerCase() === "true";
          }
          const cc = ccDoctor && doctor?.email ? [doctor.email] : undefined;

          const doctorName = doctor
            ? `${doctor.title || ""} ${doctor.firstName} ${doctor.lastName}`.trim()
            : "(no doctor selected)";
          const doctorContact = doctor
            ? [doctor.specialty, doctor.phone, doctor.email, doctor.address]
                .filter(Boolean)
                .join(" • ")
            : "—";

          const rows: Array<[string, string]> = [
            ["Patient name", updated.patientName || "—"],
            ["Phone", updated.patientPhone || "—"],
            ["Email", updated.patientEmail || "—"],
            ["Preferred time", updated.preferredTime || "—"],
            ...(updated.preferredTimesOfDay && updated.preferredTimesOfDay.length > 0
              ? [["Time of day", updated.preferredTimesOfDay.join(", ")] as [string, string]]
              : []),
            ...(updated.preferredDays && updated.preferredDays.length > 0
              ? [["Preferred days", updated.preferredDays.join(", ")] as [string, string]]
              : []),
            ["Specialty", updated.specialty || "—"],
            ["Language", updated.language || "—"],
            ["Borough", updated.borough || "—"],
            ["Chosen doctor", doctorName],
            ["Doctor contact", doctorContact],
            ["Lead ID", String(updated.id)],
          ];

          const html = `
            <div style="font-family: Arial, sans-serif; color: #111;">
              <h2 style="margin:0 0 12px;">New doctor intro request</h2>
              <p style="margin:0 0 16px;">A patient just submitted a request through ConcordiaCare's Find a Doctor flow.</p>
              <table style="border-collapse:collapse;font-size:14px;">
                ${rows
                  .map(
                    ([label, value]) => `
                    <tr>
                      <td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td>
                      <td style="padding:6px 0;">${escapeHtml(String(value))}</td>
                    </tr>`
                  )
                  .join("")}
              </table>
              ${
                updated.patientNotes
                  ? `<p style="margin:16px 0 4px;color:#555;"><strong>Patient notes</strong></p>
                     <p style="margin:0;white-space:pre-wrap;">${escapeHtml(updated.patientNotes)}</p>`
                  : ""
              }
              <p style="margin-top:24px;color:#777;font-size:12px;">View the full record in the admin Doctor Match Leads view.</p>
            </div>
          `;

          const textLines = [
            "New doctor intro request",
            "",
            ...rows.map(([k, v]) => `${k}: ${v}`),
          ];
          if (updated.patientNotes) {
            textLines.push("", `Patient notes: ${updated.patientNotes}`);
          }

          if (pharmacyRecipients.length > 0) {
            const result = await sendEmail({
              to: pharmacyRecipients,
              cc,
              subject: `New doctor intro request — ${updated.patientName || "patient"} → ${doctorName}`,
              html,
              text: textLines.join("\n"),
              replyTo: updated.patientEmail || undefined,
            });

            if (result.ok) {
              console.log(
                `[FindDoctor] Notification email sent (id=${result.id ?? "?"}) to ${pharmacyRecipients.length} recipient(s)${cc ? ` cc=${cc.length}` : ""}`
              );
            } else {
              console.error(
                `[FindDoctor] Notification email failed: ${result.error || "unknown error"}`
              );
            }
          }

          if (smsRecipients.length > 0) {
            const smsBody = [
              `ConcordiaCare: new doctor intro request`,
              `Patient: ${updated.patientName || "—"} (${updated.patientPhone || "no phone"})`,
              `Doctor: ${doctorName}`,
              updated.specialty ? `Specialty: ${updated.specialty}` : null,
              updated.preferredTime ? `Preferred: ${updated.preferredTime}` : null,
              updated.preferredTimesOfDay && updated.preferredTimesOfDay.length > 0
                ? `Time: ${updated.preferredTimesOfDay.join(", ")}`
                : null,
              updated.preferredDays && updated.preferredDays.length > 0
                ? `Days: ${updated.preferredDays.join(", ")}`
                : null,
              `Lead #${updated.id}`,
            ]
              .filter(Boolean)
              .join("\n");

            const smsResults = await Promise.all(
              smsRecipients.map((r) =>
                sendSms({ to: r.address, body: smsBody }).then((res) => ({
                  recipient: r,
                  res,
                }))
              )
            );
            const sent = smsResults.filter((s) => s.res.ok).length;
            const skipped = smsResults.filter((s) => s.res.skipped).length;
            const failed = smsResults.filter((s) => !s.res.ok && !s.res.skipped);
            console.log(
              `[FindDoctor] Notification SMS: sent=${sent} skipped=${skipped} failed=${failed.length} of ${smsRecipients.length}`
            );
            for (const f of failed) {
              console.error(
                `[FindDoctor] SMS to ${f.recipient.label || f.recipient.address} failed: ${f.res.error || "unknown"}`
              );
            }
          }
        } catch (notifyErr) {
          console.error("[FindDoctor] Notification email threw:", notifyErr);
        }
      })();

      // Fire-and-forget patient confirmation email.
      // Silently skipped if the patient did not provide an email address.
      if (updated.patientEmail) {
        void (async () => {
          try {
            let doctor: Awaited<ReturnType<typeof storage.getDoctorPartner>> | undefined;
            if (updated.selectedDoctorId) {
              doctor = await storage.getDoctorPartner(updated.selectedDoctorId);
            }
            const doctorName = doctor
              ? `${doctor.title || ""} ${doctor.firstName} ${doctor.lastName}`.trim()
              : null;

            const preferredScheduleParts: string[] = [];
            if (updated.preferredTimesOfDay && updated.preferredTimesOfDay.length > 0) {
              preferredScheduleParts.push(updated.preferredTimesOfDay.join(", "));
            }
            if (updated.preferredDays && updated.preferredDays.length > 0) {
              preferredScheduleParts.push(updated.preferredDays.join(", "));
            }
            if (updated.preferredTime && preferredScheduleParts.length === 0) {
              preferredScheduleParts.push(updated.preferredTime);
            }
            const preferredSchedule = preferredScheduleParts.join(" · ") || "Not specified";

            const patientFirstName = (updated.patientName ? updated.patientName.trim().split(/\s+/)[0] : "") || "there";
            const safePatientFirstName = escapeHtml(patientFirstName);
            const safeDoctorName = doctorName ? escapeHtml(doctorName) : null;
            const safeSpecialty = escapeHtml(doctor?.specialty || updated.specialty || "") || null;
            const safeBorough = escapeHtml(doctor?.borough || (updated.borough !== "any" ? updated.borough : "") || "") || null;
            const safePhone = doctor?.phone ? escapeHtml(doctor.phone) : null;
            const safeSchedule = escapeHtml(preferredSchedule);
            const safeNotes = updated.patientNotes ? escapeHtml(updated.patientNotes) : null;

            // Load customizable template copy from storage (falls back to defaults if not set)
            const [responseTimeSetting, footerNoteSetting, subjectSetting, greetingSetting] = await Promise.all([
              storage.getNotificationSetting("patient_confirm_email_response_time"),
              storage.getNotificationSetting("patient_confirm_email_footer_note"),
              storage.getNotificationSetting("patient_confirm_email_subject"),
              storage.getNotificationSetting("patient_confirm_email_greeting"),
            ]);
            const responseTime = responseTimeSetting?.settingValue ?? "24 business hours";
            const footerNote = footerNoteSetting?.settingValue ?? "This is an automated confirmation from ConcordiaCare. Please do not reply to this email.";
            const emailSubject = subjectSetting?.settingValue ?? "Your ConcordiaCare doctor request was received";
            const greeting = greetingSetting?.settingValue ?? "Hi";
            const safeResponseTime = escapeHtml(responseTime);
            const safeFooterNote = escapeHtml(footerNote);
            const safeGreeting = escapeHtml(greeting);

            const patientConfirmHtml = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
                <div style="background:#1a6b5c;padding:24px 32px;border-radius:8px 8px 0 0;">
                  <h1 style="color:#fff;margin:0;font-size:22px;">Your Doctor Request Was Received</h1>
                </div>
                <div style="background:#f9f9f9;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;border-top:none;">
                  <p style="margin-top:0;">${safeGreeting} ${safePatientFirstName},</p>
                  <p>Thank you for submitting your doctor introduction request through ConcordiaCare. We have received your information and our team will be in touch within <strong>${safeResponseTime}</strong>.</p>
                  <h2 style="font-size:16px;margin-bottom:8px;color:#1a6b5c;">Your Request Summary</h2>
                  <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    ${safeDoctorName ? `
                    <tr>
                      <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;width:40%;">Doctor</td>
                      <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">${safeDoctorName}</td>
                    </tr>` : ""}
                    ${safeSpecialty ? `
                    <tr>
                      <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Specialty</td>
                      <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">${safeSpecialty}</td>
                    </tr>` : ""}
                    ${safeBorough ? `
                    <tr>
                      <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;">Location</td>
                      <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">${safeBorough}</td>
                    </tr>` : ""}
                    ${safePhone ? `
                    <tr>
                      <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Doctor's Office Phone</td>
                      <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">${safePhone}</td>
                    </tr>` : ""}
                    <tr>
                      <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;font-weight:bold;">Preferred Schedule</td>
                      <td style="padding:8px 12px;background:#fff;border:1px solid #e5e5e5;">${safeSchedule}</td>
                    </tr>
                    ${safeNotes ? `
                    <tr>
                      <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;font-weight:bold;">Your Notes</td>
                      <td style="padding:8px 12px;background:#f5f5f5;border:1px solid #e5e5e5;">${safeNotes}</td>
                    </tr>` : ""}
                  </table>
                  ${safePhone ? `<p style="margin-top:24px;">If you have any questions or need to reach the doctor's office directly, please use the phone number listed above.</p>` : `<p style="margin-top:24px;">If you have any questions, please don't hesitate to contact us.</p>`}
                  <p style="margin-bottom:0;color:#777;font-size:12px;">${safeFooterNote}</p>
                </div>
              </div>
            `;

            const patientConfirmText = [
              "Your Doctor Request Was Received",
              "",
              `${greeting} ${patientFirstName},`,
              "",
              "Thank you for submitting your doctor introduction request through ConcordiaCare.",
              `Our team will be in touch within ${responseTime}.`,
              "",
              "Your Request Summary",
              "-------------------",
              ...(doctorName ? [`Doctor: ${doctorName}`] : []),
              ...((doctor?.specialty || updated.specialty) ? [`Specialty: ${doctor?.specialty || updated.specialty}`] : []),
              ...((doctor?.borough || (updated.borough !== "any" ? updated.borough : "")) ? [`Location: ${doctor?.borough || updated.borough}`] : []),
              ...(doctor?.phone ? [`Doctor's Office Phone: ${doctor.phone}`] : []),
              `Preferred Schedule: ${preferredSchedule}`,
              ...(updated.patientNotes ? [`Your Notes: ${updated.patientNotes}`] : []),
              "",
              footerNote,
            ].join("\n");

            const result = await sendEmail({
              to: updated.patientEmail ?? "",
              subject: emailSubject,
              html: patientConfirmHtml,
              text: patientConfirmText,
            });

            if (result.ok) {
              console.log(
                `[FindDoctor] Patient confirmation email sent (id=${result.id ?? "?"}) to ${updated.patientEmail}`
              );
            } else {
              console.error(
                `[FindDoctor] Patient confirmation email failed: ${result.error || "unknown error"}`
              );
            }
          } catch (confirmErr) {
            console.error("[FindDoctor] Patient confirmation email threw:", confirmErr);
          }
        })();
      }

      // Fire-and-forget SMS notification to pharmacy team.
      // Failures must not break the patient-facing request flow.
      void (async () => {
        try {
          const smsRecipients = (process.env.PHARMACY_TEAM_SMS || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          if (smsRecipients.length === 0) {
            console.warn(
              "[FindDoctor] PHARMACY_TEAM_SMS not configured; skipping notification SMS"
            );
            return;
          }

          let doctor: Awaited<ReturnType<typeof storage.getDoctorPartner>> | undefined;
          if (updated.selectedDoctorId) {
            doctor = await storage.getDoctorPartner(updated.selectedDoctorId);
          }
          const doctorName = doctor
            ? `${doctor.title || ""} ${doctor.firstName} ${doctor.lastName}`.trim()
            : "(no doctor selected)";

          const smsLines = [
            "ConcordiaCare: New doctor intro request",
            `Patient: ${updated.patientName || "—"}`,
            `Phone: ${updated.patientPhone || "—"}`,
            updated.preferredTime ? `Preferred: ${updated.preferredTime}` : null,
            updated.preferredTimesOfDay && updated.preferredTimesOfDay.length > 0
              ? `Time: ${updated.preferredTimesOfDay.join(", ")}`
              : null,
            updated.preferredDays && updated.preferredDays.length > 0
              ? `Days: ${updated.preferredDays.join(", ")}`
              : null,
            `Doctor: ${doctorName}`,
            `Lead #${updated.id}`,
          ].filter(Boolean);
          const smsBody = smsLines.join("\n");

          const smsResult = await sendSms({
            to: smsRecipients,
            body: smsBody,
          });

          if (smsResult.ok) {
            console.log(
              `[FindDoctor] Notification SMS sent to ${smsRecipients.length} recipient(s) (sids=${(smsResult.ids || []).join(",") || "?"})${smsResult.error ? ` warning=${smsResult.error}` : ""}`
            );
          } else if (smsResult.skipped) {
            console.warn(
              `[FindDoctor] Notification SMS skipped: ${smsResult.error || "not configured"}`
            );
          } else {
            console.error(
              `[FindDoctor] Notification SMS failed: ${smsResult.error || "unknown error"}`
            );
          }
        } catch (notifyErr) {
          console.error("[FindDoctor] Notification SMS threw:", notifyErr);
        }
      })();

      res.json({ success: true, lead: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      console.error("Error submitting doctor request:", error);
      res.status(500).json({ message: "Failed to submit request" });
    }
  });

  app.get("/api/admin/doctor-match-leads", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const leads = await storage.getDoctorMatchLeads();
      res.json(leads);
    } catch (error) {
      console.error("Error fetching match leads:", error);
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  // ===== ADMIN: Patient structured conditions (Care Navigator) =====

  app.get("/api/admin/patients/:id/conditions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const conditions = await storage.getPatientConditions(req.params.id);
      // HIPAA audit log — admin reading a patient's condition list (PHI access)
      const adminUser = req.user as any;
      await storage.createAuditLog({
        userId: adminUser?.id ?? null,
        actionType: "view",
        entityType: "patient_condition",
        entityId: req.params.id,
        newValue: { subAction: "admin_conditions_list", patientId: req.params.id, count: conditions.length, source: "admin_dashboard" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(conditions);
    } catch (error) {
      console.error("[Admin] Error fetching patient conditions:", error);
      res.status(500).json({ message: "Failed to fetch patient conditions" });
    }
  });

  // ===== EXTERNAL API: Care Navigator (ConcordiaCare mobile app) =====

  // List conditions for a patient
  app.get("/api/external/care-navigator/patients/:userId/conditions", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const conditions = await storage.getPatientConditions(user.id);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: user.id,
        newValue: { subAction: "list", count: conditions.length, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(conditions);
    } catch (error) {
      console.error("[External] Error fetching conditions:", error);
      res.status(500).json({ message: "Failed to fetch conditions" });
    }
  });

  // Create a condition
  app.post("/api/external/care-navigator/patients/:userId/conditions", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const parsed = insertPatientConditionSchema.parse({ ...req.body, userId: user.id });
      const condition = await storage.createPatientCondition(parsed);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "create",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { conditionName: condition.conditionName, icd10Code: condition.icd10Code, status: condition.status, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.status(201).json(condition);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0].message });
      console.error("[External] Error creating condition:", error);
      res.status(500).json({ message: "Failed to create condition" });
    }
  });

  // Update a condition
  app.patch("/api/external/care-navigator/patients/:userId/conditions/:conditionId", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const existing = await storage.getPatientCondition(req.params.conditionId);
      if (!existing || existing.userId !== user.id) return res.status(404).json({ message: "Condition not found" });
      // Whitelist mutable fields — explicitly strip userId to prevent cross-patient reassignment (IDOR)
      const MUTABLE_CONDITION_FIELDS = insertPatientConditionSchema.pick({
        conditionName: true,
        icd10Code: true,
        diagnosedAt: true,
        notes: true,
        status: true,
      }).partial();
      const updates = MUTABLE_CONDITION_FIELDS.parse(req.body);
      const updated = await storage.updatePatientCondition(req.params.conditionId, updates);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "update",
        entityType: "patient_condition",
        entityId: req.params.conditionId,
        oldValue: { conditionName: existing.conditionName, status: existing.status },
        newValue: { ...updates, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0].message });
      console.error("[External] Error updating condition:", error);
      res.status(500).json({ message: "Failed to update condition" });
    }
  });

  // Delete a condition
  app.delete("/api/external/care-navigator/patients/:userId/conditions/:conditionId", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const existing = await storage.getPatientCondition(req.params.conditionId);
      if (!existing || existing.userId !== user.id) return res.status(404).json({ message: "Condition not found" });
      await storage.deletePatientCondition(req.params.conditionId);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "delete",
        entityType: "patient_condition",
        entityId: req.params.conditionId,
        oldValue: { conditionName: existing.conditionName, icd10Code: existing.icd10Code, status: existing.status },
        newValue: { source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.status(204).end();
    } catch (error) {
      console.error("[External] Error deleting condition:", error);
      res.status(500).json({ message: "Failed to delete condition" });
    }
  });

  // List journal entries
  app.get("/api/external/care-navigator/patients/:userId/journal", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const limit = Math.min(parseInt(req.query.limit as string) || 30, 90);
      const offset = parseInt(req.query.offset as string) || 0;
      const conditionId = req.query.conditionId as string | undefined;
      const entries = await storage.getHealthJournalEntries(user.id, { conditionId, limit, offset });
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "health_journal_entry",
        entityId: user.id,
        newValue: { subAction: "list", count: entries.length, conditionId: conditionId ?? null, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.json({ entries, limit, offset, count: entries.length });
    } catch (error) {
      console.error("[External] Error fetching journal:", error);
      res.status(500).json({ message: "Failed to fetch journal entries" });
    }
  });

  // Create journal entry
  app.post("/api/external/care-navigator/patients/:userId/journal", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const parsed = insertHealthJournalEntrySchema.parse({ ...req.body, userId: user.id });
      const entry = await storage.createHealthJournalEntry(parsed);
      await storage.createAuditLog({
        userId: user.id,
        actionType: "create",
        entityType: "health_journal_entry",
        entityId: entry.id,
        newValue: { conditionId: entry.conditionId ?? null, entryDate: entry.entryDate, symptomSeverity: entry.symptomSeverity, mood: entry.mood, energyLevel: entry.energyLevel, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      res.status(201).json(entry);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ message: error.errors[0].message });
      console.error("[External] Error creating journal entry:", error);
      res.status(500).json({ message: "Failed to create journal entry" });
    }
  });

  // AI condition explainer (cached)
  app.get("/api/external/care-navigator/patients/:userId/conditions/:conditionId/explain", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const condition = await storage.getPatientCondition(req.params.conditionId);
      if (!condition || condition.userId !== user.id) return res.status(404).json({ message: "Condition not found" });

      const explainer = await getConditionExplainer(condition.conditionName, condition.icd10Code);

      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { subAction: "explainer_accessed", conditionName: condition.conditionName, aiGenerated: true, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        conditionId: condition.id,
        conditionName: condition.conditionName,
        icd10Code: condition.icd10Code,
        explainer,
        disclaimer: "This content is AI-generated for educational purposes only and is not medical advice. Always consult your doctor or pharmacist before making any health decisions.",
      });
    } catch (error) {
      console.error("[External] Error generating explainer:", error);
      res.status(500).json({ message: "Failed to generate condition explainer" });
    }
  });

  // Prescriptions linked to a condition (by name matching)
  app.get("/api/external/care-navigator/patients/:userId/conditions/:conditionId/prescriptions", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const condition = await storage.getPatientCondition(req.params.conditionId);
      if (!condition || condition.userId !== user.id) return res.status(404).json({ message: "Condition not found" });

      const allRx = await storage.getPrescriptionsByUserId(user.id);
      const { linked, unlinked } = matchPrescriptionsToCondition(
        condition.conditionName,
        condition.icd10Code,
        allRx
      );

      // HIPAA audit log — reading linked prescription list for a condition
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { subAction: "linked_prescriptions_read", linkedCount: linked.length, unlinkedCount: unlinked.length, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        conditionId: condition.id,
        conditionName: condition.conditionName,
        icd10Code: condition.icd10Code,
        linked,
        unlinked,
        matchNote: "Linked prescriptions are automatically matched from pharmacy records using medication class and condition keywords. Always confirm with your prescriber.",
      });
    } catch (error) {
      console.error("[External] Error fetching linked prescriptions:", error);
      res.status(500).json({ message: "Failed to fetch linked prescriptions" });
    }
  });

  // Next steps / platform CTAs for a condition
  app.get("/api/external/care-navigator/patients/:userId/conditions/:conditionId/next-steps", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const condition = await storage.getPatientCondition(req.params.conditionId);
      if (!condition || condition.userId !== user.id) return res.status(404).json({ message: "Condition not found" });

      // HIPAA audit log — reading care navigation CTAs for a condition
      await storage.createAuditLog({
        userId: user.id,
        actionType: "view",
        entityType: "patient_condition",
        entityId: condition.id,
        newValue: { subAction: "next_steps_read", conditionName: condition.conditionName, source: "care_navigator_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      const steps = getNextSteps(condition.conditionName);
      res.json({
        conditionId: condition.id,
        conditionName: condition.conditionName,
        nextSteps: steps,
      });
    } catch (error) {
      console.error("[External] Error fetching next steps:", error);
      res.status(500).json({ message: "Failed to fetch next steps" });
    }
  });

  // ================================================================
  // ENGINE 1 — NDC Drug Info (OpenFDA enrichment)
  // ================================================================

  // GET /api/drugs/ndc/:ndc — look up drug info by NDC
  app.get("/api/drugs/ndc/:ndc", isAuthenticated, async (req, res) => {
    try {
      const { ndc } = req.params;
      if (!ndc) return res.status(400).json({ message: "NDC is required" });
      const info = await getDrugInfoByNdc(ndc);
      if (!info) return res.status(404).json({ message: "Drug not found for NDC: " + ndc });
      res.json(info);
    } catch (error) {
      console.error("[NDC] Lookup error:", error);
      res.status(500).json({ message: "Drug info lookup failed" });
    }
  });

  // POST /api/drugs/ndc/batch — batch NDC lookup
  app.post("/api/drugs/ndc/batch", isAuthenticated, async (req, res) => {
    try {
      const { ndcs } = req.body;
      if (!Array.isArray(ndcs) || ndcs.length === 0) {
        return res.status(400).json({ message: "ndcs array is required" });
      }
      if (ndcs.length > 50) return res.status(400).json({ message: "Maximum 50 NDCs per request" });
      const results = await batchEnrichNdcs(ndcs);
      res.json(Object.fromEntries(results));
    } catch (error) {
      console.error("[NDC] Batch error:", error);
      res.status(500).json({ message: "Batch drug lookup failed" });
    }
  });

  // GET /api/admin/drug-cache — admin view of cached NDC entries
  app.get("/api/admin/drug-cache", isAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "100")), 500);
      const offset = parseInt(String(req.query.offset ?? "0"));
      const rows = await storage.listDrugInfoCache(limit, offset);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to list drug cache" });
    }
  });

  // GET /api/external/drugs/ndc/:ndc — external API access (ConcordiaCare app)
  app.get("/api/external/drugs/ndc/:ndc", requireApiKey, async (req, res) => {
    try {
      const info = await getDrugInfoByNdc(req.params.ndc);
      if (!info) return res.status(404).json({ message: "Not found" });
      res.json(info);
    } catch (error) {
      res.status(500).json({ message: "Drug lookup failed" });
    }
  });

  // ================================================================
  // ENGINE 2 — Clinical Notes
  // ================================================================

  // GET /api/external/care-navigator/patients/:userId/clinical-notes
  app.get("/api/external/care-navigator/patients/:userId/clinical-notes", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });
      const notes = await storage.getClinicalNotes(req.params.userId, {
        limit: parseInt(String(req.query.limit ?? "50")),
        offset: parseInt(String(req.query.offset ?? "0")),
        status: req.query.status as string | undefined,
      });
      res.json({ userId: req.params.userId, notes });
    } catch (error) {
      console.error("[ClinicalNotes] List error:", error);
      res.status(500).json({ message: "Failed to fetch clinical notes" });
    }
  });

  // POST /api/external/care-navigator/patients/:userId/clinical-notes — generate note
  app.post("/api/external/care-navigator/patients/:userId/clinical-notes", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const schema = z.object({
        noteType: z.enum(["soap", "progress", "medication_review"]).default("soap"),
        conditionId: z.string().optional(),
        authorId: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const note = await createClinicalNote({
        userId: req.params.userId,
        noteType: body.noteType,
        conditionId: body.conditionId,
        authorId: body.authorId,
      });

      await storage.createAuditLog({
        userId: req.params.userId,
        actionType: "create",
        entityType: "clinical_note" as any,
        entityId: note.id,
        newValue: { noteType: body.noteType, aiGenerated: true },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.status(201).json(note);
    } catch (error) {
      console.error("[ClinicalNotes] Generate error:", error);
      res.status(500).json({ message: "Failed to generate clinical note" });
    }
  });

  // PATCH /api/external/care-navigator/patients/:userId/clinical-notes/:noteId — update/finalize
  app.patch("/api/external/care-navigator/patients/:userId/clinical-notes/:noteId", requireApiKey, async (req, res) => {
    try {
      const note = await storage.getClinicalNote(req.params.noteId);
      if (!note || note.userId !== req.params.userId) {
        return res.status(404).json({ message: "Note not found" });
      }
      const schema = z.object({
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        status: z.enum(["draft", "finalized", "archived"]).optional(),
        reviewedBy: z.string().optional(),
        tags: z.array(z.string()).optional(),
      });
      const updates = schema.parse(req.body);
      const updated = await storage.updateClinicalNote(req.params.noteId, {
        ...updates,
        reviewedAt: updates.status === "finalized" ? new Date() : note.reviewedAt,
      });
      res.json(updated);
    } catch (error) {
      console.error("[ClinicalNotes] Update error:", error);
      res.status(500).json({ message: "Failed to update clinical note" });
    }
  });

  // GET /api/admin/clinical-notes — admin view of all notes
  app.get("/api/admin/clinical-notes", isAdmin, async (req, res) => {
    try {
      const notes = await storage.listAllClinicalNotes({
        limit: parseInt(String(req.query.limit ?? "100")),
        offset: parseInt(String(req.query.offset ?? "0")),
        status: req.query.status as string | undefined,
      });
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to list clinical notes" });
    }
  });

  // GET /api/admin/patients/:userId/clinical-notes — admin view for a specific patient
  app.get("/api/admin/patients/:userId/clinical-notes", isAdmin, async (req, res) => {
    try {
      const notes = await storage.getClinicalNotes(req.params.userId, {
        limit: parseInt(String(req.query.limit ?? "50")),
      });
      res.json(notes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch patient clinical notes" });
    }
  });

  // ================================================================
  // ENGINE 3 — Prior Authorization Requests
  // ================================================================

  // POST /api/pa-requests — patient or admin creates a PA request
  app.post("/api/pa-requests", isAuthenticated, async (req, res) => {
    try {
      const authUser = (req as any).auth;
      const userId = authUser?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const schema = z.object({
        prescriptionId: z.string().min(1),
        conditionIds: z.array(z.string()).optional(),
        overrideInsurance: z.object({
          planName: z.string().optional(),
          memberId: z.string().optional(),
          bin: z.string().optional(),
          pcn: z.string().optional(),
        }).optional(),
      });
      const body = schema.parse(req.body);

      const paRequest = await createPriorAuthRequest({
        userId,
        prescriptionId: body.prescriptionId,
        conditionIds: body.conditionIds,
        overrideInsurance: body.overrideInsurance,
      });

      await storage.createAuditLog({
        userId,
        actionType: "create",
        entityType: "prior_auth_request" as any,
        entityId: paRequest.id,
        newValue: { medicationName: paRequest.medicationName, status: "draft" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.status(201).json(paRequest);
    } catch (error) {
      console.error("[PA] Create error:", error);
      res.status(500).json({ message: "Failed to generate prior authorization request" });
    }
  });

  // POST /api/external/pa-requests — ConcordiaCare app or staff API creates PA
  app.post("/api/external/pa-requests", requireApiKey, async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string().min(1),
        prescriptionId: z.string().min(1),
        conditionIds: z.array(z.string()).optional(),
        overrideInsurance: z.object({
          planName: z.string().optional(),
          memberId: z.string().optional(),
          bin: z.string().optional(),
          pcn: z.string().optional(),
        }).optional(),
        createdByAdmin: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const paRequest = await createPriorAuthRequest(body);
      res.status(201).json(paRequest);
    } catch (error) {
      console.error("[PA] External create error:", error);
      res.status(500).json({ message: "Failed to generate prior authorization request" });
    }
  });

  // GET /api/pa-requests — patient's own PA requests
  app.get("/api/pa-requests", isAuthenticated, async (req, res) => {
    try {
      const authUser = (req as any).auth;
      const userId = authUser?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const requests = await storage.getPatientPriorAuthRequests(userId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PA requests" });
    }
  });

  // GET /api/pa-requests/:id — single PA request (patient only sees their own)
  app.get("/api/pa-requests/:id", isAuthenticated, async (req, res) => {
    try {
      const authUser = (req as any).auth;
      const pa = await storage.getPriorAuthRequest(req.params.id);
      if (!pa) return res.status(404).json({ message: "Not found" });
      if (pa.userId !== authUser?.userId) return res.status(403).json({ message: "Forbidden" });
      res.json(pa);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PA request" });
    }
  });

  // GET /api/admin/pa-requests — admin list all PA requests
  app.get("/api/admin/pa-requests", isAdmin, async (req, res) => {
    try {
      const requests = await storage.listAllPriorAuthRequests({
        status: req.query.status as string | undefined,
        limit: parseInt(String(req.query.limit ?? "100")),
        offset: parseInt(String(req.query.offset ?? "0")),
        assignedTo: req.query.assignedTo as string | undefined,
      });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to list PA requests" });
    }
  });

  // GET /api/admin/pa-analytics — full analytics for the PA dashboard
  app.get("/api/admin/pa-analytics", isAdmin, async (req, res) => {
    try {
      const analytics = await storage.getPaAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("[PA Analytics] Error:", error);
      res.status(500).json({ message: "Failed to fetch PA analytics" });
    }
  });

  // GET /api/admin/pa-requests/stats — status breakdown
  app.get("/api/admin/pa-requests/stats", isAdmin, async (req, res) => {
    try {
      const stats = await storage.countPriorAuthRequestsByStatus();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PA stats" });
    }
  });

  // GET /api/admin/pa-requests/:id — admin single PA request
  app.get("/api/admin/pa-requests/:id", isAdmin, async (req, res) => {
    try {
      const pa = await storage.getPriorAuthRequest(req.params.id);
      if (!pa) return res.status(404).json({ message: "Not found" });
      res.json(pa);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PA request" });
    }
  });

  // PATCH /api/admin/pa-requests/:id — admin updates status, assigns, adds notes
  app.patch("/api/admin/pa-requests/:id", isAdmin, async (req, res) => {
    try {
      const pa = await storage.getPriorAuthRequest(req.params.id);
      if (!pa) return res.status(404).json({ message: "Not found" });

      const schema = z.object({
        status: z.enum(["draft", "pending_submission", "awaiting_signature", "signature_received", "submitted", "rfi_received", "approved", "denied", "appeal_in_progress", "appealed", "expired", "cancelled"]).optional(),
        assignedTo: z.string().optional(),
        adminNotes: z.string().optional(),
        referenceNumber: z.string().optional(),
        denialReason: z.string().optional(),
        prescriberEmail: z.string().email().optional(),
        prescriberNpi: z.string().optional(),
        prescriberPhone: z.string().optional(),
        prescriberFax: z.string().optional(),
        approvalExpiresAt: z.string().datetime().optional(),
        appealDeadline: z.string().datetime().optional(),
        letterText: z.string().optional(),
        rfiNotes: z.string().optional(),
        rfiReceivedAt: z.string().datetime().optional(),
        appealSubmittedAt: z.string().datetime().optional(),
        appealLetterText: z.string().optional(),
      });
      const raw = schema.parse(req.body);
      const updates = {
        ...raw,
        approvalExpiresAt: raw.approvalExpiresAt ? new Date(raw.approvalExpiresAt) : undefined,
        appealDeadline: raw.appealDeadline ? new Date(raw.appealDeadline) : undefined,
        appealSubmittedAt: raw.appealSubmittedAt ? new Date(raw.appealSubmittedAt) : undefined,
      };

      const timestampUpdates: Record<string, Date | null> = {};
      if (updates.status === "submitted" && !pa.submittedAt) timestampUpdates.submittedAt = new Date();
      if ((updates.status === "approved" || updates.status === "denied") && !pa.responseReceivedAt) {
        timestampUpdates.responseReceivedAt = new Date();
      }

      const updated = await storage.updatePriorAuthRequest(req.params.id, { ...updates, ...timestampUpdates } as any);

      await storage.createAuditLog({
        userId: pa.userId,
        actionType: "update",
        entityType: "prior_auth_request" as any,
        entityId: pa.id,
        newValue: updates,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json(updated);
    } catch (error) {
      console.error("[PA] Admin update error:", error);
      res.status(500).json({ message: "Failed to update PA request" });
    }
  });

  // POST /api/admin/pa-requests/:id/regenerate — RFI Fix-and-Resubmit: re-generate letter with extra context
  app.post("/api/admin/pa-requests/:id/regenerate", isAdmin, async (req, res) => {
    try {
      const pa = await storage.getPriorAuthRequest(req.params.id);
      if (!pa) return res.status(404).json({ message: "Not found" });

      const schema = z.object({
        rfiContext: z.string().min(1, "Please describe what the payer flagged as missing"),
        additionalNotes: z.string().optional(),
      });
      const body = schema.parse(req.body);

      // Load patient, prescription, conditions
      const [user, prescription, conditions] = await Promise.all([
        storage.getUser(pa.userId),
        pa.prescriptionId ? storage.getPrescription(pa.prescriptionId) : Promise.resolve(null),
        storage.getPatientConditions(pa.userId),
      ]);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      // Build a minimal prescription object if the original was deleted
      const rxObj = prescription ?? {
        id: pa.prescriptionId ?? "unknown",
        medicationName: pa.medicationName,
        dosage: "",
        strength: pa.strength ?? null,
        ndc: pa.ndc ?? null,
        daysSupply: pa.daysSupply ?? null,
        sig: null,
        prescribedBy: pa.prescriberName ?? null,
        drugClass: null,
        qtyOrdered: pa.quantityRequested ? Number(pa.quantityRequested) : null,
      } as any;

      const additionalClinicalContext = [
        `RFI — Payer requested: ${body.rfiContext}`,
        body.additionalNotes ? `Additional context: ${body.additionalNotes}` : "",
      ].filter(Boolean).join("\n");

      const paLetter = await generatePaLetter({
        user,
        prescription: rxObj,
        conditions,
        overrideInsurance: {
          planName: pa.insurancePlanName ?? undefined,
          memberId: pa.insuranceMemberId ?? undefined,
          bin: pa.insuranceBinNumber ?? undefined,
          pcn: pa.insurancePcnNumber ?? undefined,
        },
        additionalClinicalContext,
      });

      const patientName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Patient";
      const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const newLetterHtml = buildPaHtml(paLetter.letterText, patientName, pa.medicationName, date);

      // Append to admin notes with timestamp
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const rfiNote = `[${timestamp}] RFI Fix-and-Resubmit — Payer flagged: "${body.rfiContext}"`;
      const updatedAdminNotes = pa.adminNotes
        ? `${pa.adminNotes}\n\n${rfiNote}`
        : rfiNote;

      const updated = await storage.updatePriorAuthRequest(pa.id, {
        letterText: paLetter.letterText,
        letterHtml: newLetterHtml,
        clinicalNotes: paLetter.clinicalJustification,
        status: "appeal_in_progress",
        rfiNotes: body.rfiContext,
        rfiReceivedAt: pa.rfiReceivedAt ?? new Date(),
        adminNotes: updatedAdminNotes,
      } as any);

      await storage.createAuditLog({
        userId: pa.userId,
        actionType: "update",
        entityType: "prior_auth_request" as any,
        entityId: pa.id,
        newValue: { action: "pa_regenerated", rfiContext: body.rfiContext.slice(0, 200), status: "appeal_in_progress" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json(updated);
    } catch (error) {
      console.error("[PA] Regenerate error:", error);
      res.status(500).json({ message: "Failed to regenerate PA letter" });
    }
  });

  // POST /api/admin/pa-requests/:id/generate-appeal — AI appeal letter for denied PAs
  app.post("/api/admin/pa-requests/:id/generate-appeal", isAdmin, async (req, res) => {
    try {
      const pa = await storage.getPriorAuthRequest(req.params.id);
      if (!pa) return res.status(404).json({ message: "Not found" });
      if (pa.status !== "denied") {
        return res.status(400).json({ message: "Appeal can only be generated for denied PA requests" });
      }

      // Optionally enrich with FDA drug data
      const { getDrugInfoByNdc } = await import("./ndc-service");
      const drugInfo = pa.ndc ? await getDrugInfoByNdc(pa.ndc) : null;

      const appeal = await generateAppealLetter({ pa, drugInfo: drugInfo ?? undefined });

      const patientName = pa.insuranceMemberId ? `Member #${pa.insuranceMemberId}` : "Patient";
      const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const appealHtml = buildAppealHtml(appeal.letterText, patientName, pa.medicationName, date);

      // Store appeal letter and move status to appeal_in_progress
      const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const appealNote = `[${timestamp}] AI appeal letter generated.`;
      const updatedAdminNotes = pa.adminNotes
        ? `${pa.adminNotes}\n\n${appealNote}`
        : appealNote;

      const updated = await storage.updatePriorAuthRequest(pa.id, {
        appealLetterText: appeal.letterText,
        appealLetterHtml: appealHtml,
        appealGeneratedAt: new Date(),
        appealPeerToPeerNote: appeal.peerToPeerPrepNote,
        appealKeyArguments: appeal.keyArguments,
        appealCitedGuidelines: appeal.citedGuidelines,
        status: "appeal_in_progress",
        adminNotes: updatedAdminNotes,
      } as any);

      await storage.createAuditLog({
        userId: pa.userId,
        actionType: "update",
        entityType: "prior_auth_request" as any,
        entityId: pa.id,
        newValue: { action: "appeal_generated", status: "appeal_in_progress" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      res.json(updated);
    } catch (error) {
      console.error("[PA] Generate appeal error:", error);
      res.status(500).json({ message: "Failed to generate appeal letter" });
    }
  });

  // GET /api/external/pa-requests/:userId — ConcordiaCare app fetches patient's PAs
  app.get("/api/external/pa-requests/:userId", requireApiKey, async (req, res) => {
    try {
      const requests = await storage.getPatientPriorAuthRequests(req.params.userId);
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch PA requests" });
    }
  });

  // ================================================================
  // ENGINE 4 — EHR Data Bridge (FHIR R4)
  // ================================================================

  // GET /api/external/patients/:id/fhir — FHIR R4 patient bundle
  app.get("/api/external/patients/:id/fhir", requireApiKey, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const [prescriptionsList, conditions, journalEntries, notes] = await Promise.all([
        storage.getPrescriptionsByUserId(req.params.id),
        storage.getPatientConditions(req.params.id),
        storage.getHealthJournalEntries(req.params.id, { limit: 30 }),
        storage.getClinicalNotes(req.params.id, { limit: 20 }),
      ]);

      const bundle = buildFhirBundle({
        user,
        prescriptions: prescriptionsList,
        conditions,
        journalEntries,
        clinicalNotes: notes,
      });

      await storage.createAuditLog({
        userId: user.id,
        actionType: "export",
        entityType: "patient" as any,
        entityId: user.id,
        newValue: { format: "fhir_r4", resourceCount: bundle.total, source: "external_api" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });

      // FHIR bundles use application/fhir+json content type
      res.setHeader("Content-Type", "application/fhir+json");
      res.json(bundle);
    } catch (error) {
      console.error("[FHIR] Bundle build error:", error);
      res.status(500).json({ message: "Failed to build FHIR bundle" });
    }
  });

  // GET /api/admin/patients/:id/fhir — admin can view FHIR bundle
  app.get("/api/admin/patients/:id/fhir", isAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Patient not found" });

      const [prescriptionsList, conditions, journalEntries, notes] = await Promise.all([
        storage.getPrescriptionsByUserId(req.params.id),
        storage.getPatientConditions(req.params.id),
        storage.getHealthJournalEntries(req.params.id, { limit: 30 }),
        storage.getClinicalNotes(req.params.id, { limit: 20 }),
      ]);

      const bundle = buildFhirBundle({
        user,
        prescriptions: prescriptionsList,
        conditions,
        journalEntries,
        clinicalNotes: notes,
      });

      res.setHeader("Content-Type", "application/fhir+json");
      res.json(bundle);
    } catch (error) {
      res.status(500).json({ message: "Failed to build FHIR bundle" });
    }
  });

  // ENGINE 3 — PA Prescriber E-Signature
  // Routes extracted to server/pa-signature-routes.ts so they can be tested
  // by importing the real module (not simplified copies) with mocked deps.
  registerPaSignatureRoutes(app, { storage, isAdmin, sendEmail, escapeHtml });

  return httpServer;
}
