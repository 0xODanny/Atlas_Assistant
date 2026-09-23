import { celsiusToFahrenheit, conditionFromWmo } from "./conditions";
import {
  fetchJsonWithTimeout,
  forecastUrl,
  geocodeUrl,
  placeLabel,
  reverseGeocodeUrl,
  type FetchLike,
  type OpenMeteoCurrentPayload,
  type OpenMeteoGeocodePayload,
} from "./openMeteo";
import type { CurrentWeather, WeatherFailure, WeatherQuery, WeatherResult } from "./types";
import { WEATHER_MAX_QUERY_LENGTH } from "./types";

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function normalizeCityQuery(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const query = raw.trim().replace(/\s+/g, " ");
  if (query.length < 1 || query.length > WEATHER_MAX_QUERY_LENGTH) return null;
  if (/[\u0000-\u001f\u007f]/.test(query)) return null;
  return query;
}

export function parseWeatherSearchParams(searchParams: URLSearchParams): WeatherQuery | WeatherFailure {
  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");
  const qRaw = searchParams.get("q");
  const hasCoords = latRaw !== null || lonRaw !== null;

  if (hasCoords) {
    if (latRaw === null || lonRaw === null) {
      return {
        ok: false,
        error: "invalid_coordinates",
        message: "Enter a valid latitude and longitude.",
        status: 400,
      };
    }
    const latitude = Number(latRaw);
    const longitude = Number(lonRaw);
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return {
        ok: false,
        error: "invalid_coordinates",
        message: "Enter a valid latitude and longitude.",
        status: 400,
      };
    }
    return { kind: "coords", latitude, longitude };
  }

  const query = normalizeCityQuery(qRaw);
  if (qRaw !== null && query === null) {
    return {
      ok: false,
      error: "invalid_query",
      message: "Enter a city name.",
      status: 400,
    };
  }
  if (query) return { kind: "city", q: query };

  return {
    ok: false,
    error: "missing_location",
    message: "Add a location to see weather.",
    status: 400,
  };
}

function fail(
  error: "invalid_coordinates" | "missing_location" | "invalid_query" | "city_not_found" | "upstream" | "timeout",
  message: string,
  status: number,
): WeatherResult {
  return { ok: false, error, message, status };
}

function observedAtFrom(time?: string): string {
  if (!time) return new Date().toISOString();
  const ms = Date.parse(time);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

function normalizeCurrent(
  payload: OpenMeteoCurrentPayload,
  locationLabel: string,
  fallbackLat: number,
  fallbackLon: number,
): CurrentWeather | null {
  const temperatureC = payload.current?.temperature_2m;
  const weatherCode = payload.current?.weather_code;
  if (!Number.isFinite(temperatureC) || !Number.isFinite(weatherCode)) return null;
  const latitude = Number.isFinite(payload.latitude) ? Number(payload.latitude) : fallbackLat;
  const longitude = Number.isFinite(payload.longitude) ? Number(payload.longitude) : fallbackLon;
  return {
    locationLabel,
    latitude,
    longitude,
    temperatureC: Number(temperatureC),
    temperatureF: celsiusToFahrenheit(Number(temperatureC)),
    condition: conditionFromWmo(Number(weatherCode)),
    weatherCode: Math.round(Number(weatherCode)),
    observedAt: observedAtFrom(payload.current?.time),
  };
}

export async function resolvePlaceLabel(
  latitude: number,
  longitude: number,
  fetchFn?: FetchLike,
  fallback = "Current location",
): Promise<string> {
  const result = await fetchJsonWithTimeout<OpenMeteoGeocodePayload>(reverseGeocodeUrl(latitude, longitude), { fetchFn });
  if (!result.ok) return fallback;
  return placeLabel(result.data.results?.[0], fallback);
}

export async function getCurrentWeather(
  query: WeatherQuery,
  fetchFn?: FetchLike,
): Promise<WeatherResult> {
  if (query.kind === "city") {
    const normalized = normalizeCityQuery(query.q);
    if (!normalized) return fail("invalid_query", "Enter a city name.", 400);
    const geo = await fetchJsonWithTimeout<OpenMeteoGeocodePayload>(geocodeUrl(normalized), { fetchFn });
    if (!geo.ok) {
      return geo.reason === "timeout"
        ? fail("timeout", "Weather is taking too long. Try again.", 504)
        : fail("upstream", "Weather is unavailable right now.", 502);
    }
    const place = geo.data.results?.[0];
    if (!place || !isValidLatitude(Number(place.latitude)) || !isValidLongitude(Number(place.longitude))) {
      return fail("city_not_found", "That city could not be found.", 404);
    }
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    const forecast = await fetchJsonWithTimeout<OpenMeteoCurrentPayload>(forecastUrl(latitude, longitude), { fetchFn });
    if (!forecast.ok) {
      return forecast.reason === "timeout"
        ? fail("timeout", "Weather is taking too long. Try again.", 504)
        : fail("upstream", "Weather is unavailable right now.", 502);
    }
    const weather = normalizeCurrent(forecast.data, placeLabel(place, normalized), latitude, longitude);
    if (!weather) return fail("upstream", "Weather is unavailable right now.", 502);
    return { ok: true, weather };
  }

  if (!isValidLatitude(query.latitude) || !isValidLongitude(query.longitude)) {
    return fail("invalid_coordinates", "Enter a valid latitude and longitude.", 400);
  }
  const [forecast, label] = await Promise.all([
    fetchJsonWithTimeout<OpenMeteoCurrentPayload>(forecastUrl(query.latitude, query.longitude), { fetchFn }),
    resolvePlaceLabel(query.latitude, query.longitude, fetchFn),
  ]);
  if (!forecast.ok) {
    return forecast.reason === "timeout"
      ? fail("timeout", "Weather is taking too long. Try again.", 504)
      : fail("upstream", "Weather is unavailable right now.", 502);
  }
  const weather = normalizeCurrent(forecast.data, label, query.latitude, query.longitude);
  if (!weather) return fail("upstream", "Weather is unavailable right now.", 502);
  return { ok: true, weather };
}
