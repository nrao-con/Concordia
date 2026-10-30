import type { Express, RequestHandler } from "express";
import { getSeasonalTheme, isCalendarDate } from "./seasonal-theme";

export function registerSeasonalThemeRoutes(
  app: Express,
  isAuthenticated: RequestHandler,
  isAdmin: RequestHandler,
) {
  app.get("/api/seasonal-context", (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      return res.json(getSeasonalTheme());
    } catch {
      console.error("[SeasonalTheme] Unable to resolve current theme");
      return res.status(503).json({ message: "Seasonal theme temporarily unavailable" });
    }
  });

  app.get("/api/admin/seasonal-preview", isAuthenticated, isAdmin, (req, res) => {
    res.set("Cache-Control", "no-store");
    const date = req.query.date;
    if (date !== undefined && (typeof date !== "string" || !isCalendarDate(date))) {
      return res.status(400).json({ message: "Invalid date. Use a real YYYY-MM-DD date between 1970 and 2080." });
    }
    try {
      const result = getSeasonalTheme(date as string | undefined);
      // Retain the existing flattened preview contract, adding window and
      // decoration details from the exact same resolver used by the shop.
      return res.json({ ...result.season, ...result });
    } catch {
      console.error("[SeasonalTheme] Unable to resolve preview");
      return res.status(503).json({ message: "Seasonal theme temporarily unavailable" });
    }
  });
}
