import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedProductsIfEmpty } from "./seed";
import { startStaffProductSync } from "./staff-sync";
import { runPaSignatureMigration } from "./migrations/pa-signature-columns";
import { runChatIdentityMigration } from "./migrations/chat-identity";
import { runBlisterEnrollmentIdMigration } from "./migrations/blister-enrollment-id";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import { recoverLegacyClerkHandshake } from "./middlewares/recoverLegacyClerkHandshake";
import { storage } from "./storage";
import { resolveHtml } from "./seo-render";

const ALLOWED_ORIGINS = [
  "https://concordia-care.replit.app",
  "https://concordia-staff.replit.app",
  "https://pharmflows.com",
  "https://www.pharmflows.com",
  "https://concordianyc.com",
  "https://www.concordianyc.com",
];

const app = express();

// The direct production Clerk instance belongs to concordianyc.com. Browser
// visits to alternate hostnames must use that canonical origin; keep /api calls
// on those hosts available to existing integrations.
app.use((req, res, next) => {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    ?.split(",")[0]?.trim().toLowerCase() || req.headers.host?.toLowerCase();
  if (
    process.env.NODE_ENV === "production" &&
    (host?.split(":")[0] === "concordia-rx-connect.replit.app" ||
      host?.split(":")[0] === "www.concordianyc.com") &&
    (req.method === "GET" || req.method === "HEAD") &&
    !req.path.startsWith("/api/") &&
    req.headers.accept?.includes("text/html")
  ) {
    return res.redirect(302, `https://concordianyc.com${req.originalUrl}`);
  }
  next();
});

// Clerk's production proxy streams raw request bytes and must run before
// express.json()/express.urlencoded().
app.use(CLERK_PROXY_PATH, recoverLegacyClerkHandshake);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY", "X-STAFF-KEY"],
}));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Replit's development preview is embedded from a different origin.
  // Keep clickjacking protection on published production responses without
  // blocking the workspace preview iframe.
  if (process.env.NODE_ENV === "production") {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

process.on("SIGHUP", () => {
  log("Received SIGHUP signal, ignoring");
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  const isProduction = process.env.NODE_ENV === "production";
  log(`Environment: ${isProduction ? "PRODUCTION" : "development"}`);

  // Apply idempotent DB migrations — must succeed before routes are registered.
  // If this throws the process exits, preventing the server from serving against
  // an incompatible schema.
  await runPaSignatureMigration();
  await runChatIdentityMigration();
  await runBlisterEnrollmentIdMigration();

  const server = await registerRoutes(app);

  // Auto-seed product catalog if database is nearly empty
  seedProductsIfEmpty().catch(err => console.error("Seed error:", err));

  // Subscribe to the staff app's SSE stream for real-time product sync
  startStaffProductSync().catch(err => console.error("[StaffSync] startup error:", err));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error: ${message} (${status})`);
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // Serve product images from attached_assets (only image subdirectories)
  app.use("/attached_assets/stock_images", express.static(path.resolve(import.meta.dirname, "..", "attached_assets", "stock_images"), { extensions: ["jpg", "jpeg", "png", "webp"] }));
  app.use("/attached_assets/generated_images", express.static(path.resolve(import.meta.dirname, "..", "attached_assets", "generated_images"), { extensions: ["jpg", "jpeg", "png", "webp"] }));

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    // Production static serving.
    //
    // Root cause of "Can't set headers after they are sent":
    //   express.static automatically serves index.html for "/" requests (its
    //   built-in `index` feature) AND the catch-all below also calls sendFile
    //   for the same request, because res.headersSent is still false at the
    //   moment the synchronous catch-all runs (the static stream hasn't written
    //   its first byte yet).  This spawns two concurrent SendStreams on the
    //   same socket — the loser throws the uncaught "Can't set headers" error
    //   which crashes that response and can surface as a 500.
    //
    // Fix: disable the `index` option on express.static so it NEVER serves
    //   index.html automatically.  Only the catch-all below serves it, and only
    //   once, with a proper error callback so any fs error is handled cleanly.
    const distPath = path.resolve(import.meta.dirname, "public");
    if (!fs.existsSync(distPath)) {
      throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
    }

    // Serve JS/CSS/images/fonts etc — but NOT index.html for "/"
    app.get("/index.html", (_req, res) => res.redirect(308, "/"));
    app.use(express.static(distPath, { index: false }));

    const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
    app.use("/{*path}", async (req, res, next) => {
      try {
        const page = await resolveHtml(template, req.path, async (slug) => {
          const bySlug = await storage.getBlogPostBySlug(slug);
          if (bySlug) return bySlug;
          const numericId = Number.parseInt(slug, 10);
          return Number.isInteger(numericId) && numericId > 0
            ? storage.getBlogPost(numericId)
            : undefined;
        });
        res.status(page.status).type("html").send(page.html);
      } catch (error) {
        next(error);
      }
    });
  }

  // This must be registered after the HTML fallback so rendering and file
  // errors are returned consistently instead of using Express's default page.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    log(`HTML response error: ${err.message || "Internal Server Error"} (${status})`);
    if (!res.headersSent) {
      res.status(status).type("text").send(status === 404 ? "Not Found" : "Internal Server Error");
    }
  });

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
