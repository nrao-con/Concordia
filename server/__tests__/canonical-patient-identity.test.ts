import { describe, expect, it } from "vitest";
import { IdentityLinkRequiredError, assertEmailDoesNotClaimOtherClerkUser, resolveCanonicalPatientIdentity } from "../canonicalPatientIdentity";

const patient = {
  id: "pharmacy-record-1",
  clerkId: "user_own",
  email: "patient@example.test",
  role: "patient",
  concordiaId: "CP-000321",
  concordiaCareUserId: null,
} as any;

describe("canonical patient identity bridge", () => {
  it("never claims an unlinked legacy record using a matching email", () => {
    expect(() => assertEmailDoesNotClaimOtherClerkUser({ clerkId: null }, "user_new"))
      .toThrow(IdentityLinkRequiredError);
    expect(() => assertEmailDoesNotClaimOtherClerkUser({ clerkId: "user_other" }, "user_new"))
      .toThrow(IdentityLinkRequiredError);
    expect(() => assertEmailDoesNotClaimOtherClerkUser({ clerkId: "user_own" }, "user_own"))
      .not.toThrow();
  });
  it("resolves only the verified Clerk subject, with no contact-based lookup", async () => {
    const lookup = async (subject: string) => subject === "user_own" ? patient : undefined;
    expect(await resolveCanonicalPatientIdentity("user_own", lookup)).toEqual({
      pharmacyUserId: "pharmacy-record-1",
      canonicalPatientId: "CP-000321",
      concordiaCareUserId: null,
      linkStatus: "unlinked",
    });
    expect(await resolveCanonicalPatientIdentity("user_other", lookup)).toBeNull();
  });

  it("reports an existing mobile link without granting mobile approval", async () => {
    const identity = await resolveCanonicalPatientIdentity("user_own", async () => ({
      ...patient, concordiaCareUserId: "app-profile-1",
    }));
    expect(identity).toMatchObject({ concordiaCareUserId: "app-profile-1", linkStatus: "linked" });
    expect(identity).not.toHaveProperty("approved");
  });

  it("fails closed for a missing canonical ID or a nonpatient record", async () => {
    await expect(resolveCanonicalPatientIdentity("user_own", async () => ({
      ...patient, concordiaId: null,
    }))).rejects.toBeInstanceOf(IdentityLinkRequiredError);
    await expect(resolveCanonicalPatientIdentity("user_own", async () => ({
      ...patient, concordiaId: "CP-OTHER",
    }))).rejects.toBeInstanceOf(IdentityLinkRequiredError);
    expect(await resolveCanonicalPatientIdentity("user_own", async () => ({
      ...patient, role: "admin",
    }))).toBeNull();
  });
});