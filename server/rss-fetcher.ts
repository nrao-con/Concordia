export interface ExternalPost {
  title: string;
  url: string;
  source: string;
  sourceLabel: string;
  publishedAt: string;
}

interface CacheEntry {
  data: ExternalPost[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

// Health news RSS sources — all link to readable HTML article pages.
const FEED_SOURCES: Array<{
  url: string;
  source: string;
  sourceLabel: string;
  type: "rss" | "atom";
}> = [
  // NIH MedlinePlus (RSS 2.0)
  {
    url: "https://medlineplus.gov/rss/news.xml",
    source: "nih",
    sourceLabel: "NIH MedlinePlus",
    type: "rss",
  },
  // CDC Health Headlines — links to actual cdc.gov article pages
  {
    url: "https://www.cdc.gov/media/syndication/rss/cdc.xml",
    source: "cdc",
    sourceLabel: "CDC",
    type: "rss",
  },
  // NPR Health
  {
    url: "https://feeds.npr.org/1027/rss.xml",
    source: "npr",
    sourceLabel: "NPR Health",
    type: "rss",
  },
  // WHO News
  {
    url: "https://www.who.int/rss-feeds/news-english.xml",
    source: "who",
    sourceLabel: "WHO News",
    type: "rss",
  },
];

// ── Domain relevance filter ───────────────────────────────────────────────────
// Only keep articles whose title mentions at least one health-domain keyword.
// This prevents off-topic Reddit posts (politics, sports, memes, etc.) from
// appearing in the wellness feed.
const HEALTH_KEYWORDS = [
  // Core medical / pharmacy
  "health", "medical", "medicine", "medication", "drug", "drugs", "pill", "pills",
  "prescription", "pharmacy", "pharmacist", "pharmaceutical", "otc",
  // Providers & settings
  "doctor", "physician", "nurse", "hospital", "clinic", "patient",
  // Conditions, treatments, procedures
  "disease", "condition", "disorder", "symptom", "symptoms", "diagnosis",
  "treatment", "therapy", "surgery", "vaccine", "vaccination", "immunization",
  "allergy", "allergies", "chronic", "acute", "infection", "virus", "bacterial",
  // Meds & supplements
  "antibiotic", "insulin", "opioid", "statin", "antidepressant",
  "vitamin", "supplement", "mineral", "probiotic", "omega",
  // Wellness / lifestyle
  "wellness", "nutrition", "diet", "weight", "exercise", "fitness", "sleep",
  "mental health", "anxiety", "depression", "stress", "mindfulness",
  "blood pressure", "cholesterol", "diabetes", "heart", "cancer",
  "immune", "gut", "inflammation",
  // Beauty / personal care (in scope)
  "skincare", "skin care", "sunscreen", "moisturizer", "spf", "acne",
  "beauty", "hair care", "haircare",
  // Insurance / coverage
  "insurance", "coverage", "medicare", "medicaid", "copay", "deductible",
  "prior authorization", "formulary",
  // Common headline phrases
  "fda", "cdc", "nih", "who ", "study finds", "research shows",
];

function isHealthDomainPost(title: string): boolean {
  const lc = title.toLowerCase();
  return HEALTH_KEYWORDS.some((kw) => lc.includes(kw));
}

// Reject URLs that don't point to a readable HTML article page.
// The old CDC tools.cdc.gov feed returned file download endpoints instead of pages.
const BLOCKED_URL_PATTERNS = [
  /downloader\/download\.asp/i,
  /\/api\/embed\//i,
  /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|tar|gz)(\?|$)/i,
];

function isReadableArticleUrl(url: string): boolean {
  if (!url.startsWith("http")) return false;
  return !BLOCKED_URL_PATTERNS.some((p) => p.test(url));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeEntities(stripCdata(m[1])).trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*?)["']`, "i"));
  return m ? m[1] : "";
}

function toISOSafe(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return new Date().toISOString();
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/** Parse Atom feeds (Reddit's public .rss endpoint uses Atom). */
function parseAtom(xml: string, source: string, sourceLabel: string): ExternalPost[] {
  const posts: ExternalPost[] = [];
  const entryRx = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRx.exec(xml)) !== null) {
    const entry = m[1];
    const title = extractTag(entry, "title");
    // Atom <link> carries the URL as an href attribute
    const link = extractAttr(entry, "link", "href") || extractTag(entry, "link");
    const updated = extractTag(entry, "updated") || extractTag(entry, "published");
    if (!title || !link || !isReadableArticleUrl(link)) continue;
    // Skip meta/sticky threads and off-topic posts
    const lc = title.toLowerCase();
    if (lc.includes("daily thread") || lc.includes("weekly thread") || lc.includes("mod post")) continue;
    if (!isHealthDomainPost(title)) continue;
    posts.push({
      title: decodeEntities(title).slice(0, 200),
      url: link,
      source,
      sourceLabel,
      publishedAt: toISOSafe(updated),
    });
  }
  return posts.slice(0, 8);
}

