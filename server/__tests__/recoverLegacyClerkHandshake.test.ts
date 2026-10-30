import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recoverLegacyClerkHandshake } from "../middlewares/recoverLegacyClerkHandshake";

afterEach(() => vi.unstubAllEnvs());

describe("legacy Clerk handshake recovery", () => {
  const createApp = () => {
    const app = express();
    app.use("/api/__clerk", recoverLegacyClerkHandshake);
    app.use("/api/__clerk", (_req, res) => res.status(418).end());
    return app;
  };

  const request = async (path: string) => {
    const server = createApp().listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No test port");
      return await fetch(`http://127.0.0.1:${address.port}${path}`, {
        redirect: "manual",
      });
    } finally {
      server.close();
    }
  };

  it("returns to a fresh canonical page without reflecting session tokens", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITE_USE_DIRECT_CLERK", "true");

    const response = await request(
      "/api/__clerk/v1/client/handshake?__session=private-token&redirect_url=https%3A%2F%2Fexample.org",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://concordianyc.com/",
    );
    expect(response.headers.get("location")).not.toContain("private-token");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not intercept other proxy requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITE_USE_DIRECT_CLERK", "true");
    expect((await request("/api/__clerk/v1/client")).status).toBe(418);
  });

  it("leaves the managed Clerk proxy in place", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITE_USE_DIRECT_CLERK", "false");
    expect((await request("/api/__clerk/v1/client/handshake")).status).toBe(418);
  });
});