import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { getHolidayWindows, getNewYorkDate, getSeasonalTheme, isCalendarDate } from "../seasonal-theme";
import { registerSeasonalThemeRoutes } from "../seasonal-theme-routes";

afterEach(() => vi.useRealTimers());

describe("automatic holiday calendar", () => {
  it("starts Halloween in mid-October and ends it after October 31", () => {
    expect(getSeasonalTheme("2026-10-15").holiday).toBeNull();
    for (const day of ["2026-10-16", "2026-10-24", "2026-10-31"]) {
      expect(getSeasonalTheme(day).holiday).toMatchObject({
        key: "halloween", decoration: "pumpkins", startDate: "2026-10-16", endDate: "2026-10-31",
      });
    }
    expect(getSeasonalTheme("2026-11-01").holiday?.key).not.toBe("halloween");
  });

  it("returns the unadorned seasonal theme between holidays", () => {
    expect(getSeasonalTheme("2027-01-23")).toMatchObject({
      holiday: null, season: { tier: 3, themeKey: "winter" },
    });
    expect(getSeasonalTheme("2026-10-15")).toMatchObject({
      holiday: null, season: { themeKey: "fall" },
    });
  });

  it("keeps decoration windows about two weeks, not whole months", () => {
    for (const holiday of getHolidayWindows(2026)) {
      const days = (Date.parse(holiday.endDate) - Date.parse(holiday.startDate)) / 86_400_000 + 1;
      expect(days).toBe(holiday.key === "halloween" ? 16 : 14);
    }
  });

  it("includes major US holidays and common American celebrations only", () => {
    const keys = getHolidayWindows(2026).map(holiday => holiday.key);
    expect(keys).toEqual(expect.arrayContaining([
      "new-year", "mlk-day", "valentines", "presidents-day",
      "st-patricks", "easter", "earth-day", "mothers-day",
      "memorial-day", "juneteenth", "fathers-day", "independence-day", "labor-day",
      "indigenous-peoples-day", "halloween", "veterans-day", "thanksgiving", "christmas",
    ]));
    for (const key of ["three-kings", "lunar-new-year", "passover", "cinco-de-mayo", "dia-de-muertos", "hanukkah", "eid-al-fitr", "eid-al-adha", "diwali"]) {
      expect(keys).not.toContain(key);
    }
  });

  it.each([
    [2026, "2026-11-26", "2026-04-05"],
    [2027, "2027-11-25", "2027-03-28"],
    [2028, "2028-11-23", "2028-04-16"],
  ])("recalculates Thanksgiving and Easter for %i", (year, thanksgiving, easter) => {
    const windows = getHolidayWindows(year);
    expect(windows.find(holiday => holiday.key === "thanksgiving")?.date).toBe(thanksgiving);
    expect(windows.find(holiday => holiday.key === "easter")?.date).toBe(easter);
    expect(getSeasonalTheme(thanksgiving).holiday?.key).toBe("thanksgiving");
  });

  it("removes the old fixed Thanksgiving theme when the actual holiday has ended", () => {
    expect(getSeasonalTheme("2027-11-26").holiday).toBeNull();
    expect(getSeasonalTheme("2027-11-26").season.themeKey).toBe("fall");
  });

  it("prioritizes the holiday itself over another upcoming holiday", () => {
    expect(getSeasonalTheme("2026-10-31").holiday?.key).toBe("halloween");
    expect(getSeasonalTheme("2026-11-11").holiday?.key).toBe("veterans-day");
    expect(getSeasonalTheme("2026-12-25").holiday?.key).toBe("christmas");
  });

  it("handles year rollover without losing New Year or extending Christmas", () => {
    expect(getSeasonalTheme("2026-12-26").holiday?.key).toBe("new-year");
    expect(getSeasonalTheme("2026-12-31").holiday?.date).toBe("2027-01-01");
    expect(getSeasonalTheme("2027-01-01").holiday?.key).toBe("new-year");
    expect(getSeasonalTheme("2027-01-02").holiday?.key).not.toBe("new-year");
  });

  it("uses New York dates at midnight and across DST rather than the visitor/server timezone", () => {
    expect(getNewYorkDate(new Date("2026-10-16T03:59:59Z"))).toBe("2026-10-15");
    expect(getNewYorkDate(new Date("2026-10-16T04:00:00Z"))).toBe("2026-10-16");
    expect(getSeasonalTheme(new Date("2026-11-01T03:59:59Z")).holiday?.key).toBe("halloween");
    expect(getSeasonalTheme(new Date("2026-11-01T04:00:00Z")).holiday?.key).toBe("veterans-day");
    expect(getNewYorkDate(new Date("2026-11-02T04:30:00Z"))).toBe("2026-11-01");
  });

  it("accepts leap dates but rejects nonexistent or malformed dates", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(getSeasonalTheme("2028-02-29").season).toBeDefined();
    for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-2-1", "1969-01-01", "2081-01-01", "invalid"]) {
      expect(isCalendarDate(value)).toBe(false);
      expect(() => getSeasonalTheme(value)).toThrow();
    }
  });

  it("never selects an expired decoration and always resolves a theme throughout the year", () => {
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day, 12)).toISOString().slice(0, 10);
      const result = getSeasonalTheme(date);
      expect(result.season.themeKey).toBeTruthy();
      if (result.holiday) {
        expect(result.holiday.startDate <= date).toBe(true);
        expect(result.holiday.endDate >= date).toBe(true);
        expect(result.season.themeKey).toBe(result.holiday.key);
      }
    }
  });

  it("does not let consumers mutate the cached calendar", () => {
    const holidays = getHolidayWindows(2026);
    holidays[0].key = "mutated";
    expect(getHolidayWindows(2026)[0].key).not.toBe("mutated");
  });
});

