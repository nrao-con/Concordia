import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SEO } from "@/components/seo";
import { PageTransition } from "@/components/page-transition";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import {
  Leaf, ArrowRight, Clock, ExternalLink, Globe, Sparkles,
  Heart, Pill, Shield, BookOpen, Activity, ChevronRight,
} from "lucide-react";
import type { BlogPost } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExternalPost {
  title: string;
  url: string;
  source: string;
  sourceLabel: string;
  publishedAt: string;
}

interface FeedResponse {
  internal: BlogPost[];
  external: ExternalPost[];
}

type AnyPost =
  | { kind: "internal"; post: BlogPost }
  | { kind: "external"; post: ExternalPost };

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",          label: "All Topics",     icon: Leaf    },
  { id: "health",       label: "Health",          icon: Activity },
  { id: "wellness",     label: "Wellness",        icon: Heart   },
  { id: "pharmacy",     label: "Pharmacy Tips",   icon: Pill    },
  { id: "beauty",       label: "Beauty",          icon: Sparkles },
] as const;

type CategoryId = typeof CATEGORIES[number]["id"];

// Maps to determine which category each post belongs to
function getItemCategory(item: AnyPost): CategoryId {
  if (item.kind === "external") {
    const src = item.post.source;
    if (src === "reddit") return "pharmacy";
    if (src === "nih" || src === "cdc" || src === "npr") return "health";
    if (src === "who") return "wellness";
    return "health";
  }
  const cat = item.post.category ?? "general";
  if (cat === "wellness") return "wellness";
  if (cat === "health-tips" || cat === "medications") return "health";
  if (cat === "pharmacy-news") return "pharmacy";
  if (cat === "beauty") return "beauty";
  return "health";
}

// ── Source badge ───────────────────────────────────────────────────────────────

const SOURCE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  reddit: { color: "text-orange-200",  bg: "bg-orange-200/[0.07]",  border: "border-orange-200/15"  },
  nih:    { color: "text-primary/80",  bg: "bg-primary/[0.07]",     border: "border-primary/15"     },
  cdc:    { color: "text-emerald-200", bg: "bg-emerald-200/[0.07]", border: "border-emerald-200/15" },
  npr:    { color: "text-sky-200",     bg: "bg-sky-200/[0.07]",     border: "border-sky-200/15"     },
  who:    { color: "text-purple-200",  bg: "bg-purple-200/[0.07]",  border: "border-purple-200/15"  },
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

// ── Estimate read time ─────────────────────────────────────────────────────────

