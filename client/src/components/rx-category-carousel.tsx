import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, Activity, Heart, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface HeroCategory {
  title: string;
  drugs: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
  borderGlow: string;
  accentColor: string;
  iconBg: string;
}

const HERO_CATEGORIES: HeroCategory[] = [
  {
    title: "Weight Management",
    drugs: "Wegovy, Zepbound, Ozempic",
    description: "We carry these GLP-1 treatments. Ask your doctor to send your prescription to Concordia Pharmacy.",
    icon: TrendingUp,
    gradient: "from-violet-600/20 via-purple-500/10 to-fuchsia-600/20",
    borderGlow: "shadow-[0_0_30px_rgba(139,92,246,0.15)]",
    accentColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
  },
  {
    title: "Diabetes Care",
    drugs: "Mounjaro, Rybelsus, Dexcom G7",
    description: "We stock the latest diabetes medications. Have your provider send your RX to us and we'll take care of the rest.",
    icon: Activity,
    gradient: "from-cyan-600/20 via-primary/10 to-teal-600/20",
    borderGlow: "shadow-[0_0_30px_rgba(6,182,212,0.15)]",
    accentColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
  },
  {
    title: "Men's & Women's Health",
    drugs: "HRT, Testosterone, Specialty Meds",
    description: "Discrete, premium specialty medications available. Your doctor can send prescriptions directly to our pharmacy.",
    icon: Heart,
    gradient: "from-rose-600/20 via-pink-500/10 to-red-600/20",
    borderGlow: "shadow-[0_0_30px_rgba(244,63,94,0.15)]",
    accentColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
  },
  {
    title: "Heart & Longevity",
    drugs: "Statins, Lisinopril, CoQ10",
    description: "We carry a full range of cardiovascular medications. Transfer your prescription to Concordia today.",
    icon: Shield,
    gradient: "from-primary/20 via-indigo-500/10 to-sky-600/20",
    borderGlow: "shadow-[0_0_30px_hsl(var(--primary) / 0.15)]",
    accentColor: "text-primary",
    iconBg: "bg-primary/10",
  },
];

const DOT_COLORS: Record<string, { active: string; inactive: string }> = {
  "text-violet-400": { active: "bg-violet-400", inactive: "bg-violet-400/30" },
  "text-cyan-400": { active: "bg-cyan-400", inactive: "bg-cyan-400/30" },
  "text-rose-400": { active: "bg-rose-400", inactive: "bg-rose-400/30" },
  "text-primary": { active: "bg-primary", inactive: "bg-primary/30" },
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function RxCategoryCarousel() {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % HERO_CATEGORIES.length);
  }, []);

  useEffect(() => {
    if (isPaused || reducedMotion) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [isPaused, reducedMotion, next]);

  const category = HERO_CATEGORIES[current];
  const Icon = category.icon;
  const dotColors = DOT_COLORS[category.accentColor] || { active: "bg-white", inactive: "bg-white/30" };
  const motionDuration = reducedMotion ? 0 : 0.45;

  return (
    <div
      className="relative max-w-4xl mx-auto"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      data-testid="rx-category-carousel"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
          transition={{ duration: motionDuration, ease: "easeInOut" }}
        >
          <div
            className="relative group rounded-md overflow-visible bg-slate-900/90 border border-white/[0.08] transition-colors duration-300"
            data-testid={`rx-carousel-card-${category.title.toLowerCase().replace(/[^a-z]/g, "-")}`}
          >
            <div className="relative p-6 md:p-8">
              <div className="flex items-start gap-4">
                <div className={`shrink-0 rounded-md p-3 ${category.iconBg} border border-white/[0.06]`}>
                  <Icon className={`h-6 w-6 ${category.accentColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg md:text-xl font-semibold text-white mb-1">{category.title}</h3>
                  <p className={`text-sm font-medium ${category.accentColor} mb-2`}>{category.drugs}</p>
                  <p className="text-sm text-slate-400">{category.description}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-center gap-2 mt-4" data-testid="rx-dot-indicators">
        {HERO_CATEGORIES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === current
                ? `w-6 ${dotColors.active}`
                : `w-2 ${dotColors.inactive}`
            }`}
            aria-label={`Go to ${HERO_CATEGORIES[i].title}`}
            data-testid={`rx-dot-${i}`}
          />
        ))}
      </div>
    </div>
  );
}
