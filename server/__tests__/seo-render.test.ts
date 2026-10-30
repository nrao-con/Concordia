import { describe, expect, it, vi } from "vitest";
import { resolveHtml } from "../seo-render";

const template = `<!doctype html>
<html>
  <head>
    <title>Generic</title>
    <meta name="description" content="Generic">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe("public HTML resolution", () => {
  it("renders route-specific metadata and visible content for public pages", async () => {
    const result = await resolveHtml(template, "/find-doctor", vi.fn());

    expect(result.status).toBe(200);
    expect(result.html).toContain("<title>Find a Doctor | Concordia Pharmacy</title>");
    expect(result.html).toContain("<h1>Find a doctor near you</h1>");
    expect(result.html).toContain('rel="canonical" href="https://concordianyc.com/find-doctor"');
  });

  it("returns a noindex 404 without a canonical for missing blog posts", async () => {
    const result = await resolveHtml(template, "/blog/missing-post", vi.fn().mockResolvedValue(undefined));

    expect(result.status).toBe(404);
    expect(result.html).toContain("<h1>Blog post not found</h1>");
    expect(result.html).toContain('name="robots" content="noindex, nofollow"');
    expect(result.html).not.toContain('rel="canonical"');
  });

  it("treats malformed encoded blog slugs as a noindex 404", async () => {
    const result = await resolveHtml(template, "/blog/%E0%A4%A", vi.fn());

    expect(result.status).toBe(404);
    expect(result.html).toContain('name="robots" content="noindex, nofollow"');
  });

  it("returns a noindex 404 for an unknown public URL", async () => {
    const result = await resolveHtml(template, "/does-not-exist", vi.fn());

    expect(result.status).toBe(404);
    expect(result.html).toContain("<h1>404 Page Not Found</h1>");
    expect(result.html).toContain('name="robots" content="noindex, nofollow"');
  });

  it("keeps known interactive routes available but out of the index", async () => {
    const result = await resolveHtml(template, "/admin/patients/123", vi.fn());

    expect(result.status).toBe(200);
    expect(result.html).toContain('name="robots" content="noindex, nofollow"');
  });
});