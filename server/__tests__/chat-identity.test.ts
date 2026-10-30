import { describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import {
  chatIdentityHmac,
  chatIdentityStatus,
  codeMatchesHash,
  GENERIC_REQUEST,
  GENERIC_VERIFY,
  isRealIsoDate,
  normalizeChatIdentity,
} from "../chat-identity";

// These tests intentionally exercise only deterministic helpers and the Clerk
// branch of status, so they neither contact the database nor send email.
describe("chat identity input and response safety", () => {
  it("normalizes NFKC names, casing, and whitespace", () => {
    expect(normalizeChatIdentity("  Ａda   LOVELACE  ")).toBe("ada lovelace");
    expect(normalizeChatIdentity(null)).toBe("");
  });

  it("accepts only real strict ISO calendar dates", () => {
    expect(isRealIsoDate("2024-02-29")).toBe(true);
    expect(isRealIsoDate("2023-02-29")).toBe(false);
    expect(isRealIsoDate("2024-2-09")).toBe(false);
    expect(isRealIsoDate("2024-13-01")).toBe(false);
  });

  it("uses HMACs for code matching without retaining a raw code", () => {
    const storedHash = chatIdentityHmac("123456");
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedHash).not.toContain("123456");
    expect(codeMatchesHash("123456", storedHash)).toBe(true);
    expect(codeMatchesHash("123457", storedHash)).toBe(false);
  });

  it("keeps generic public strings free of directory fields", () => {
    expect(GENERIC_REQUEST).toBe("If eligible, a verification code has been sent.");
    expect(GENERIC_VERIFY).toBe("Invalid or expired verification code.");
  });
});

describe("GET chat identity status contract", () => {
  function appFor(localUser: unknown) {
    const app = express();
    app.get("/api/chat/identity", async (req: any, res) => {
      req.localUser = localUser;
      req.session = {};
      res.json(await chatIdentityStatus(req));
    });
    return app;
  }

  it("recognizes only an active patient Clerk user", async () => {
    const response = await supertest(appFor({
      role: "patient", patientStatus: "active", firstName: "Test",
    })).get("/api/chat/identity");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ recognized: true, firstName: "Test", source: "clerk" });
  });

  it("does not recognize a Clerk administrator", async () => {
    const response = await supertest(appFor({
      role: "admin", patientStatus: "active", firstName: "Test",
    })).get("/api/chat/identity");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ recognized: false, source: null });
  });
});