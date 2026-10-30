import type { BlogPost } from "@shared/schema";
import { PUBLIC_PAGE_BY_PATH, SITE_NAME, SITE_URL, isKnownSpaRoute } from "./public-pages";

const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

export interface HtmlResolution {
  status: number;
  html: string;
}

interface RenderData {
  title: string;
  description: string;
  canonical?: string;
  heading: string;
  body: string;
  type?: "website" | "article";
  image?: string;
  noindex?: boolean;
  schema?: Record<string, unknown>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function removeClientOnlyHead(template: string): string {
  return template
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+(?:name|property)="(?:description|robots|author|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, "");
}

function renderHead(data: RenderData): string {
  const fullTitle = data.title.includes(SITE_NAME) ? data.title : `${data.title} | ${SITE_NAME}`;
  const image = data.image || DEFAULT_IMAGE;
  const canonical = data.canonical;
  const schema = data.schema || {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: fullTitle,
    description: data.description,
    url: canonical,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: { "@type": "Pharmacy", name: SITE_NAME, url: SITE_URL },
  };

  return [
    `<title>${escapeHtml(fullTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(data.description)}">`,
    data.noindex ? '<meta name="robots" content="noindex, nofollow">' : "",
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : "",
    `<meta property="og:type" content="${data.type || "website"}">`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(data.description)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : "",
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    '<meta property="og:locale" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(fullTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(data.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>`,
  ].filter(Boolean).join("\n    ");
}

function renderBody(data: RenderData): string {
  return `<main data-server-rendered="true" style="max-width:72rem;margin:0 auto;padding:4rem 1.5rem;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <header><a href="/" aria-label="Concordia Pharmacy home">${SITE_NAME}</a></header>
      <article>
        <h1>${escapeHtml(data.heading)}</h1>
        <p>${escapeHtml(data.body)}</p>
      </article>
    </main>`;
}

function inject(template: string, data: RenderData): string {
  const cleanTemplate = removeClientOnlyHead(template);
  return cleanTemplate
    .replace("</head>", `    ${renderHead(data)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${renderBody(data)}</div>`);
}

function blogRenderData(post: BlogPost, requestedSlug: string): RenderData {
  const slug = post.slug || requestedSlug;
  const canonical = `${SITE_URL}/blog/${slug}`;
  const description = plainText(post.content).slice(0, 157) || `Read ${post.title} from Concordia Pharmacy.`;
  const published = post.publishedAt ?? post.createdAt;
  const modified = post.updatedAt ?? published;
  return {
    title: post.title,
    description,
    canonical,
    heading: post.title,
    body: plainText(post.content),
    type: "article",
    image: post.imageUrl || undefined,
    schema: {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description,
      image: post.imageUrl || DEFAULT_IMAGE,
      datePublished: published,
      dateModified: modified,
      url: canonical,
      mainEntityOfPage: canonical,
      author: { "@type": "Person", name: post.authorName },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  };
}

export async function resolveHtml(
  template: string,
  pathname: string,
  getBlogPost: (slug: string) => Promise<BlogPost | undefined>,
): Promise<HtmlResolution> {
  const normalizedPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  const page = PUBLIC_PAGE_BY_PATH.get(normalizedPath);
  if (page) {
    return {
      status: 200,
      html: inject(template, {
        title: page.title,
        description: page.description,
        canonical: `${SITE_URL}${page.path}`,
        heading: page.heading,
        body: page.summary,
      }),
    };
  }

  const blogMatch = normalizedPath.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    let slug: string;
    try {
      slug = decodeURIComponent(blogMatch[1]);
    } catch {
      slug = "";
    }
    const post = slug.length <= 200 ? await getBlogPost(slug) : undefined;
    if (post && post.isPublished && (!post.expiresAt || new Date(post.expiresAt) >= new Date())) {
      return { status: 200, html: inject(template, blogRenderData(post, slug)) };
    }
    return {
      status: 404,
      html: inject(template, {
        title: "Blog Post Not Found",
        description: "The requested Concordia Pharmacy blog post does not exist or is no longer available.",
        heading: "Blog post not found",
        body: "This article may have been removed. Visit the blog to browse available health and pharmacy articles.",
        noindex: true,
      }),
    };
  }

  if (isKnownSpaRoute(normalizedPath)) {
    return {
      status: 200,
      html: inject(template, {
        title: "Secure Online Services",
        description: "Access Concordia Pharmacy online services.",
        heading: "Concordia Pharmacy online services",
        body: "This interactive page requires JavaScript.",
        noindex: true,
      }),
    };
  }

  return {
    status: 404,
    html: inject(template, {
      title: "Page Not Found",
      description: "The requested page does not exist.",
      heading: "404 Page Not Found",
      body: "The page you requested could not be found. Return to the Concordia Pharmacy home page.",
      noindex: true,
    }),
  };
}