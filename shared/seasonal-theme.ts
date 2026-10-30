export type SeasonTier = 1 | 2 | 3;

export interface SeasonContext {
  tier: SeasonTier;
  name: string;
  label: string;
  copy: string;
  categoryTags: string[];
  themeKey: string;
}

export type HolidayDecoration =
  | "pumpkins" | "hearts" | "clover" | "eggs" | "flags"
  | "harvest" | "evergreen" | "stars" | "flowers" | "remembrance";

export interface ActiveHoliday {
  key: string;
  name: string;
  date: string;
  startDate: string;
  endDate: string;
  celebrationEndDate: string;
  decoration: HolidayDecoration;
  styleThemeKey: string;
}

export interface SeasonalThemeResponse {
  date: string;
  timeZone: "America/New_York";
  season: SeasonContext;
  holiday: ActiveHoliday | null;
}
