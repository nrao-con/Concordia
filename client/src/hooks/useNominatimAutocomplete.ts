import { useState, useEffect, useRef, useCallback } from "react";

export interface NominatimSuggestion {
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  lon: number;
  osmType?: string;
  osmId?: number;
}

const STATE_NAME_TO_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

function parseNominatimResult(result: any): NominatimSuggestion | null {
  const addr = result.address;
  if (!addr) return null;

  const streetNum = addr.house_number || "";
  const road = addr.road || addr.pedestrian || addr.footway || "";
  const street = [streetNum, road].filter(Boolean).join(" ");

  if (!street) return null;

  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    addr.suburb ||
    addr.county ||
    "";
  const stateFull = addr.state || "";
  const state =
    STATE_NAME_TO_ABBR[stateFull] ||
    (stateFull.length === 2 ? stateFull.toUpperCase() : "");
  const zipCode = (addr.postcode || "").replace(/[^0-9]/g, "").slice(0, 5);

  const stateZip = [state, zipCode].filter(Boolean).join(" ");
  const label = [street, city, stateZip].filter(Boolean).join(", ");

  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    label,
    street,
    city,
    state,
    zipCode,
    lat,
    lon,
    osmType: typeof result.osm_type === "string" ? result.osm_type : undefined,
    osmId: Number.isFinite(Number(result.osm_id)) ? Number(result.osm_id) : undefined,
  };
}

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;
const MIN_FETCH_INTERVAL_MS = 1050;

export function useNominatimAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<NominatimSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      const now = Date.now();
      const gap = now - lastFetchTimeRef.current;
      if (gap < MIN_FETCH_INTERVAL_MS) {
        await new Promise<void>((r) => setTimeout(r, MIN_FETCH_INTERVAL_MS - gap));
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastFetchTimeRef.current = Date.now();

      try {
        const params = new URLSearchParams({
          q: trimmed,
          format: "json",
          addressdetails: "1",
          countrycodes: "us",
          limit: "6",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
          {
            signal: controller.signal,
            headers: { "Accept-Language": "en-US,en;q=0.9" },
          }
        );
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data: any[] = await res.json();
        const parsed = data
          .map(parseNominatimResult)
          .filter((s): s is NominatimSuggestion => s !== null)
          .slice(0, 5);
        setSuggestions(parsed);
      } catch (err: any) {
        if (err?.name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setSuggestions([]);
    setLoading(false);
  }, []);

  return { suggestions, loading, clear };
}