function readTime(text: string): string {
  const words = text.trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    try {
      return format(new Date(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  }
}

// ── Hero card ──────────────────────────────────────────────────────────────────

function HeroCard({ item }: { item: AnyPost }) {
  if (item.kind === "external") {
    const p = item.post;
    return (
      <a
        href={p.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
        data-testid="link-wellness-hero-external"
      >
        <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover-elevate">
          <div className="h-56 sm:h-72 bg-gradient-to-br from-primary/20 via-emerald-500/10 to-slate-900 flex items-center justify-center relative">
            <Leaf className="h-24 w-24 text-primary/15" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <SourceBadge source={p.source} label={p.sourceLabel} />
            </div>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
              <Clock className="h-3 w-3" />
              <span>{formatDate(p.publishedAt)}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-primary transition-colors line-clamp-3">
              {p.title}
            </h2>
            <span className="inline-flex items-center gap-1.5 text-sm text-primary font-medium mt-3">
              Read article <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </a>
    );
  }
  const p = item.post;
  const href = `/blog/${p.slug || p.id}`;
  return (
    <Link href={href} data-testid={`link-wellness-hero-${p.id}`}>
      <div className="group block rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover-elevate cursor-pointer">
        {p.imageUrl ? (
          <div className="h-56 sm:h-72 overflow-hidden relative">
            <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
          </div>
        ) : (
          <div className="h-56 sm:h-72 bg-gradient-to-br from-primary/20 via-emerald-500/10 to-slate-900 flex items-center justify-center relative">
            <BookOpen className="h-24 w-24 text-primary/15" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
            <Clock className="h-3 w-3" />
            <span>{p.createdAt ? formatDate(String(p.createdAt)) : "Recent"}</span>
            {p.content && <><span>·</span><span>{readTime(p.content)}</span></>}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-primary transition-colors line-clamp-3">
            {p.title}
          </h2>
          {p.content && <p className="text-slate-400 text-sm leading-relaxed line-clamp-2">{p.content.substring(0, 160).replace(/\s+\S*$/, "") + "…"}</p>}
          <span className="inline-flex items-center gap-1.5 text-sm text-primary font-medium mt-3">
            Read more <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Tip card ───────────────────────────────────────────────────────────────────

function TipCard({ item, index }: { item: AnyPost; index: number }) {
  if (item.kind === "external") {
    const p = item.post;
    return (
      <a
        href={p.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col rounded-xl overflow-hidden border border-white/[0.07] bg-white/[0.02] hover-elevate"
        data-testid={`link-wellness-card-external-${index}`}
      >
        <div className="h-32 bg-gradient-to-br from-primary/10 to-slate-800 flex items-center justify-center relative">
          <Leaf className="h-12 w-12 text-primary/10" />
          <div className="absolute bottom-2 left-2">
            <SourceBadge source={p.source} label={p.sourceLabel} />
          </div>
        </div>
        <div className="p-4 flex flex-col flex-1">
          <p className="text-xs text-slate-500 mb-1.5">{formatDate(p.publishedAt)}</p>
          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-3 mb-2 group-hover:text-primary transition-colors flex-1">
            {p.title}
          </h3>
          <span className="inline-flex items-center gap-1 text-xs text-primary/70 font-medium mt-1">
            Read <ExternalLink className="h-3 w-3" />
          </span>
        </div>
      </a>
    );
  }
  const p = item.post;
  const href = `/blog/${p.slug || p.id}`;
  return (
    <Link href={href} data-testid={`link-wellness-card-${p.id}`}>
      <div className="group flex flex-col rounded-xl overflow-hidden border border-white/[0.07] bg-white/[0.02] hover-elevate cursor-pointer h-full">
        {p.imageUrl ? (
          <div className="h-32 overflow-hidden">
            <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-br from-primary/10 to-slate-800 flex items-center justify-center">
            <BookOpen className="h-12 w-12 text-primary/10" />
          </div>
        )}
        <div className="p-4 flex flex-col flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            {p.content && <span className="text-xs text-slate-500">{readTime(p.content)}</span>}
          </div>
          <h3 className="text-sm font-semibold text-white leading-snug line-clamp-3 mb-2 group-hover:text-primary transition-colors flex-1">
            {p.title}
          </h3>
          <span className="inline-flex items-center gap-1 text-xs text-primary/70 font-medium mt-1">
            Read more <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────────

function HeroSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
      <Skeleton className="h-72 w-full" />
      <div className="p-6">
        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="h-7 w-4/5 mb-2" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-2/3 mb-4" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
          <Skeleton className="h-32 w-full" />
          <div className="p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-3/4 mb-3" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Static curated spotlight tiles ────────────────────────────────────────────

const SPOTLIGHTS = [
  { icon: Shield,   label: "Allergy Season",   desc: "Managing pollen and dust mites",      bg: "bg-slate-700/40", color: "text-emerald-200" },
  { icon: Heart,    label: "Heart Health",      desc: "Blood pressure and cholesterol tips", bg: "bg-slate-700/40", color: "text-rose-200"    },
  { icon: Activity, label: "Staying Active",    desc: "Exercise and movement guidance",      bg: "bg-slate-700/40", color: "text-sky-200"     },
  { icon: Sparkles, label: "Skin & Beauty",     desc: "Sunscreen, moisturizer, and more",   bg: "bg-slate-700/40", color: "text-purple-200"  },
];

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Wellness() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("all");

  const { data, isLoading } = useQuery<FeedResponse>({
    queryKey: ["/api/blog/feed"],
  });

  const allItems = useMemo<AnyPost[]>(() => {
    if (!data) return [];
    const internals: AnyPost[] = (data.internal ?? []).map((p) => ({ kind: "internal" as const, post: p }));
    const externals: AnyPost[] = (data.external ?? []).map((p) => ({ kind: "external" as const, post: p }));
    return [...internals, ...externals];
  }, [data]);

  const filtered = useMemo<AnyPost[]>(() => {
    if (activeCategory === "all") return allItems;
    return allItems.filter((item) => getItemCategory(item) === activeCategory);
  }, [allItems, activeCategory]);

  const hero = filtered[0];
  const rest = filtered.slice(1);

  return (
    <PageTransition className="min-h-screen clinical-hero-bg clinical-dark-page">
      <SEO
        title="Wellness Zone"
        description="Pharmacy-curated health tips, wellness guides, and medication advice from Concordia Pharmacy. Featuring content from the CDC, NIH, WHO, and our clinical team."
        path="/wellness"
      />
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-6xl">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
              <Link href="/">
                <span className="hover:text-primary transition-colors cursor-pointer">Home</span>
              </Link>
              <span>/</span>
              <span className="text-slate-300">Wellness Zone</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <Leaf className="h-5 w-5 text-emerald-200" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white">Wellness Zone</h1>
            </div>
            <p className="text-slate-400 max-w-xl">
              Health tips, wellness guides, and medication advice, curated from trusted sources including the CDC, NIH, WHO, and our clinical team.
            </p>
          </div>
          <Link href="/blog">
            <Button variant="outline" size="sm" className="gap-2 shrink-0" data-testid="button-wellness-to-blog">
              <BookOpen className="h-4 w-4" />
              Full Health Blog
            </Button>
          </Link>
        </div>

        {/* Spotlight tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {SPOTLIGHTS.map((s) => (
            <div
              key={s.label}
              className={`flex items-center gap-3 p-3 rounded-xl border border-white/[0.07] ${s.bg} hover-elevate cursor-default`}
              data-testid={`tile-wellness-spotlight-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <s.icon className={`h-5 w-5 flex-shrink-0 ${s.color}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{s.label}</p>
                <p className="text-[10px] text-slate-400 truncate">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-8 no-scrollbar">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const active = activeCategory === id;
            const count = id === "all"
              ? allItems.length
              : allItems.filter((i) => getItemCategory(i) === id).length;
            return (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                data-testid={`button-wellness-category-${id}`}
                className={[
                  "shrink-0 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors border",
                  active
                    ? "bg-primary text-white border-primary/50"
                    : "bg-white/[0.05] text-slate-400 border-white/[0.07] hover:bg-white/[0.09] hover:text-slate-200",
                ].join(" ")}
              >
                <Icon className="h-3 w-3" />
                {label}
                {count > 0 && (
                  <span className={`text-[10px] px-1 rounded-full ${active ? "bg-white/20" : "bg-white/10"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sources note */}
        <div className="flex flex-wrap gap-2 mb-8 items-center">
          <span className="text-xs text-slate-500">Sources:</span>
          {[
            { source: "cdc",    label: "CDC"   },
            { source: "nih",    label: "NIH"   },
            { source: "npr",    label: "NPR Health" },
            { source: "who",    label: "WHO"   },
          ].map(({ source, label }) => (
            <SourceBadge key={source} source={source} label={label} />
          ))}
          <span className="text-xs text-slate-500 ml-1">+ Concordia pharmacists</span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-8">
            <HeroSkeleton />
            <GridSkeleton />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <Leaf className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No articles in this category yet. Check back soon.</p>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setActiveCategory("all")}>
              View all topics
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {hero && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Featured</p>
                <HeroCard item={hero} />
              </div>
            )}

            {rest.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  {activeCategory === "all" ? "More Tips & Guides" : `${CATEGORIES.find(c => c.id === activeCategory)?.label} Articles`}
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rest.map((item, i) => (
                    <TipCard key={i} item={item} index={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold mb-1">Want to talk to a pharmacist?</p>
            <p className="text-sm text-slate-400">Our team is available Monday to Friday, 9AM to 7PM, and Saturday, 10AM to 4PM.</p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <a href="tel:+17183282833">
              <Button variant="outline" size="sm" data-testid="button-wellness-call">Call (718) 328-2833</Button>
            </a>
            <Link href="/signup">
              <Button size="sm" className="gap-2" data-testid="button-wellness-become-patient">
                Become a Patient <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

      </main>

      <SiteFooter />
    </PageTransition>
  );
}
