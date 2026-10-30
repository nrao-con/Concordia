import type { SeasonContext } from "@shared/seasonal-theme";
export type { SeasonTier, SeasonContext } from "@shared/seasonal-theme";

// ── Day-of-year helper (non-leap; close enough for seasonal theming) ──────────
const MONTH_START = [0, 1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

function doy(month: number, day: number): number {
  return MONTH_START[month] + day - 1;
}

function currentDoy(date: Date): number {
  return doy(date.getMonth() + 1, date.getDate());
}

// ── Tier 1: Flash Holidays (single calendar day) ──────────────────────────────
interface FlashHoliday {
  month: number;
  day: number;
  name: string;
  label: string;
  copy: string;
  categoryTags: string[];
  themeKey: string;
}

const FLASH_HOLIDAYS: FlashHoliday[] = [
  {
    month: 1, day: 1,
    name: "New Year's Day",
    label: "New Year, New You",
    copy: "Start the year with the right vitamins and supplements.",
    categoryTags: ["Vitamins", "Supplements", "wellness"],
    themeKey: "new-year",
  },
  {
    month: 2, day: 14,
    name: "Valentine's Day",
    label: "Valentine's Day Picks",
    copy: "Show your loved ones and yourself a little extra care today.",
    categoryTags: ["Chocolate", "Candy", "skin", "wellness", "Vitamins"],
    themeKey: "valentines",
  },
  {
    month: 3, day: 17,
    name: "St. Patrick's Day",
    label: "Green Health Picks",
    copy: "A little luck, a lot of wellness. Stay healthy this season.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "st-patricks",
  },
  {
    month: 4, day: 22,
    name: "Earth Day",
    label: "Earth Day Wellness",
    copy: "Take care of yourself and the planet with natural wellness picks.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "earth-day",
  },
  {
    month: 7, day: 4,
    name: "Independence Day",
    label: "4th of July Picks",
    copy: "Ready for outdoor fun? Stock up on first aid and sun essentials.",
    categoryTags: ["Snacks", "Beverages", "First Aid", "wellness", "Pain Relief"],
    themeKey: "independence-day",
  },
  {
    month: 10, day: 31,
    name: "Halloween",
    label: "Halloween Health Picks",
    copy: "After the candy, take care of the body. Recovery starts here.",
    categoryTags: ["Candy", "Snacks", "First Aid", "digestive", "Pain Relief"],
    themeKey: "halloween",
  },
  {
    month: 11, day: 11,
    name: "Veterans Day",
    label: "Honoring Our Veterans",
    copy: "Proudly serving those who served us. Your health, our mission.",
    categoryTags: ["wellness", "Pain Relief", "Vitamins"],
    themeKey: "veterans-day",
  },
  {
    month: 12, day: 25,
    name: "Christmas",
    label: "Holiday Health Picks",
    copy: "Tis the season to stay well. Gift yourself good health.",
    categoryTags: ["Chocolate", "Candy", "Snacks", "wellness", "Vitamins", "Cold & Flu"],
    themeKey: "christmas",
  },
  {
    month: 1, day: 6,
    name: "Three Kings Day",
    label: "Three Kings Day",
    copy: "Celebrate Día de Reyes, a day of gifts, family, and wellness.",
    categoryTags: ["Chocolate", "Candy", "wellness", "Vitamins"],
    themeKey: "three-kings",
  },
  {
    month: 5, day: 5,
    name: "Cinco de Mayo",
    label: "Cinco de Mayo Picks",
    copy: "Celebrate with energy and wellness. Keep the fiesta feeling great.",
    categoryTags: ["Snacks", "Beverages", "wellness", "Vitamins"],
    themeKey: "cinco-de-mayo",
  },
  {
    month: 11, day: 1,
    name: "Día de los Muertos",
    label: "Día de los Muertos",
    copy: "Honor tradition and care for yourself. Wellness for body and spirit.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "dia-de-muertos",
  },
  {
    month: 12, day: 31,
    name: "New Year's Eve",
    label: "Ring in the New Year",
    copy: "Head into the new year feeling your best with these essentials.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "nye",
  },
];

// ── Tier 2: Theme Weeks (date ranges) ─────────────────────────────────────────
interface ThemeWeek {
  startDoy: number;
  endDoy: number;
  name: string;
  label: string;
  copy: string;
  categoryTags: string[];
  themeKey: string;
}

const THEME_WEEKS: ThemeWeek[] = [
  // ── January ────────────────────────────────────────────────────────────────
  {
    startDoy: doy(1, 2), endDoy: doy(1, 8),
    name: "New Year Wellness Reset",
    label: "New Year Wellness Reset",
    copy: "Set your health intentions for the year. Start with the essentials.",
    categoryTags: ["Vitamins", "Supplements", "wellness"],
    themeKey: "ny-reset",
  },
  // ── February ───────────────────────────────────────────────────────────────
  {
    startDoy: doy(2, 1), endDoy: doy(2, 7),
    name: "Heart Health Week",
    label: "Heart Health Picks",
    copy: "February is American Heart Month. Give your heart the care it deserves.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "heart-health",
  },
  {
    startDoy: doy(2, 8), endDoy: doy(2, 13),
    name: "Valentine's Week",
    label: "Self-Care Before V-Day",
    copy: "A week of wellness before Valentine's Day. Look and feel your best.",
    categoryTags: ["Chocolate", "Candy", "skin", "wellness", "Vitamins"],
    themeKey: "valentines-prep",
  },
  // ── March ──────────────────────────────────────────────────────────────────
  {
    startDoy: doy(3, 1), endDoy: doy(3, 10),
    name: "Allergy Season Early Prep",
    label: "Allergy Season Starts",
    copy: "Spring is coming. Get ahead of allergy season before it peaks.",
    categoryTags: ["Allergy", "Cold & Flu", "Vitamins"],
    themeKey: "allergy-early",
  },
  {
    startDoy: doy(3, 11), endDoy: doy(3, 20),
    name: "Spring Clean Wellness",
    label: "Spring Wellness Refresh",
    copy: "Spring cleaning isn't just for the house. Refresh your health routine.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "spring-clean",
  },
  // ── April ──────────────────────────────────────────────────────────────────
  {
    startDoy: doy(4, 14), endDoy: doy(4, 21),
    name: "Earth Week",
    label: "Earth Week Essentials",
    copy: "Natural wellness products for a healthier you and a healthier planet.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "earth-week",
  },
  // ── May ────────────────────────────────────────────────────────────────────
  {
    startDoy: doy(5, 1), endDoy: doy(5, 10),
    name: "Mental Health Awareness",
    label: "Mental Health Month",
    copy: "Mental health is health. Products that support your mind and body.",
    categoryTags: ["wellness", "Sleep Aid", "Supplements"],
    themeKey: "mental-health",
  },
  {
    startDoy: doy(5, 11), endDoy: doy(5, 13),
    name: "Mother's Day",
    label: "Mother's Day Picks",
    copy: "Celebrate the people who take care of everyone, starting with themselves.",
    categoryTags: ["skin", "wellness", "Vitamins"],
    themeKey: "mothers-day",
  },
  {
    startDoy: doy(5, 23), endDoy: doy(5, 27),
    name: "Memorial Day Weekend",
    label: "Memorial Day Picks",
    copy: "Honoring those who served. Stay healthy and ready for the long weekend.",
    categoryTags: ["Snacks", "Beverages", "First Aid", "wellness", "Pain Relief"],
    themeKey: "memorial-day",
  },
  // ── June ───────────────────────────────────────────────────────────────────
  {
    startDoy: doy(6, 1), endDoy: doy(6, 9),
    name: "Summer Skin Prep",
    label: "Summer Skin Picks",
    copy: "Sun, heat, and humidity ahead. Your summer skincare starts now.",
    categoryTags: ["skin", "Vitamins", "wellness"],
    themeKey: "summer-skin",
  },
  {
    startDoy: doy(6, 14), endDoy: doy(6, 21),
    name: "Father's Day",
    label: "Father's Day Picks",
    copy: "Strong health for the people who keep showing up. Picks for dad.",
    categoryTags: ["wellness", "Pain Relief", "Vitamins", "Supplements"],
    themeKey: "fathers-day",
  },
  // ── July ───────────────────────────────────────────────────────────────────
  {
    startDoy: doy(7, 15), endDoy: doy(7, 25),
    name: "Heat & Hydration Week",
    label: "Stay Cool This Summer",
    copy: "The hottest weeks of the year. Hydration and wellness essentials.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "heat-hydration",
  },
  // ── August ─────────────────────────────────────────────────────────────────
  {
    startDoy: doy(8, 10), endDoy: doy(8, 20),
    name: "Back to School",
    label: "Back to School Health",
    copy: "Kids back in class means germs back in circulation. Stay prepared.",
    categoryTags: ["First Aid", "Vitamins", "Cold & Flu", "headache"],
    themeKey: "back-to-school",
  },
  // ── September ──────────────────────────────────────────────────────────────
  {
    startDoy: doy(9, 1), endDoy: doy(9, 4),
    name: "Labor Day Weekend",
    label: "Labor Day Picks",
    copy: "End of summer done right. First aid, vitamins, and outdoor essentials.",
    categoryTags: ["Snacks", "Beverages", "First Aid", "wellness", "Pain Relief"],
    themeKey: "labor-day",
  },
  {
    startDoy: doy(9, 5), endDoy: doy(9, 15),
    name: "Fall Immunity Boost",
    label: "Build Your Fall Immunity",
    copy: "As seasons change, give your immune system extra support.",
    categoryTags: ["Vitamins", "Cold & Flu", "Allergy", "wellness"],
    themeKey: "fall-immunity",
  },
  {
    startDoy: doy(9, 22), endDoy: doy(10, 1),
    name: "Fall Allergy Season",
    label: "Fall Allergy Relief",
    copy: "Ragweed, mold, and falling leaves. Be ready for fall allergy season.",
    categoryTags: ["Allergy", "Cold & Flu", "Vitamins"],
    themeKey: "fall-allergy",
  },
  // ── Hispanic Heritage Month (Sep 15 – Oct 15) — inserted after fall-allergy
  // and pink-october so those take priority on overlapping dates; this fills
  // the remaining uncovered gaps (Sep 16-21 and Oct 8-14).
  {
    startDoy: doy(9, 16), endDoy: doy(10, 14),
    name: "Hispanic Heritage Month",
    label: "Hispanic Heritage Month",
    copy: "Celebrating the culture, health, and community of the Hispanic and Latino heritage.",
    categoryTags: ["Snacks", "Beverages", "wellness", "Vitamins", "Supplements"],
    themeKey: "hispanic-heritage",
  },
  // ── October ────────────────────────────────────────────────────────────────
  {
    startDoy: doy(10, 2), endDoy: doy(10, 7),
    name: "Breast Cancer Awareness",
    label: "Pink Month Picks",
    copy: "October is Breast Cancer Awareness Month. Prioritize your health today.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "pink-october",
  },
  {
    startDoy: doy(10, 24), endDoy: doy(10, 30),
    name: "Pre-Halloween Self-Care",
    label: "Pre-Halloween Picks",
    copy: "Busy week ahead? Stay stocked on the essentials before Halloween.",
    categoryTags: ["Candy", "Snacks", "First Aid", "Pain Relief", "digestive"],
    themeKey: "pre-halloween",
  },
  // ── November ───────────────────────────────────────────────────────────────
  {
    startDoy: doy(11, 18), endDoy: doy(11, 26),
    name: "Thanksgiving Wellness",
    label: "Thanksgiving Picks",
    copy: "Big meals, big gatherings. Keep your digestive system happy.",
    categoryTags: ["Snacks", "Food", "digestive", "wellness", "Vitamins"],
    themeKey: "thanksgiving",
  },
  {
    startDoy: doy(11, 27), endDoy: doy(12, 5),
    name: "Post-Holiday Recovery",
    label: "Holiday Recovery Picks",
    copy: "The feast is over. Help your body recover and recharge.",
    categoryTags: ["digestive", "Vitamins", "wellness"],
    themeKey: "post-holiday",
  },
  // ── December ───────────────────────────────────────────────────────────────
  {
    startDoy: doy(12, 6), endDoy: doy(12, 13),
    name: "Cold & Flu Season Peak",
    label: "Cold & Flu Season",
    copy: "Peak cold and flu weeks. Stock up on what matters most.",
    categoryTags: ["Cold & Flu", "Pain Relief", "Vitamins"],
    themeKey: "cold-flu-peak",
  },
  {
    startDoy: doy(12, 18), endDoy: doy(12, 24),
    name: "Holiday Wellness Prep",
    label: "Holiday Wellness Picks",
    copy: "Stay well through the holidays. Give yourself the gift of good health.",
    categoryTags: ["Chocolate", "Candy", "Snacks", "wellness", "Vitamins", "skin"],
    themeKey: "holiday-prep",
  },
];

// ── Tier 3: Base Seasons (month-range fallback, always resolves) ───────────────
interface BaseSeason {
  name: string;
  label: string;
  copy: string;
  categoryTags: string[];
  themeKey: string;
  includes: (d: number) => boolean;
}

const BASE_SEASONS: BaseSeason[] = [
  {
    name: "Winter Wellness",
    label: "Winter Wellness Picks",
    copy: "Cold months call for extra care. Stay warm, stay well.",
    categoryTags: ["Cold & Flu", "wellness", "Vitamins"],
    themeKey: "winter",
    includes: (d) => d <= doy(3, 14) || d >= doy(12, 14),
  },
  {
    name: "Spring Wellness",
    label: "Spring Essentials",
    copy: "New season, fresh start. Stock up on spring wellness essentials.",
    categoryTags: ["Allergy", "wellness", "Vitamins"],
    themeKey: "spring",
    includes: (d) => d >= doy(3, 15) && d <= doy(5, 31),
  },
  {
    name: "Summer Essentials",
    label: "Summer Essentials",
    copy: "Stay energised, protected, and hydrated all summer long.",
    categoryTags: ["Snacks", "Beverages", "skin", "wellness", "Vitamins", "Supplements"],
    themeKey: "summer",
    includes: (d) => d >= doy(6, 1) && d <= doy(8, 31),
  },
  {
    name: "Fall Wellness",
    label: "Fall Wellness Picks",
    copy: "Autumn brings change. Keep your health routine strong.",
    categoryTags: ["Allergy", "Cold & Flu", "wellness", "Vitamins"],
    themeKey: "fall",
    includes: (d) => d >= doy(9, 1) && d <= doy(12, 13),
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/** Neutral seasonal styling, without a holiday or holiday-preparation week. */
export function getBaseSeason(date: Date = new Date()): SeasonContext {
  const season = BASE_SEASONS.find(candidate => candidate.includes(currentDoy(date))) ?? BASE_SEASONS[0];
  return {
    tier: 3, name: season.name, label: season.label, copy: season.copy,
    categoryTags: season.categoryTags, themeKey: season.themeKey,
  };
}

/** Look up any season/holiday/week by its themeKey (for previewing). */
export function getSeasonByThemeKey(key: string): SeasonContext | null {
  const h = FLASH_HOLIDAYS.find((x) => x.themeKey === key);
  if (h) return { tier: 1, name: h.name, label: h.label, copy: h.copy, categoryTags: h.categoryTags, themeKey: h.themeKey };
  const w = THEME_WEEKS.find((x) => x.themeKey === key);
  if (w) return { tier: 2, name: w.name, label: w.label, copy: w.copy, categoryTags: w.categoryTags, themeKey: w.themeKey };
  const s = BASE_SEASONS.find((x) => x.themeKey === key);
  if (s) return { tier: 3, name: s.name, label: s.label, copy: s.copy, categoryTags: s.categoryTags, themeKey: s.themeKey };
  return null;
}

export function getActiveSeason(date?: Date): SeasonContext {
  const d = date ?? new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const dayNum = doy(month, day);

  // Tier 1: Flash Holiday (exact day match)
  const holiday = FLASH_HOLIDAYS.find((h) => h.month === month && h.day === day);
  if (holiday) {
    return {
      tier: 1,
      name: holiday.name,
      label: holiday.label,
      copy: holiday.copy,
      categoryTags: holiday.categoryTags,
      themeKey: holiday.themeKey,
    };
  }

  // Tier 2: Theme Week (date range)
  const week = THEME_WEEKS.find((w) => dayNum >= w.startDoy && dayNum <= w.endDoy);
  if (week) {
    return {
      tier: 2,
      name: week.name,
      label: week.label,
      copy: week.copy,
      categoryTags: week.categoryTags,
      themeKey: week.themeKey,
    };
  }

  // Tier 3: Base Season (always resolves — full year coverage guaranteed)
  const season = BASE_SEASONS.find((s) => s.includes(dayNum));
  if (season) {
    return {
      tier: 3,
      name: season.name,
      label: season.label,
      copy: season.copy,
      categoryTags: season.categoryTags,
      themeKey: season.themeKey,
    };
  }

  // Absolute fallback (should never hit with correct base season coverage)
  return {
    tier: 3,
    name: "Wellness Picks",
    label: "Today's Picks",
    copy: "Quality health products curated for you by our pharmacists.",
    categoryTags: ["wellness", "Vitamins", "Supplements"],
    themeKey: "default",
  };
}
