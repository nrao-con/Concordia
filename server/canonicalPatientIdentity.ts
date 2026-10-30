import type { User } from "@shared/schema";

export class IdentityLinkRequiredError extends Error {
  constructor() {
    super("This account needs an explicit identity review before it can be linked");
    this.name = "IdentityLinkRequiredError";
  }
}

export function assertEmailDoesNotClaimOtherClerkUser(
  existing: Pick<User, "clerkId"> | undefined,
  clerkSubject: string,
): void {
  if (existing && existing.clerkId !== clerkSubject) {
    throw new IdentityLinkRequiredError();
  }
}

export async function resolveCanonicalPatientIdentity(
  clerkSubject: string,
  getUserByClerkId: (subject: string) => Promise<User | undefined>,
) {
  const user = await getUserByClerkId(clerkSubject);
  if (!user || user.role !== "patient") return null;
  if (!user.concordiaId || !/^CP-\d{6}$/.test(user.concordiaId)) {
    throw new IdentityLinkRequiredError();
  }
  return {
    pharmacyUserId: user.id,
    canonicalPatientId: user.concordiaId,
    concordiaCareUserId: user.concordiaCareUserId ?? null,
    linkStatus: user.concordiaCareUserId ? "linked" : "unlinked",
  };
}