describe("public seasonal context and authenticated admin preview", () => {
  function createApp() {
    const app = express();
    const requireAdmin: express.RequestHandler = (req, res, next) =>
      req.header("X-Test-Admin") === "yes" ? next() : void res.status(401).json({ message: "Denied" });
    registerSeasonalThemeRoutes(app, requireAdmin, requireAdmin);
    return app;
  }

  it("serves the real current New York theme without authentication or cached responses", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T16:00:00Z"));
    const res = await request(createApp()).get("/api/seasonal-context?date=2027-01-23");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toMatchObject({
      date: "2026-10-16", timeZone: "America/New_York",
      season: { themeKey: "halloween" }, holiday: { decoration: "pumpkins" },
    });
  });

  it("switches on the next request after midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const app = createApp();
    vi.setSystemTime(new Date("2026-10-16T03:59:59Z"));
    expect((await request(app).get("/api/seasonal-context")).body.holiday).toBeNull();
    vi.setSystemTime(new Date("2026-10-16T04:00:01Z"));
    expect((await request(app).get("/api/seasonal-context")).body.holiday.key).toBe("halloween");
  });

  it("uses the same resolver for an admin preview while preserving the old flat fields", async () => {
    const app = createApp();
    expect((await request(app).get("/api/admin/seasonal-preview?date=2026-10-16")).status).toBe(401);
    const res = await request(app).get("/api/admin/seasonal-preview?date=2026-10-16").set("X-Test-Admin", "yes");
    expect(res.status).toBe(200);
    expect(res.body.themeKey).toBe("halloween");
    expect(res.body.season.themeKey).toBe(res.body.themeKey);
    expect(res.body.holiday).toMatchObject({ key: "halloween", startDate: "2026-10-16", endDate: "2026-10-31" });
    const invalid = await request(app).get("/api/admin/seasonal-preview?date=2026-02-30").set("X-Test-Admin", "yes");
    expect(invalid.status).toBe(400);
  });
});
