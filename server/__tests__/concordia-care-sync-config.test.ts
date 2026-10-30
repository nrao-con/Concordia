import { describe, expect, it } from "vitest";
import { getConcordiaCareApiKey, isPermanentConcordiaCareAuthFailure } from "../concordia-care-sync";

describe("ConcordiaCare sync configuration", () => {
  it("prefers the current shared secret name over the legacy fallback", () => {
    expect(getConcordiaCareApiKey({
      CONCORDIA_RX_API_KEY: "preferred",
      API_KEY: "legacy",
    })).toBe("preferred");
  });

  it("supports the legacy API_KEY during migration", () => {
    expect(getConcordiaCareApiKey({ API_KEY: "legacy" })).toBe("legacy");
  });

  it("returns undefined when neither shared secret is configured", () => {
    expect(getConcordiaCareApiKey({})).toBeUndefined();
  });

  it("treats authentication failures as permanent configuration failures", () => {
    expect(isPermanentConcordiaCareAuthFailure(401)).toBe(true);
    expect(isPermanentConcordiaCareAuthFailure(403)).toBe(true);
    expect(isPermanentConcordiaCareAuthFailure(500)).toBe(false);
  });
});