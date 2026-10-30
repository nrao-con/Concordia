import { useQuery } from "@tanstack/react-query";
import type { SeasonalThemeResponse } from "@shared/seasonal-theme";

const SEASONAL_THEME_QUERY_KEY = ["/api/seasonal-context"];

async function fetchSeasonalTheme(): Promise<SeasonalThemeResponse> {
  const response = await fetch("/api/seasonal-context", { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Seasonal context unavailable (${response.status})`);
  }
  return response.json() as Promise<SeasonalThemeResponse>;
}

/**
 * Shared date-aware seasonal context for the header and shop.
 * This is optional polish: a failed request intentionally yields no holiday
 * decoration while the shop can continue using its local wellness fallback.
 */
export function useSeasonalTheme() {
  const query = useQuery<SeasonalThemeResponse>({
    queryKey: SEASONAL_THEME_QUERY_KEY,
    queryFn: fetchSeasonalTheme,
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });

  return query.isError ? null : query.data ?? null;
}
