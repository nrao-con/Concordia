import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { storage } from "./storage";
import { resolveHtml } from "./seo-render";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const publicHost = process.env.REPLIT_DEV_DOMAIN;
  const serverOptions = {
    middlewareMode: true,
    hmr: publicHost
      ? {
          server,
          protocol: "wss" as const,
          host: publicHost,
          clientPort: 443,
          path: "/__vite_hmr",
        }
      : { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use((req, res, next) => {
    if (res.headersSent || res.writableEnded) return;
    vite.middlewares(req, res, (error?: unknown) => {
      if (error) return next(error);
      if (!res.headersSent && !res.writableEnded) next();
    });
  });
  app.use("/{*path}", async (req, res, next) => {
    if (res.headersSent || res.writableEnded) return;
    const url = req.originalUrl;
    const pathname = new URL(url, "http://localhost").pathname;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const transformedTemplate = await vite.transformIndexHtml(url, template);
      const page = await resolveHtml(transformedTemplate, pathname, async (slug) => {
        const bySlug = await storage.getBlogPostBySlug(slug);
        if (bySlug) return bySlug;
        const numericId = Number.parseInt(slug, 10);
        return Number.isInteger(numericId) && numericId > 0
          ? storage.getBlogPost(numericId)
          : undefined;
      });
      res
        .status(page.status)
        .set({
          "Content-Type": "text/html",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        })
        .end(page.html);
    } catch (e) {
      if (res.headersSent || res.writableEnded) return;
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("/{*path}", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const page = await resolveHtml(template, req.path, (slug) => storage.getBlogPostBySlug(slug));
      res.status(page.status).type("html").send(page.html);
    } catch (error) {
      next(error);
    }
  });
}
