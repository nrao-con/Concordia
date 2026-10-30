import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Calendar, User, ArrowRight, FileText, ExternalLink, Globe } from "lucide-react";
import type { BlogPost } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExternalPost {
  title: string;
  url: string;
  source: string;
  sourceLabel: string;
  publishedAt: string;
}

type GridItem =
  | { kind: "internal"; post: BlogPost }
  | { kind: "external"; post: ExternalPost };

interface CombinedFeedResponse {
  internal: BlogPost[];
  external: ExternalPost[];
}

// ── Category definitions ──────────────────────────────────────────────────────

// Known display labels for predefined slugs (matches admin BLOG_CATEGORIES)
const KNOWN_LABELS: Record<string, string> = {
  "general":      "General",
  "health-tips":  "Health Tips",
  "announcements":"Announcements",
  "medications":  "Medications",
  "wellness":     "Wellness",
  "pharmacy-news":"Pharmacy News",
};

// Preferred display order for known categories
const KNOWN_ORDER = ["medications", "wellness", "pharmacy-news", "health-tips", "announcements", "general"];

function getCategoryLabel(value: string): string {
  if (KNOWN_LABELS[value]) return KNOWN_LABELS[value];
  // Capitalise each word for custom categories
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Maps external RSS sources → our category values
const SOURCE_CATEGORY: Record<string, string> = {
  nih:    "medications",
  cdc:    "wellness",
  who:    "wellness",
  npr:    "health-tips",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExcerpt(content: string, maxLength = 160): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength).replace(/\s+\S*$/, "") + "…";
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  nih:    { color: "text-primary",     bg: "bg-primary/10",     border: "border-primary/20"     },
  cdc:    { color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  npr:    { color: "text-sky-400",     bg: "bg-sky-400/10",     border: "border-sky-400/20"     },
  who:    { color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/20"  },
};

function SourceBadge({ source, label }: { source: string; label: string }) {
  const s = SOURCE_STYLES[source] ?? { color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/20" };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${s.color} ${s.bg} border ${s.border} rounded px-1.5 py-0.5 shrink-0`}>
      <Globe className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ── Skeleton components ───────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:w-[60%] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.06]">
        <Skeleton className="h-72 w-full" />
        <div className="p-6">
          <Skeleton className="h-7 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-4/5 mb-5" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="lg:w-[40%] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.06]">
        <Skeleton className="h-52 w-full" />
        <div className="p-5">
          <Skeleton className="h-5 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3 mb-4" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <Skeleton className="h-36 w-full" />
          <div className="p-4">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-4/5 mb-3" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Category chip bar ─────────────────────────────────────────────────────────

function CategoryChip({
  label,
  active,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={[
        "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-cobalt text-white"
          : "bg-white/[0.06] text-slate-400 hover:bg-white/[0.10] hover:text-slate-200",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ── Hero card (large admin-written post) ──────────────────────────────────────

function HeroPrimary({ post }: { post: BlogPost }) {
  const href = `/blog/${post.slug || post.id}`;
  return (
    <Link href={href} data-testid={`link-hero-primary-${post.id}`}>
      <article className="group cursor-pointer rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover-elevate h-full flex flex-col">
        {post.imageUrl ? (
          <div className="h-72 overflow-hidden shrink-0">
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
              data-testid={`img-hero-primary-${post.id}`}
            />
          </div>
        ) : (
          <div className="h-72 bg-gradient-to-br from-cobalt/20 to-slate-800/60 flex items-center justify-center shrink-0">
            <FileText className="h-16 w-16 text-white/10" />
          </div>
        )}
        <div className="p-6 flex flex-col flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-cobalt">
              From Our Team
            </span>
          </div>
          <h2
            className="text-xl font-bold text-white leading-snug mb-3 line-clamp-3 group-hover:text-cobalt transition-colors"
            data-testid={`text-hero-primary-title-${post.id}`}
          >
            {post.title}
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed line-clamp-3 mb-5 flex-1" data-testid={`text-hero-primary-excerpt-${post.id}`}>
            {getExcerpt(post.content, 220)}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-auto">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1" data-testid={`text-hero-primary-author-${post.id}`}>
                <User className="h-3 w-3" />
                {post.authorName}
              </span>
              {post.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(post.publishedAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-cobalt">
              Read the full story <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function HeroSecondary({ post }: { post: BlogPost }) {
  const href = `/blog/${post.slug || post.id}`;
  return (
    <Link href={href} data-testid={`link-hero-secondary-${post.id}`}>
      <article className="group cursor-pointer rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover-elevate h-full flex flex-col">
        {post.imageUrl ? (
          <div className="h-52 overflow-hidden shrink-0">
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
              data-testid={`img-hero-secondary-${post.id}`}
            />
          </div>
        ) : (
          <div className="h-52 bg-gradient-to-br from-slate-700/40 to-slate-800/60 flex items-center justify-center shrink-0">
            <FileText className="h-12 w-12 text-white/10" />
          </div>
        )}
        <div className="p-5 flex flex-col flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              From Our Team
            </span>
          </div>
          <h2
            className="text-base font-bold text-white leading-snug mb-2 line-clamp-3 group-hover:text-cobalt transition-colors"
            data-testid={`text-hero-secondary-title-${post.id}`}
          >
            {post.title}
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed line-clamp-2 mb-4 flex-1">
            {getExcerpt(post.content, 160)}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-auto">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {post.authorName}
              </span>
              {post.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(post.publishedAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1 text-xs font-medium text-cobalt">
              Read more <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

// ── Small grid card (internal or external) ────────────────────────────────────

function GridCard({ item, index }: { item: GridItem; index: number }) {
  if (item.kind === "internal") {
    const post = item.post;
    const href = `/blog/${post.slug || post.id}`;
    return (
      <Link href={href} data-testid={`link-grid-post-${post.id}`}>
        <article className="group cursor-pointer rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02] hover-elevate h-full flex flex-col">
          {post.imageUrl ? (
            <div className="h-36 overflow-hidden shrink-0">
              <img
                src={post.imageUrl}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="h-36 bg-gradient-to-br from-slate-700/30 to-slate-800/50 flex items-center justify-center shrink-0">
              <FileText className="h-8 w-8 text-white/10" />
            </div>
          )}
          <div className="p-4 flex flex-col flex-1">
            <h3
              className="text-sm font-semibold text-slate-200 leading-snug line-clamp-3 mb-3 flex-1 group-hover:text-white transition-colors"
              data-testid={`text-grid-title-${post.id}`}
            >
              {post.title}
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-auto">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <User className="h-2.5 w-2.5" />
                  {post.authorName}
                </span>
                {post.publishedAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-2.5 w-2.5" />
                    {format(new Date(post.publishedAt), "MMM d")}
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1 text-[11px] text-cobalt/80">
                Read more <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  // External post
  const post = item.post;
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover-elevate h-full"
      data-testid={`link-external-post-${index}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <SourceBadge source={post.source} label={post.sourceLabel} />
        <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-0.5" />
      </div>
      <p
        className="text-sm font-medium text-slate-200 leading-snug line-clamp-4 mb-3 flex-1"
        data-testid={`text-external-title-${index}`}
      >
        {post.title}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-auto">
        <span className="flex items-center gap-1 text-[11px] text-slate-600">
          <Calendar className="h-2.5 w-2.5" />
          {format(new Date(post.publishedAt), "MMM d, yyyy")}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">
          Read More <ArrowRight className="h-2.5 w-2.5" />
        </span>
      </div>
    </a>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

export default function Blog() {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: feedData, isLoading: feedLoading } = useQuery<CombinedFeedResponse>({
    queryKey: ["/api/blog/feed"],
    staleTime: 15 * 60 * 1000,
  });

  const allInternalPosts = feedData?.internal ?? [];
  const allExternalPosts = feedData?.external ?? [];

  // Derive which categories actually have content (data-driven, includes custom categories)
  const populatedCategories = useMemo(() => {
    const set = new Set<string>();
    allInternalPosts.forEach((p) => set.add(p.category ?? "general"));
    allExternalPosts.forEach((p) => {
      const cat = SOURCE_CATEGORY[p.source];
      if (cat) set.add(cat);
    });
    // Sort: known categories in preferred order first, then custom categories alphabetically
    const knownInData = KNOWN_ORDER.filter((v) => set.has(v));
    const customInData = Array.from(set).filter((v) => !KNOWN_ORDER.includes(v)).sort();
    const ordered = [...knownInData, ...customInData];
    return ordered.map((v) => ({ value: v, label: getCategoryLabel(v) }));
  }, [allInternalPosts, allExternalPosts]);

  // Filtered posts based on active category
  const internalPosts = useMemo(() => {
    if (activeCategory === "all") return allInternalPosts;
    return allInternalPosts.filter((p) => (p.category ?? "general") === activeCategory);
  }, [allInternalPosts, activeCategory]);

  const externalPosts = useMemo(() => {
    if (activeCategory === "all") return allExternalPosts;
    return allExternalPosts.filter((p) => SOURCE_CATEGORY[p.source] === activeCategory);
  }, [allExternalPosts, activeCategory]);

  // First 1-2 internal posts → hero; pinned posts always float to the front
  const sortedInternalPosts = useMemo(() => {
    return [...internalPosts].sort((a, b) => {
      if (a.pinnedToHero && !b.pinnedToHero) return -1;
      if (!a.pinnedToHero && b.pinnedToHero) return 1;
      return 0;
    });
  }, [internalPosts]);
  const heroPrimary = sortedInternalPosts[0] ?? null;
  const heroSecondary = sortedInternalPosts[1] ?? null;
  const remainingInternal = sortedInternalPosts.slice(2);

  // Build mixed grid: remaining internal + all external, shuffled once on mount
  const gridItems = useMemo<GridItem[]>(() => {
    const items: GridItem[] = [
      ...remainingInternal.map((p): GridItem => ({ kind: "internal", post: p })),
      ...externalPosts.map((p): GridItem => ({ kind: "external", post: p })),
    ];
    return shuffleArray(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedData, activeCategory]);

  const hasContent = heroPrimary || gridItems.length > 0;
  const visibleItems = gridItems.slice(0, visible);
  const hasMore = visible < gridItems.length;

  // Reset pagination when category changes
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setVisible(PAGE_SIZE);
  };

  return (
    <PageTransition>
      <SEO
        title="Health Blog"
        description="Health tips, pharmacy updates, and curated health news from Concordia Pharmacy and around the web."
        path="/blog"
      />
      <Header />
      <main className="min-h-screen" style={{ background: "hsl(222 47% 8%)" }}>

        {/* ── Page header ──────────────────────────────────────── */}
        <section className="pt-24 pb-10 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <h1
              className="font-heading text-4xl sm:text-5xl font-bold text-white mb-3"
              data-testid="text-blog-heading"
            >
              Health Blog
            </h1>
            <p className="text-slate-400 text-lg max-w-2xl mb-8">
              Pharmacy updates from our team, plus curated health news from around the web.
            </p>

            {/* ── Category filter bar ────────────────────────────────── */}
            {!feedLoading && populatedCategories.length > 0 && (
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by category"
                data-testid="section-category-filter"
              >
                <CategoryChip
                  label="All"
                  active={activeCategory === "all"}
                  onClick={() => handleCategoryChange("all")}
                  testId="chip-category-all"
                />
                {populatedCategories.map((cat) => (
                  <CategoryChip
                    key={cat.value}
                    label={cat.label}
                    active={activeCategory === cat.value}
                    onClick={() => handleCategoryChange(cat.value)}
                    testId={`chip-category-${cat.value}`}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="pb-28 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto space-y-14">

            {/* ── Loading state ─────────────────────────────────── */}
            {feedLoading && (
              <>
                <HeroSkeleton />
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <Skeleton className="h-3 w-32" />
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <GridSkeleton />
                </div>
              </>
            )}

            {/* ── Empty state ───────────────────────────────────── */}
            {!feedLoading && !hasContent && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <FileText className="h-16 w-16 text-slate-700 mb-5" />
                <h2 className="text-xl font-semibold text-white mb-2" data-testid="text-blog-empty">
                  {activeCategory === "all" ? "No posts yet" : "No posts in this category"}
                </h2>
                <p className="text-slate-500 text-sm">
                  {activeCategory === "all"
                    ? "Check back soon for health tips and pharmacy updates."
                    : "Try a different category or check back later."}
                </p>
                {activeCategory !== "all" && (
                  <button
                    onClick={() => handleCategoryChange("all")}
                    className="mt-4 text-sm text-cobalt hover:underline"
                    data-testid="button-clear-category"
                  >
                    Show all posts
                  </button>
                )}
              </div>
            )}

            {/* ── Hero section ──────────────────────────────────── */}
            {!feedLoading && heroPrimary && (
              <div data-testid="section-hero">
                <div
                  className={
                    heroSecondary
                      ? "grid gap-6 lg:grid-cols-[60%_1fr]"
                      : "grid gap-6"
                  }
                >
                  <HeroPrimary post={heroPrimary} />
                  {heroSecondary && <HeroSecondary post={heroSecondary} />}
                </div>
              </div>
            )}

            {/* ── Mixed rotating grid ───────────────────────────── */}
            {!feedLoading && gridItems.length > 0 && (
              <div data-testid="section-mixed-grid">
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    {activeCategory === "all"
                      ? "Latest in Health"
                      : getCategoryLabel(activeCategory)}
                  </h2>
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[11px] text-slate-600">
                    {gridItems.length} {gridItems.length === 1 ? "story" : "stories"}
                    {activeCategory === "all" ? " · refreshed every 30 min" : ""}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleItems.map((item, i) => (
                    <GridCard key={item.kind === "internal" ? `int-${item.post.id}` : `ext-${i}`} item={item} index={i} />
                  ))}
                </div>

                {/* Load more / exhausted */}
                <div className="mt-10 flex justify-center">
                  {hasMore ? (
                    <Button
                      variant="outline"
                      size="default"
                      onClick={() => setVisible((v) => v + PAGE_SIZE)}
                      data-testid="button-load-more"
                    >
                      Load more stories
                    </Button>
                  ) : (
                    gridItems.length > PAGE_SIZE && (
                      <p className="text-sm text-slate-600" data-testid="text-all-loaded">
                        You've seen everything. Check back soon for more.
                      </p>
                    )
                  )}
                </div>
              </div>
            )}

          </div>
        </section>
      </main>
      <SiteFooter />
    </PageTransition>
  );
}
