import {
  Sun, Snowflake, Leaf, Flower2, Heart, Ghost, Star, Flame,
  Droplets, Brain, Shield, Wind, Sparkles, Baby, Flag, Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface SeasonStyle {
  bannerUrl: string;
  overlayGradient: string;
  labelGradient: string;
  accentColor: string;
  icon: LucideIcon;
}

const B = (path: string) => `/banners/${path}`;

export const SEASON_STYLES: Record<string, SeasonStyle> = {
  // ── Base seasons ───────────────────────────────────────────────────────────
  summer: {
    bannerUrl: B("summer.png"),
    overlayGradient: "linear-gradient(135deg, rgba(20,10,0,0.72) 0%, rgba(30,20,0,0.45) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fbbf24, #f97316, #fde68a)",
    accentColor: "#f97316",
    icon: Sun,
  },
  fall: {
    bannerUrl: B("fall.png"),
    overlayGradient: "linear-gradient(135deg, rgba(20,8,0,0.75) 0%, rgba(40,15,0,0.45) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #dc2626, #fbbf24)",
    accentColor: "#fb923c",
    icon: Leaf,
  },
  winter: {
    bannerUrl: B("winter.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,10,30,0.80) 0%, rgba(0,20,50,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #93c5fd, #e0f2fe, #a5f3fc)",
    accentColor: "#93c5fd",
    icon: Snowflake,
  },
  spring: {
    bannerUrl: B("spring.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,15,5,0.72) 0%, rgba(0,25,10,0.45) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #4ade80, #86efac, #fbcfe8)",
    accentColor: "#4ade80",
    icon: Flower2,
  },

  // ── Flash holidays ─────────────────────────────────────────────────────────
  "new-year": {
    bannerUrl: B("new-year.png"),
    overlayGradient: "linear-gradient(135deg, rgba(5,5,15,0.80) 0%, rgba(10,10,25,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fde68a, #fbbf24, #fcd34d)",
    accentColor: "#fbbf24",
    icon: Sparkles,
  },
  valentines: {
    bannerUrl: B("valentines.png"),
    overlayGradient: "linear-gradient(135deg, rgba(30,0,10,0.78) 0%, rgba(50,0,20,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f472b6, #fb7185, #fda4af)",
    accentColor: "#f472b6",
    icon: Heart,
  },
  "st-patricks": {
    bannerUrl: B("st-patricks.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,20,5,0.75) 0%, rgba(0,35,10,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #4ade80, #22c55e, #bbf7d0)",
    accentColor: "#22c55e",
    icon: Leaf,
  },
  "earth-day": {
    bannerUrl: B("earth-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,18,5,0.75) 0%, rgba(0,30,10,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #34d399, #6ee7b7, #86efac)",
    accentColor: "#34d399",
    icon: Leaf,
  },
  "independence-day": {
    bannerUrl: B("independence-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,0,0,0.78) 0%, rgba(25,0,10,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f87171, #f8fafc, #60a5fa)",
    accentColor: "#f87171",
    icon: Star,
  },
  halloween: {
    bannerUrl: B("halloween.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,0,20,0.82) 0%, rgba(25,5,35,0.55) 50%, rgba(0,0,0,0.25) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #c084fc, #f97316)",
    accentColor: "#fb923c",
    icon: Ghost,
  },
  "veterans-day": {
    bannerUrl: B("veterans-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,5,20,0.80) 0%, rgba(0,10,35,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #93c5fd, #fca5a5, #e0f2fe)",
    accentColor: "#93c5fd",
    icon: Shield,
  },
  christmas: {
    bannerUrl: B("christmas.png"),
    overlayGradient: "linear-gradient(135deg, rgba(10,0,0,0.80) 0%, rgba(20,5,0,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f87171, #4ade80, #fde68a)",
    accentColor: "#f87171",
    icon: Star,
  },
  nye: {
    bannerUrl: B("nye.png"),
    overlayGradient: "linear-gradient(135deg, rgba(5,5,15,0.82) 0%, rgba(10,10,25,0.55) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fde68a, #e0f2fe, #fbbf24)",
    accentColor: "#fde68a",
    icon: Sparkles,
  },

  // ── Theme weeks ────────────────────────────────────────────────────────────
  "ny-reset": {
    bannerUrl: B("ny-reset.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,5,20,0.80) 0%, rgba(0,10,35,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #a5f3fc, #e0f2fe, #c7d2fe)",
    accentColor: "#a5f3fc",
    icon: Sparkles,
  },
  "heart-health": {
    bannerUrl: B("heart-health.png"),
    overlayGradient: "linear-gradient(135deg, rgba(25,0,5,0.78) 0%, rgba(40,0,10,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f472b6, #fb7185, #fda4af)",
    accentColor: "#fb7185",
    icon: Heart,
  },
  "valentines-prep": {
    bannerUrl: B("valentines-prep.png"),
    overlayGradient: "linear-gradient(135deg, rgba(30,0,10,0.78) 0%, rgba(50,0,20,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f472b6, #fb7185, #fda4af)",
    accentColor: "#f472b6",
    icon: Heart,
  },
  "allergy-early": {
    bannerUrl: B("allergy-early.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,12,5,0.75) 0%, rgba(0,20,8,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #86efac, #fbcfe8, #bfdbfe)",
    accentColor: "#86efac",
    icon: Wind,
  },
  "spring-clean": {
    bannerUrl: B("spring-clean.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,15,5,0.72) 0%, rgba(0,25,8,0.45) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #4ade80, #86efac, #fbcfe8)",
    accentColor: "#4ade80",
    icon: Flower2,
  },
  "earth-week": {
    bannerUrl: B("earth-week.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,18,5,0.75) 0%, rgba(0,30,8,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #34d399, #6ee7b7, #a7f3d0)",
    accentColor: "#34d399",
    icon: Leaf,
  },
  "mental-health": {
    bannerUrl: B("mental-health.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,10,20,0.78) 0%, rgba(0,15,30,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #a5b4fc, #c4b5fd, #93c5fd)",
    accentColor: "#a5b4fc",
    icon: Brain,
  },
  "mothers-day": {
    bannerUrl: B("mothers-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(25,0,10,0.72) 0%, rgba(40,0,18,0.45) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f9a8d4, #f472b6, #fbcfe8)",
    accentColor: "#f472b6",
    icon: Baby,
  },
  "memorial-day": {
    bannerUrl: B("memorial-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,0,0,0.78) 0%, rgba(0,5,20,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f87171, #f8fafc, #60a5fa)",
    accentColor: "#f87171",
    icon: Flag,
  },
  "summer-skin": {
    bannerUrl: B("summer-skin.png"),
    overlayGradient: "linear-gradient(135deg, rgba(20,10,0,0.72) 0%, rgba(30,18,0,0.45) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fbbf24, #f97316, #fde68a)",
    accentColor: "#f97316",
    icon: Sun,
  },
  "fathers-day": {
    bannerUrl: B("fathers-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,8,0,0.75) 0%, rgba(25,12,0,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fbbf24, #fb923c, #fde68a)",
    accentColor: "#fbbf24",
    icon: Briefcase,
  },
  "heat-hydration": {
    bannerUrl: B("heat-hydration.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,10,25,0.78) 0%, rgba(0,18,40,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #7dd3fc, #38bdf8, #bae6fd)",
    accentColor: "#7dd3fc",
    icon: Droplets,
  },
  "back-to-school": {
    bannerUrl: B("back-to-school.png"),
    overlayGradient: "linear-gradient(135deg, rgba(5,8,20,0.78) 0%, rgba(8,12,30,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fbbf24, #60a5fa, #fde68a)",
    accentColor: "#fbbf24",
    icon: Sparkles,
  },
  "labor-day": {
    bannerUrl: B("labor-day.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,8,0,0.75) 0%, rgba(25,12,0,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #fbbf24, #fde68a)",
    accentColor: "#fb923c",
    icon: Flame,
  },
  "fall-immunity": {
    bannerUrl: B("fall-immunity.png"),
    overlayGradient: "linear-gradient(135deg, rgba(20,8,0,0.75) 0%, rgba(35,12,0,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #fbbf24, #dc2626)",
    accentColor: "#fb923c",
    icon: Leaf,
  },
  "fall-allergy": {
    bannerUrl: B("fall-allergy.png"),
    overlayGradient: "linear-gradient(135deg, rgba(20,8,0,0.75) 0%, rgba(35,12,0,0.48) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #fde68a, #fbbf24)",
    accentColor: "#fb923c",
    icon: Wind,
  },
  "pink-october": {
    bannerUrl: B("pink-october.png"),
    overlayGradient: "linear-gradient(135deg, rgba(25,0,10,0.78) 0%, rgba(40,0,18,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f9a8d4, #f472b6, #fda4af)",
    accentColor: "#f472b6",
    icon: Heart,
  },
  "pre-halloween": {
    bannerUrl: B("pre-halloween.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,0,20,0.80) 0%, rgba(25,5,35,0.52) 50%, rgba(0,0,0,0.22) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #c084fc, #f97316)",
    accentColor: "#fb923c",
    icon: Ghost,
  },
  thanksgiving: {
    bannerUrl: B("thanksgiving.png"),
    overlayGradient: "linear-gradient(135deg, rgba(22,8,0,0.78) 0%, rgba(38,12,0,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fbbf24, #f97316, #fde68a)",
    accentColor: "#f97316",
    icon: Leaf,
  },
  "post-holiday": {
    bannerUrl: B("post-holiday.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,8,22,0.80) 0%, rgba(0,12,35,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #a5b4fc, #c4b5fd, #93c5fd)",
    accentColor: "#a5b4fc",
    icon: Sparkles,
  },
  "cold-flu-peak": {
    bannerUrl: B("cold-flu-peak.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,8,22,0.80) 0%, rgba(0,12,35,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #93c5fd, #bae6fd, #a5f3fc)",
    accentColor: "#93c5fd",
    icon: Snowflake,
  },
  "holiday-prep": {
    bannerUrl: B("holiday-prep.png"),
    overlayGradient: "linear-gradient(135deg, rgba(10,0,0,0.80) 0%, rgba(20,5,0,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f87171, #4ade80, #fde68a)",
    accentColor: "#fde68a",
    icon: Star,
  },

  // ── Hispanic / Latino celebrations ────────────────────────────────────────
  "three-kings": {
    bannerUrl: B("three-kings.png"),
    overlayGradient: "linear-gradient(135deg, rgba(10,5,0,0.80) 0%, rgba(20,10,0,0.52) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #fbbf24, #c084fc, #fde68a)",
    accentColor: "#fbbf24",
    icon: Star,
  },
  "cinco-de-mayo": {
    bannerUrl: B("cinco-de-mayo.png"),
    overlayGradient: "linear-gradient(135deg, rgba(0,15,5,0.78) 0%, rgba(0,25,8,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #4ade80, #f87171, #fde68a)",
    accentColor: "#4ade80",
    icon: Sparkles,
  },
  "dia-de-muertos": {
    bannerUrl: B("dia-de-muertos.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,0,5,0.82) 0%, rgba(25,0,10,0.55) 50%, rgba(0,0,0,0.25) 100%)",
    labelGradient: "linear-gradient(90deg, #fb923c, #fbbf24, #c084fc)",
    accentColor: "#fb923c",
    icon: Flower2,
  },
  "hispanic-heritage": {
    bannerUrl: B("hispanic-heritage.png"),
    overlayGradient: "linear-gradient(135deg, rgba(15,5,0,0.78) 0%, rgba(25,8,0,0.50) 50%, rgba(0,0,0,0.2) 100%)",
    labelGradient: "linear-gradient(90deg, #f87171, #fbbf24, #4ade80)",
    accentColor: "#f87171",
    icon: Sparkles,
  },
};

export function getSeasonStyle(themeKey: string): SeasonStyle {
  if (SEASON_STYLES[themeKey]) return SEASON_STYLES[themeKey];
  // Partial-key fallback to base season
  if (themeKey.includes("summer")) return SEASON_STYLES["summer"];
  if (themeKey.includes("fall") || themeKey.includes("autumn")) return SEASON_STYLES["fall"];
  if (themeKey.includes("winter") || themeKey.includes("snow") || themeKey.includes("cold")) return SEASON_STYLES["winter"];
  if (themeKey.includes("spring")) return SEASON_STYLES["spring"];
  return SEASON_STYLES["summer"];
}
