import Holidays from "date-holidays";
import type { ActiveHoliday, HolidayDecoration, SeasonalThemeResponse } from "@shared/seasonal-theme";
// This existing module is pure calendar data: both preview and the storefront
// keep the same wellness-week copy without a second server-side calendar.
import { getActiveSeason, getBaseSeason, getSeasonByThemeKey } from "../client/src/lib/seasonal-calendar";

const TIME_ZONE = "America/New_York" as const;
const DAY_MS = 86_400_000;

interface HolidayDefinition {
  key: string;
  name: string;
  rule: string;
  decoration: HolidayDecoration;
  style: string;
  beforeDays?: number;
}

const HOLIDAYS: HolidayDefinition[] = [
  { key: "new-year", name: "New Year's Day", rule: "01-01", decoration: "stars", style: "new-year" },
  { key: "mlk-day", name: "Martin Luther King Jr. Day", rule: "3rd monday in January", decoration: "remembrance", style: "winter" },
  { key: "valentines", name: "Valentine's Day", rule: "02-14", decoration: "hearts", style: "valentines" },
  { key: "presidents-day", name: "Presidents Day", rule: "3rd monday in February", decoration: "flags", style: "independence-day" },
  { key: "st-patricks", name: "St. Patrick's Day", rule: "03-17", decoration: "clover", style: "st-patricks" },
  { key: "easter", name: "Easter", rule: "easter", decoration: "eggs", style: "spring" },
  { key: "earth-day", name: "Earth Day", rule: "04-22", decoration: "flowers", style: "earth-day" },
  { key: "mothers-day", name: "Mother's Day", rule: "2nd sunday in May", decoration: "flowers", style: "spring" },
  { key: "memorial-day", name: "Memorial Day", rule: "monday before 06-01", decoration: "remembrance", style: "independence-day" },
  { key: "juneteenth", name: "Juneteenth", rule: "06-19", decoration: "flags", style: "summer" },
  { key: "fathers-day", name: "Father's Day", rule: "3rd sunday in June", decoration: "stars", style: "summer" },
  { key: "independence-day", name: "Independence Day", rule: "07-04", decoration: "flags", style: "independence-day" },
  { key: "labor-day", name: "Labor Day", rule: "1st monday in September", decoration: "stars", style: "summer" },
  { key: "indigenous-peoples-day", name: "Indigenous Peoples' Day", rule: "2nd monday in October", decoration: "remembrance", style: "fall" },
  // Start in mid-October, not only on the holiday itself.
  { key: "halloween", name: "Halloween", rule: "10-31", decoration: "pumpkins", style: "halloween", beforeDays: 15 },
  { key: "veterans-day", name: "Veterans Day", rule: "11-11", decoration: "remembrance", style: "veterans-day" },
  { key: "thanksgiving", name: "Thanksgiving", rule: "4th thursday in November", decoration: "harvest", style: "thanksgiving" },
  { key: "christmas", name: "Christmas", rule: "12-25", decoration: "evergreen", style: "christmas" },
];

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function getNewYorkDate(date: Date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid calendar date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
    && Number(value.slice(0, 4)) >= 1970 && Number(value.slice(0, 4)) <= 2080;
}

const years = new Map<number, ActiveHoliday[]>();

export function getHolidayWindows(year: number): ActiveHoliday[] {
  const existing = years.get(year);
  if (existing) return existing.map(holiday => ({ ...holiday }));
  if (!Number.isInteger(year) || year < 1970 || year > 2080) throw new Error("Unsupported calendar year");
  const calendar = new Holidays("US", { languages: ["en"], timezone: TIME_ZONE });
  for (const definition of HOLIDAYS) {
    if (definition.rule && !calendar.setHoliday(definition.rule, { name: `concordia:${definition.key}`, type: "observance" })) {
      throw new Error(`Invalid holiday rule for ${definition.key}`);
    }
  }
  const dates = calendar.getHolidays(year);
  const windows: ActiveHoliday[] = [];
  for (const definition of HOLIDAYS) {
    const datesForHoliday = dates.filter(holiday => holiday.name === `concordia:${definition.key}`);
    for (const holiday of datesForHoliday) {
      const date = holiday.date.slice(0, 10);
      windows.push({
        key: definition.key, name: definition.name, date,
        startDate: addDays(date, -(definition.beforeDays ?? 13)),
        endDate: date,
        celebrationEndDate: date,
        decoration: definition.decoration, styleThemeKey: definition.style,
      });
    }
  }
  // Bounded memory even when staff previews many years.
  if (years.size >= 6) years.delete(years.keys().next().value!);
  years.set(year, windows);
  return windows.map(holiday => ({ ...holiday }));
}

export function getSeasonalTheme(date: string | Date = new Date()): SeasonalThemeResponse {
  const day = typeof date === "string" ? date : getNewYorkDate(date);
  if (!isCalendarDate(day)) throw new Error("Invalid calendar date (supported years: 1970 to 2080)");
  const year = Number(day.slice(0, 4));
  const candidates = [year - 1, year, year + 1]
    .filter(value => value >= 1970 && value <= 2080)
    .flatMap(getHolidayWindows)
    .filter(holiday => day >= holiday.startDate && day <= holiday.endDate);
  // Exact holiday dates take precedence, then an ongoing festival, then the
  // nearest upcoming holiday. Expired holidays never remain on the logo.
  const rank = (holiday: ActiveHoliday) => holiday.date === day ? 0 : day > holiday.date && day <= holiday.celebrationEndDate ? 1 : 2;
  candidates.sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const holiday = candidates[0] ?? null;
  const [y, month, d] = day.split("-").map(Number);
  const calendarDate = new Date(y, month - 1, d, 12);
  const wellness = getActiveSeason(calendarDate);
  const legacyHolidayWeek = ["pre-halloween", "thanksgiving", "post-holiday", "holiday-prep", "valentines-prep"].includes(wellness.themeKey);
  const base = wellness.tier === 1 || legacyHolidayWeek ? getBaseSeason(calendarDate) : wellness;
  const metadata = holiday ? getSeasonByThemeKey(holiday.key) : null;
  const season = holiday ? {
    tier: 1 as const, name: holiday.name,
    label: metadata?.label ?? `${holiday.name} Wellness`,
    copy: metadata?.copy ?? "Everyday essentials for your health and wellbeing.",
    categoryTags: metadata?.categoryTags ?? ["wellness", "Vitamins", "Supplements"],
    themeKey: holiday.key,
  } : base;
  return { date: day, timeZone: TIME_ZONE, season, holiday };
}
