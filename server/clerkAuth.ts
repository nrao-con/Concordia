import { clerkMiddleware as _clerkMiddleware, getAuth, createClerkClient } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { buildConcordiaCarePatientPayload } from "./concordiaCareIdentity";
import { IdentityLinkRequiredError } from "./canonicalPatientIdentity";
import type { User } from "@shared/schema";

// Keep development and production Clerk instances paired. A pk_test_ frontend
// token must be verified by the matching sk_test_ backend key; production keeps
// using the live key pair.
const isDevelopment = process.env.NODE_ENV !== "production";
const useDirectClerk = process.env.VITE_USE_DIRECT_CLERK === "true";
const activeClerkPublishableKey = isDevelopment
  ? (process.env.VITE_CLERK_PUBLISHABLE_KEY_DEV ||
     process.env.VITE_CLERK_PUBLISHABLE_KEY)
  : (useDirectClerk
      ? process.env.VITE_EXTERNAL_CLERK_PUBLISHABLE_KEY
      : process.env.VITE_CLERK_PUBLISHABLE_KEY);
const activeClerkSecretKey = isDevelopment
  ? (process.env.CLERK_SECRET_KEY_DEV || process.env.CLERK_SECRET_KEY)
  : (useDirectClerk
      ? process.env.EXTERNAL_CLERK_SECRET_KEY
      : process.env.CLERK_SECRET_KEY);

if (activeClerkPublishableKey) {
  process.env.CLERK_PUBLISHABLE_KEY = activeClerkPublishableKey;
}
if (activeClerkSecretKey) {
  process.env.CLERK_SECRET_KEY = activeClerkSecretKey;
}

export { getAuth };

/** Fire-and-forget push to ConcordiaCare app when a brand-new patient record is created.
 *  Only fires if CONCORDIA_CARE_APP_URL and an app API key are configured.
 *  Errors are swallowed — this must never block authentication. */
export function pushNewPatientToApp(user: User): void {
  if (user.role && user.role !== "patient") return;
  const appUrl = process.env.CONCORDIA_CARE_APP_URL;
  const apiKey = process.env.CONCORDIA_RX_API_KEY || process.env.API_KEY;
  if (!apiKey || !appUrl) return;
  const base = appUrl.startsWith("http://") || appUrl.startsWith("https://")
    ? appUrl
    : `https://${appUrl}`;
  const endpoint = `${base.replace(/\/+$/, "")}/api/external/register-patient`;
  let payload: Record<string, unknown>;
  try {
    payload = buildConcordiaCarePatientPayload(user, { action: "created" });
  } catch {
    // A canonical ID is assigned during normal user creation.  Do not send a
    // payload that could be matched using mutable contact information.
    return;
  }
  void (async () => {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        try {
          const result = await resp.json() as {
            userId?: string;
            id?: string;
            concordiaCareUserId?: string;
            conflict?: boolean;
          };
          if (result.conflict) {
            console.warn("[ConcordiaCare Push] register-patient identity conflict");
            return;
          }
          const appUserId = result.userId || result.id || result.concordiaCareUserId;
          if (appUserId) {
            const linkResult = await storage.linkConcordiaCareUser(user.id, appUserId);
            if (linkResult === "conflict") {
              console.warn("[ConcordiaCare Push] register-patient identity conflict");
              return;
            }
          }
        } catch {
          // Older endpoints may return an empty/non-JSON success response.
        }
        console.log(`[ConcordiaCare Push] register-patient (lazy-upsert): HTTP ${resp.status}`);
      } else {
        console.warn(`[ConcordiaCare Push] register-patient (lazy-upsert) HTTP ${resp.status} — no retry available at auth layer`);
      }
    } catch (err: any) {
      console.warn(`[ConcordiaCare Push] register-patient (lazy-upsert) failed: ${err?.message}`);
    }
  })();
}

let _sessionMiddleware: RequestHandler | null = null;

/**
 * Express-session middleware — kept for the caregiver/attendant system which
 * still stores `attendantId` and `actingPatientId` in the session.
 */
export function getSession(): RequestHandler {
  if (_sessionMiddleware) return _sessionMiddleware;
  const sessionTtl = 30 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  _sessionMiddleware = session({
    secret: (() => {
      const s = process.env.SESSION_SECRET;
      if (!s) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("[clerkAuth] SESSION_SECRET env var is required in production");
        }
        console.warn("[clerkAuth] SESSION_SECRET not set — using insecure dev fallback. Set this in production.");
        return "concordia-session-secret-dev-only";
      }
      return s;
    })(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
  return _sessionMiddleware;
}

/**
 * Install session middleware (attendant sessions) and Clerk middleware (patient/admin JWT).
 * Replaces the old Passport/OIDC setupAuth from replitAuth.ts.
 */
export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  if (activeClerkSecretKey && activeClerkPublishableKey) {
    app.use(
      _clerkMiddleware((req) => ({
        secretKey: activeClerkSecretKey,
         // The managed integration may inject CLERK_PROXY_URL in production.
         // With the domain-owning direct instance, an inherited proxy URL sends
         // session refresh handshakes to the wrong Clerk frontend.
         proxyUrl: useDirectClerk ? "" : undefined,
        publishableKey: publishableKeyFromHost(
          getClerkProxyHost(req) ?? "",
          activeClerkPublishableKey,
        ),
      })),
    );
  } else {
    console.warn("[Clerk] Active Clerk key pair not set — Clerk middleware disabled (session fallback active)");
  }
}

