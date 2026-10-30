import type { User } from "@shared/schema";

/**
 * Build the identity portion of every website → ConcordiaCare patient request.
 *
 * This intentionally accepts a complete server-loaded User, rather than a
 * request body or a loose set of fields.  The local users.id is the immutable
 * integration key; contact fields are only attributes of that identity.
 */
export function buildConcordiaCarePatientPayload(
  user: User,
  options: { action?: "created" | "updated"; includeUsername?: boolean } = {},
): Record<string, unknown> {
  if (!user.id) throw new Error("Cannot sync a patient without a local user ID");
  if (!user.concordiaId) {
    throw new Error("Cannot sync a patient without a canonical Concordia ID");
  }

  const payload: Record<string, unknown> = {
    action: options.action ?? "updated",
    concordiaPharmacyUserId: user.id,
    // Kept for older ConcordiaCare endpoints which still use this name.
    concordiaUserId: user.id,
    concordiaId: user.concordiaId,
    canonicalPatientId: user.concordiaId,
  };

  if (user.concordiaCareUserId) {
    payload.concordiaCareUserId = user.concordiaCareUserId;
  }
  if (user.email) payload.email = user.email;
  if (user.firstName) payload.firstName = user.firstName;
  if (user.lastName) payload.lastName = user.lastName;
  if (user.phoneNumber) payload.phone = user.phoneNumber;
  if (user.dateOfBirth) {
    payload.dateOfBirth = user.dateOfBirth instanceof Date
      ? user.dateOfBirth.toISOString().split("T")[0]
      : user.dateOfBirth;
  }
  if (user.address) payload.deliveryAddress = user.address;
  if (user.preferredDeliveryMethod) {
    payload.preferredDeliveryMethod = user.preferredDeliveryMethod;
  }
  if (options.includeUsername && user.username) payload.username = user.username;

  return payload;
}

/**
 * A ConcordiaCare ID may be learned from the app only once.  Never replace a
 * previously guarded link with a different app account.
 */
export function guardConcordiaCareLink(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): { ok: true; value?: string } | { ok: false; conflict: true } {
  if (!incoming) return { ok: true };
  if (existing && existing !== incoming) return { ok: false, conflict: true };
  return { ok: true, value: incoming };
}