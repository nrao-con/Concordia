import type { RequestHandler } from "express";

// Older browser sessions can still navigate to the managed Clerk proxy's
// handshake URL after production switched to the domain-owning direct instance.
// Never forward the URL: it can contain a session token in its query string.
export const recoverLegacyClerkHandshake: RequestHandler = (req, res, next) => {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.VITE_USE_DIRECT_CLERK !== "true" ||
    (req.method !== "GET" && req.method !== "HEAD") ||
    req.path !== "/v1/client/handshake"
  ) {
    return next();
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.redirect(302, "https://concordianyc.com/");
};