/**
 * Require a valid Clerk JWT. The only non-Clerk path is the caregiver/attendant
 * session (attendantId + actingPatientId in express-session), which is kept for
 * the Home Attendant system only.
 */
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Caregiver acting on behalf of a patient — session-based (attendant system only)
  if ((req.session as any)?.attendantId && (req.session as any)?.actingPatientId) {
    return next();
  }

  // Clerk JWT authentication (primary — all patients and admins)
  try {
    const auth = getAuth(req);
    const { userId, sessionClaims } = auth;
    if (userId) {
      let localUser = await storage.getUserByClerkId(userId);

      // Lazy upsert: webhook may not have fired yet for brand-new signups.
      // Create a minimal local record now so all patient routes succeed immediately.
      if (!localUser) {
        const claims = sessionClaims as any;
        let email = claims?.email as string | undefined;
        let firstName = (claims?.firstName ?? claims?.given_name) as string | undefined;
        let lastName = (claims?.lastName ?? claims?.family_name) as string | undefined;
        let profileImageUrl: string | undefined;

        // Clerk JWTs don't include email/name by default — fetch from backend API if missing
        if (!email && activeClerkSecretKey) {
          try {
            const clerk = createClerkClient({ secretKey: activeClerkSecretKey });
            const clerkUser = await clerk.users.getUser(userId);
            email = clerkUser.emailAddresses?.[0]?.emailAddress;
            firstName = firstName ?? clerkUser.firstName ?? undefined;
            lastName = lastName ?? clerkUser.lastName ?? undefined;
            profileImageUrl = clerkUser.imageUrl ?? undefined;
          } catch {
            // non-fatal — proceed without email
          }
        }

        localUser = await storage.upsertUserByClerkId(userId, {
          email,
          firstName,
          lastName,
          profileImageUrl,
        });
        pushNewPatientToApp(localUser);
      }

      (req as any).localUser = localUser;
      (req as any).clerkUserId = userId;
      return next();
    }
    if (process.env.NODE_ENV !== "production") {
      const authorization = req.header("authorization");
      console.warn("[Clerk Auth] Rejected request", {
        path: req.path,
        hasBearerToken: authorization?.startsWith("Bearer ") ?? false,
        hasSessionCookie: Boolean(req.cookies?.__session || req.headers.cookie?.includes("__session=")),
        status: (auth as any).status,
        reason: (auth as any).reason,
      });
    }
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return res.status(409).json({ code: "identity_link_required", message: "Contact pharmacy staff to review your account link" });
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Clerk Auth] Authentication middleware error", {
        path: req.path,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return res.status(401).json({ message: "Unauthorized" });
};

const clerkAdminRoleCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const CLERK_ADMIN_ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

async function hasClerkAdminRole(userId: string): Promise<boolean> {
  const cached = clerkAdminRoleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isAdmin;
  }

  if (!activeClerkSecretKey) return false;

  try {
    const clerk = createClerkClient({ secretKey: activeClerkSecretKey });
    const clerkUser = await clerk.users.getUser(userId);
    const isAdmin = clerkUser.publicMetadata?.role === "admin";
    clerkAdminRoleCache.set(userId, {
      isAdmin,
      expiresAt: Date.now() + CLERK_ADMIN_ROLE_CACHE_TTL_MS,
    });
    return isAdmin;
  } catch (error) {
    console.warn("[Clerk Auth] Could not verify admin role from Clerk:", error);
    return false;
  }
}

/**
 * Require admin role via Clerk `publicMetadata.role === "admin"` (primary)
 * or local `users.role === "admin"` (DB fallback for existing admin accounts).
 * If the session token does not contain fresh metadata, verify the role directly
 * with Clerk so a valid admin is not shown empty grids because every API call
 * was rejected with 403.
 */
export const isAdmin: RequestHandler = async (req, res, next) => {
  try {
    const { userId, sessionClaims } = getAuth(req);
    if (!userId) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    const role = (sessionClaims?.metadata as any)?.role as string | undefined;
    if (role === "admin") return next();
    const user = (req as any).localUser ?? (await storage.getUserByClerkId(userId));
    if (user?.role === "admin") {
      (req as any).localUser = user;
      return next();
    }
    if (await hasClerkAdminRole(userId)) {
      return next();
    }
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  } catch {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
};

/**
 * Optional auth — resolves req.localUser from Clerk JWT if present, but does NOT
 * reject unauthenticated requests. Used on routes that support both auth + anon access
 * but need the patient ID when the user IS signed in (e.g. flu-shots, insurance-requests).
 */
export const resolveUser: RequestHandler = async (req, _res, next) => {
  if ((req as any).localUser) return next(); // already resolved by isAuthenticated
  if ((req.session as any)?.attendantId && (req.session as any)?.actingPatientId) return next();
  try {
    const { userId, sessionClaims } = getAuth(req);
    if (userId) {
      let localUser = await storage.getUserByClerkId(userId);
      if (!localUser) {
        const claims = sessionClaims as any;
        let email = claims?.email as string | undefined;
        let firstName = (claims?.firstName ?? claims?.given_name) as string | undefined;
        let lastName = (claims?.lastName ?? claims?.family_name) as string | undefined;
        if (!email && activeClerkSecretKey) {
          try {
            const clerk = createClerkClient({ secretKey: activeClerkSecretKey });
            const clerkUser = await clerk.users.getUser(userId);
            email = clerkUser.emailAddresses?.[0]?.emailAddress;
            firstName = firstName ?? clerkUser.firstName ?? undefined;
            lastName = lastName ?? clerkUser.lastName ?? undefined;
          } catch { /* non-fatal */ }
        }
        localUser = await storage.upsertUserByClerkId(userId, { email, firstName, lastName });
        pushNewPatientToApp(localUser);
      }
      (req as any).localUser = localUser;
      (req as any).clerkUserId = userId;
    }
  } catch { /* non-fatal */ }
  return next();
};

/**
 * Re-export clerkMiddleware for direct use if needed.
 */
export const clerkMiddleware = _clerkMiddleware;
