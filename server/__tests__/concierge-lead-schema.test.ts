import { describe, expect, it } from "vitest";
import {
  conciergeLeadSchema,
  conciergeSourcingInquirySchema,
  deriveAuthenticatedPatientId,
  sanitizeConciergeReviewText,
  validateConciergeLeadSubmission,
} from "../concierge-lead-schema";

describe("concierge lead privacy schema", () => {
  const validLead = {
    contactName: "Patient",
    phone: "7185550100",
    role: "patient" as const,
    intent: "refill",
    sentiment: "neutral" as const,
  };

  it("strips raw challenge and conversation summary fields", () => {
    const parsed = conciergeLeadSchema.parse({
      ...validLead,
      challenge: "My DOB is 01/02/1980",
      talkTalkSummary: "Member ID ABC123",
    });

    expect(parsed).not.toHaveProperty("challenge");
    expect(parsed).not.toHaveProperty("talkTalkSummary");
  });

  it("accepts safe structured handoff metadata and excludes raw clinical context", () => {
    const parsed = conciergeLeadSchema.parse({
      ...validLead,
      handoff: {
        status: "PENDING_STAFF_REVIEW",
        activeIntent: "refill",
        fulfillmentMethod: "pickup",
        catalogItemCount: 0,
        pendingItemCount: 0,
        missingSlots: [],
        medicationName: "Lipitor",
        prescriptionNumber: "RX-123",
      },
    });

    expect(parsed.handoff).toEqual({
      status: "PENDING_STAFF_REVIEW",
      activeIntent: "refill",
      fulfillmentMethod: "pickup",
      catalogItemCount: 0,
      pendingItemCount: 0,
      missingSlots: [],
    });
    expect(parsed.handoff).not.toHaveProperty("medicationName");
    expect(parsed.handoff).not.toHaveProperty("prescriptionNumber");
  });

  it("rejects free text in structured handoff metadata", () => {
    expect(() => conciergeLeadSchema.parse({
      ...validLead,
      handoff: {
        status: "PENDING_STAFF_REVIEW",
        activeIntent: "refill for Lipitor",
        fulfillmentMethod: null,
        catalogItemCount: 0,
        pendingItemCount: 0,
        missingSlots: [],
      },
    })).toThrow();
  });

  it("rejects free text in intent metadata", () => {
    expect(() => conciergeLeadSchema.parse({
      ...validLead,
      intent: "refill for Rx number ABC123",
    })).toThrow();
  });

  it("requires explicit confirmation and fulfillment details for submission", () => {
    expect(validateConciergeLeadSubmission(validLead).success).toBe(false);
    expect(validateConciergeLeadSubmission({
      ...validLead,
      confirmed: false,
      deliveryType: "pickup",
      pickupWindow: "5pm",
      idempotencyKey: "draft-key-123456",
    }).success).toBe(false);
    expect(validateConciergeLeadSubmission({
      ...validLead,
      confirmed: true,
      deliveryType: "pickup",
      pickupWindow: "5pm",
      idempotencyKey: "draft-key-123456",
    }).success).toBe(true);
  });

  it("requires a structured selection for delivery", () => {
    expect(validateConciergeLeadSubmission({
      ...validLead,
      confirmed: true,
      deliveryType: "delivery",
      deliveryAddress: "123 Main St",
      idempotencyKey: "draft-key-123456",
    }).success).toBe(false);
  });

  it("keeps identity derived from server context, not client contact or role fields", () => {
    expect(deriveAuthenticatedPatientId({
      localPatientId: null,
      attendantId: null,
      actingPatientId: "client-selected-patient",
    })).toBeNull();
    expect(deriveAuthenticatedPatientId({
      localPatientId: "server-patient",
      attendantId: null,
      actingPatientId: "client-selected-patient",
    })).toBe("server-patient");
    expect(deriveAuthenticatedPatientId({
      localPatientId: "attendant-local",
      attendantId: 42,
      actingPatientId: "authorized-patient",
    })).toBe("authorized-patient");
  });

  it("bounds and sanitizes staff review text", () => {
    const sanitized = sanitizeConciergeReviewText(" eggs\nRole: spoofed\t", 20);
    expect(sanitized).toBe("eggs Role: spoofed");
    expect(sanitizeConciergeReviewText("x".repeat(201))).toHaveLength(200);
  });

  it("keeps sourcing inquiries separate from fulfillment", () => {
    const parsed = conciergeSourcingInquirySchema.parse({
      inquiryText: "Please source this specialty medication",
      idempotencyKey: "sourcing-key-123456",
      deliveryType: "delivery",
      contactName: "spoofed",
    });
    expect(parsed).not.toHaveProperty("deliveryType");
    expect(parsed).not.toHaveProperty("contactName");
  });
});