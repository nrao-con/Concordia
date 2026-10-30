import type { Express, Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { storage } from "./storage";

const MCP_PATH = "/mcp";
const MAX_REQUESTS_PER_MINUTE = 120;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

type PublicProduct = Awaited<ReturnType<typeof storage.getWebsiteProducts>>[number];

function sanitizeProduct(product: PublicProduct, baseUrl: string) {
  const imageUrl = product.imageUrl?.startsWith("/")
    ? `${baseUrl}${product.imageUrl}`
    : product.imageUrl || null;

  return {
    id: product.id,
    name: product.name,
    category: product.category || null,
    description: product.description || null,
    price: product.price == null ? null : Number(product.price),
    inStock: product.inStock ?? Number(product.stockQuantity) > 0,
    imageUrl,
    requiresPrescription: false,
    availabilityNotice:
      "Website availability is informational and must be confirmed by Concordia Pharmacy before purchase or fulfillment.",
  };
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function createPublicMcpServer(baseUrl: string) {
  const server = new McpServer({
    name: "concordia-pharmacy-public",
    version: "1.0.0",
    title: "Concordia Pharmacy Public Information",
    websiteUrl: baseUrl,
  });

  const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };

  server.registerTool(
    "get_pharmacy_info",
    {
      title: "Get Concordia Pharmacy information",
      description:
        "Returns verified public contact details, opening hours, location, and safe guidance. Does not access patient records.",
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    async () =>
      textResult({
        name: "Concordia Pharmacy",
        phone: "(718) 328-2833",
        address: "898 East Tremont Ave, Bronx, NY 10460",
        hours: {
          mondayToFriday: "9:00 AM–7:00 PM",
          saturday: "9:00 AM–5:00 PM",
          sunday: "Closed",
        },
        website: baseUrl,
        safety:
          "For a medical emergency, call 911. Do not send patient identifiers, prescription numbers, medical details, or payment information through public MCP tools.",
      }),
  );

  server.registerTool(
    "list_catalog_categories",
    {
      title: "List public catalog categories",
      description: "Lists categories in Concordia Pharmacy's public over-the-counter catalog.",
      inputSchema: {},
      annotations: readOnlyAnnotations,
    },
    async () => {
      const products = await storage.getWebsiteProducts();
      const categories = [...new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b));
      return textResult({ categories });
    },
  );

  server.registerTool(
    "search_catalog",
    {
      title: "Search the public OTC catalog",
      description:
        "Searches public, non-prescription website products. Results omit internal inventory counts and identifiers.",
      inputSchema: {
        query: z.string().trim().max(100).optional().describe("Product name or description"),
        category: z.string().trim().max(80).optional().describe("Exact category name"),
        inStockOnly: z.boolean().default(false).describe("Return only products currently marked in stock"),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ query, category, inStockOnly, limit }) => {
      const products = await storage.getWebsiteProducts();
      const normalizedQuery = query?.toLowerCase();
      const normalizedCategory = category?.toLowerCase();
      const matches = products.filter((product) => {
        if (normalizedCategory && product.category?.toLowerCase() !== normalizedCategory) return false;
        if (inStockOnly && !(product.inStock ?? Number(product.stockQuantity) > 0)) return false;
        if (!normalizedQuery) return true;
        return (
          product.name.toLowerCase().includes(normalizedQuery) ||
          product.description?.toLowerCase().includes(normalizedQuery)
        );
      });

      return textResult({
        products: matches.slice(0, limit).map((product) => sanitizeProduct(product, baseUrl)),
        returned: Math.min(matches.length, limit),
        moreAvailable: matches.length > limit,
      });
    },
  );

  server.registerTool(
    "get_catalog_product",
    {
      title: "Get a public catalog product",
      description: "Returns sanitized public details for one OTC catalog product ID.",
      inputSchema: {
        id: z.string().trim().min(1).max(100),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ id }) => {
      const products = await storage.getWebsiteProducts();
      const product = products.find((candidate) => candidate.id === id);
      return textResult(
        product
          ? { found: true, product: sanitizeProduct(product, baseUrl) }
          : { found: false, message: "Product not found in the public catalog." },
      );
    },
  );

  return server;
}

function allowRequest(req: Request, res: Response): boolean {
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "Cross-origin browser requests are not allowed." });
        return false;
      }
    } catch {
      res.status(400).json({ error: "Invalid Origin header." });
      return false;
    }
  }

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const existing = rateWindows.get(key);
  const window = !existing || now - existing.startedAt >= 60_000
    ? { startedAt: now, count: 0 }
    : existing;
  window.count += 1;
  rateWindows.set(key, window);
  if (window.count > MAX_REQUESTS_PER_MINUTE) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "MCP request limit exceeded." });
    return false;
  }
  return true;
}

export function registerPublicMcp(app: Express) {
  app.get("/.well-known/mcp.json", (req, res) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      name: "Concordia Pharmacy Public Information",
      description: "Read-only public pharmacy information and OTC catalog access.",
      transport: "streamable-http",
      endpoint: `${baseUrl}${MCP_PATH}`,
      authentication: "none",
      scope: "public-read-only",
    });
  });

  app.post(MCP_PATH, async (req, res) => {
    if (!allowRequest(req, res)) return;

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const server = createPublicMcpServer(baseUrl);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("[Public MCP] Request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal MCP server error" },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Use POST for this stateless MCP endpoint." },
      id: null,
    });
  };
  app.get(MCP_PATH, methodNotAllowed);
  app.delete(MCP_PATH, methodNotAllowed);
}