/** Parse RSS 2.0 feeds. */
function parseRSS(xml: string, source: string, sourceLabel: string): ExternalPost[] {
  const posts: ExternalPost[] = [];
  const itemRx = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(xml)) !== null) {
    const item = m[1];
    const title = extractTag(item, "title");
    // In RSS 2.0 <link> is plain text content (not an href attribute)
    const linkText = item.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() ?? "";
    const linkAttr = extractAttr(item, "link", "href");
    const link = linkText || linkAttr;
    const pubDate =
      extractTag(item, "pubDate") ||
      extractTag(item, "updated") ||
      extractTag(item, "dc:date");
    if (!title || !link || !isReadableArticleUrl(link)) continue;
    if (!isHealthDomainPost(title)) continue;
    posts.push({
      title: decodeEntities(title).slice(0, 200),
      url: link,
      source,
      sourceLabel,
      publishedAt: toISOSafe(pubDate),
    });
  }
  return posts.slice(0, 10);
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchOneFeed(
  feed: (typeof FEED_SOURCES)[0]
): Promise<ExternalPost[]> {
  const cached = cache.get(feed.url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent":
          "ConcordiaPharmacy/1.0 (+https://concordianyc.com; health-blog-aggregator)",
        Accept: "application/atom+xml, application/rss+xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[RSS] ${feed.url} → HTTP ${res.status}`);
      return cached?.data ?? [];
    }

    const xml = await res.text();

    // Bail if response is HTML (blocked by CDN/firewall)
    if (xml.trimStart().startsWith("<!DOCTYPE") || xml.trimStart().startsWith("<html")) {
      console.warn(`[RSS] ${feed.url} returned HTML (likely blocked)`);
      return cached?.data ?? [];
    }

    const hasAtomEntries = xml.includes("<entry");
    const hasRSSItems = xml.includes("<item");
    if (!hasAtomEntries && !hasRSSItems) {
      console.warn(`[RSS] ${feed.url} returned neither <entry> nor <item> content`);
      return cached?.data ?? [];
    }

    const posts =
      feed.type === "atom" || (hasAtomEntries && !hasRSSItems)
        ? parseAtom(xml, feed.source, feed.sourceLabel)
        : parseRSS(xml, feed.source, feed.sourceLabel);

    cache.set(feed.url, { data: posts, fetchedAt: Date.now() });
    return posts;
  } catch (err) {
    console.warn(`[RSS] fetch error for ${feed.url}:`, (err as Error).message);
    return cached?.data ?? [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchAllFeeds(): Promise<ExternalPost[]> {
  const results = await Promise.allSettled(FEED_SOURCES.map(fetchOneFeed));
  const all: ExternalPost[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  // Shuffle for variety across sources
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export function clearFeedCache(): void {
  cache.clear();
  console.log("[RSS] Cache cleared");
}
