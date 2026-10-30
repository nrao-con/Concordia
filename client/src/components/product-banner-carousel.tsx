import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import type { SeasonContext } from "@/lib/seasonal-calendar";
import { getSeasonStyle } from "@/lib/season-banners";
import { getAvailableProductQuantity } from "@shared/cart-utils";

function getCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    rx: "RX", "weight-management": "Weight Mgmt", diabetes: "Diabetes",
    "heart-vitality": "Heart", "mens-womens-health": "Health",
    wellness: "Wellness", pain: "Pain", skin: "Skin", headache: "Headache",
    digestive: "Digestive", dental: "Dental", otc: "OTC", grocery: "Grocery",
    "Pain Relief": "Pain Relief", Vitamins: "Vitamins",
    Supplements: "Supplements", "Cold & Flu": "Cold & Flu",
    "First Aid": "First Aid", "Sleep Aid": "Sleep Aid", Allergy: "Allergy",
  };
  return map[category] || (category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " "));
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return reduced;
}

// ── Single slide overlay (sits above the seasonal bg image) ──────────────────
function SlideOverlay({
  product, isAdded, isPending, onAdd, onViewDetails, seasonContext,
}: {
  product: Product;
  isAdded: boolean;
  isPending: boolean;
  onAdd: () => void;
  onViewDetails: () => void;
  seasonContext?: SeasonContext;
}) {
  const style  = getSeasonStyle(seasonContext?.themeKey ?? "summer");
  const label  = seasonContext?.label ?? "Today's Pick";
  const Icon   = style.icon;

  return (
    <div
      className="relative h-full flex items-end p-6 md:p-10 cursor-pointer group"
      onClick={onViewDetails}
      data-testid="slide-overlay"
    >
      {/* left column — text */}
      <div className="flex-1 min-w-0 space-y-3 max-w-[60%]">

        {/* ── Big seasonal label ─────────────────────────────────────── */}
        <div className="flex items-center gap-2.5" data-testid="badge-todays-pick">
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-sm"
            style={{ background: `${style.accentColor}22`, border: `1.5px solid ${style.accentColor}55` }}
          >
            <Icon className="w-4 h-4" style={{ color: style.accentColor }} />
          </span>
          <span
            className="text-3xl md:text-4xl font-extrabold tracking-tight uppercase"
            style={{
              background: style.labelGradient,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              letterSpacing: "-0.02em",
            }}
          >
            {label}
          </span>
        </div>

        {/* season copy */}
        {seasonContext?.copy && (
          <p className="text-sm text-white/65 leading-snug line-clamp-2 max-w-sm" data-testid="text-season-copy">
            {seasonContext.copy}
          </p>
        )}

        {/* product name */}
        <h3
          className="text-xl md:text-2xl font-bold text-white leading-tight line-clamp-2"
          data-testid="text-product-name"
        >
          {product.name}
        </h3>

        {/* category + price row */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="bg-white/10 text-white/75 text-xs no-default-hover-elevate no-default-active-elevate">
            {getCategoryLabel(product.category)}
          </Badge>
          <span className="text-2xl md:text-3xl font-bold text-white" data-testid="text-product-price">
            ${parseFloat(product.price).toFixed(2)}
          </span>
        </div>

        {/* CTA row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              disabled={getAvailableProductQuantity(product) <= 0 || isPending || isAdded}
              className="rounded-full gap-1.5 text-sm font-semibold"
              style={{
                background: style.accentColor,
                color: "#0f172a",
                border: "none",
              }}
              data-testid={`button-banner-add-${product.id}`}
            >
              {isAdded
                ? <><Check className="h-4 w-4" /> Added</>
                : <><Plus className="h-4 w-4" /> Add to Cart</>}
            </Button>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
            className="flex items-center gap-1 text-xs font-medium text-white/70 hover:text-white transition-colors"
            data-testid={`button-banner-view-${product.id}`}
          >
            View details <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* right column — product image card */}
      {product.imageUrl && (
        <div
          className="hidden md:block absolute bottom-6 right-8 w-40 h-40 rounded-2xl overflow-hidden shadow-2xl"
          style={{ border: `2px solid ${style.accentColor}40`, boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)" }}
        >
          <img
            src={product.imageUrl} alt={product.name}
            className="w-full h-full object-cover"
            decoding="async" width="160" height="160"
          />
        </div>
      )}
    </div>
  );
}

// ── Featured product selector ─────────────────────────────────────────────────
export function getFeaturedProducts(products: Product[], priorityTags?: string[]): Product[] {
  const eligible = products.filter(
    (p) => getAvailableProductQuantity(p) > 0 && !p.requiresPrescription,
  );
  if (!priorityTags || priorityTags.length === 0)
    return eligible.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 5);

  const tagSet   = new Set(priorityTags.map((t) => t.toLowerCase()));
  const byPrice  = (a: Product, b: Product) => parseFloat(b.price) - parseFloat(a.price);
  const matching = eligible.filter((p) =>  tagSet.has(p.category.toLowerCase())).sort(byPrice);
  const rest     = eligible.filter((p) => !tagSet.has(p.category.toLowerCase()));
  // Keep the server's catalog order stable. Product discovery should not move
  // underneath a patient between visits.
  return [...matching, ...rest].slice(0, 5);
}

// ── Main carousel ─────────────────────────────────────────────────────────────
export function ProductBannerCarousel({
  products, onAddToCart, addedToCart, isPending, seasonContext, onProductClick,
}: {
  products: Product[];
  onAddToCart: (productId: string, quantity?: number) => void;
  addedToCart: Set<string>;
  isPending: boolean;
  seasonContext?: SeasonContext;
  onProductClick?: (product: Product) => void;
}) {
  const [current, setCurrent]     = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused]   = useState(false);
  const reducedMotion = useReducedMotion();

  const featured = useMemo(
    () => getFeaturedProducts(products, seasonContext?.categoryTags),
    [products, seasonContext]
  );

  const goTo = useCallback((idx: number, dir: number) => {
    setDirection(dir);
    setCurrent(idx);
  }, []);

  const next = useCallback(() => {
    if (featured.length > 0) goTo((current + 1) % featured.length, 1);
  }, [featured.length, current, goTo]);

  const prev = useCallback(() => {
    if (featured.length > 0) goTo((current - 1 + featured.length) % featured.length, -1);
  }, [featured.length, current, goTo]);

  useEffect(() => {
    if (isPaused || reducedMotion || featured.length <= 1) return;
    const id = setInterval(next, 6000);
    return () => clearInterval(id);
  }, [isPaused, reducedMotion, next, featured.length]);

  // Clamp stale index when the featured list shrinks
  useEffect(() => {
    if (featured.length > 0 && current >= featured.length) {
      setCurrent(0);
    }
  }, [featured.length, current]);

  if (featured.length === 0) return null;

  const product = featured[current];
  if (!product) return null;
  const seasonStyle = getSeasonStyle(seasonContext?.themeKey ?? "summer");

  const slideVariants = {
    enter:  (dir: number) => ({ x: reducedMotion ? 0 : dir * 60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (dir: number) => ({ x: reducedMotion ? 0 : -dir * 60, opacity: 0 }),
  };

  const arrowClass = `absolute top-1/2 -translate-y-1/2 z-20 flex items-center justify-center
    w-10 h-10 rounded-full backdrop-blur-md transition-all duration-200
    bg-black/30 hover:bg-black/50 text-white border border-white/15`;

  return (
    <div
      className="relative w-full select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid="product-banner-carousel"
    >
      {/* ── Seasonal background image — constant beneath sliding content ── */}
      <div className="relative h-[300px] md:h-[360px] w-full rounded-2xl overflow-hidden">
        {/* bg photo */}
        <img
          src={seasonStyle.bannerUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "brightness(0.7) saturate(1.15)" }}
        />
        {/* seasonal colour wash */}
        <div
          className="absolute inset-0"
          style={{ background: seasonStyle.overlayGradient }}
        />

        {/* sliding product content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reducedMotion ? 0 : 0.36, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute inset-0"
          >
            <SlideOverlay
              product={product}
              isAdded={addedToCart.has(product.id)}
              isPending={isPending}
              onAdd={() => onAddToCart(product.id)}
              onViewDetails={() => onProductClick?.(product)}
              seasonContext={seasonContext}
            />
          </motion.div>
        </AnimatePresence>

        {/* prev / next arrows */}
        {featured.length > 1 && (
          <>
            <button onClick={prev} className={`${arrowClass} left-3`} aria-label="Previous product" data-testid="banner-prev">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={next} className={`${arrowClass} right-3`} aria-label="Next product" data-testid="banner-next">
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* dot indicators */}
      {featured.length > 1 && (
        <div className="flex items-center justify-center gap-2.5 mt-4" data-testid="banner-dot-indicators">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > current ? 1 : -1)}
              className="rounded-full transition-all duration-300"
              style={{
                width:  i === current ? "28px" : "8px",
                height: "8px",
                background: i === current ? seasonStyle.accentColor : "rgba(148,163,184,0.35)",
              }}
              aria-label={`Go to slide ${i + 1}`}
              data-testid={`banner-dot-${i}`}
            />
          ))}
          <span className="text-xs text-slate-400 ml-1 tabular-nums">
            {current + 1} / {featured.length}
          </span>
        </div>
      )}
    </div>
  );
}
