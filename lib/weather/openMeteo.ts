import { WEATHER_FETCH_TIMEOUT_MS } from "./types";

export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

export type OpenMeteoCurrentPayload = {
  latitude?: number;
  longitude?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
  };
};

export type OpenMeteoPlace = {
  name?: string;
  latitude?: number;
  longitude?: number;
  admin1?: string;
  country?: string;
};

export type OpenMeteoGeocodePayload = {
  results?: OpenMeteoPlace[];
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchJsonWithTimeout<T>(
  url: string,
  options: { timeoutMs?: number; fetchFn?: FetchLike } = {},
): Promise<{ ok: true; data: T } | { ok: false; reason: "timeout" | "upstream" }> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? WEATHER_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { ok: false, reason: "upstream" };
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    if (error instanceof Error && /aborted|timeout/i.test(error.message)) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "upstream" };
  } finally {
    clearTimeout(timer);
  }
}

export function forecastUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({
    name: query,
    count: "1",
    language: "en",
    format: "json",
  });
  return `${OPEN_METEO_GEOCODE_URL}?${params.toString()}`;
}

export function placeLabel(place: OpenMeteoPlace | undefined, fallback: string): string {
  if (!place?.name?.trim()) return fallback;
  const name = place.name.trim();
  const region = place.admin1?.trim();
  if (region && region.toLowerCase() !== name.toLowerCase()) return `${name}, ${region}`;
  return name;
}
