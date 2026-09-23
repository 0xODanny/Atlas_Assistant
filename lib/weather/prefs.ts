import { isValidLatitude, isValidLongitude } from "./service";
import type { CurrentWeather, WeatherCache, WeatherLocation, WeatherPrefs, WeatherUnits } from "./types";
import { WEATHER_CACHE_MS, WEATHER_STORAGE_KEY } from "./types";

export type WeatherStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export const DEFAULT_WEATHER_PREFS: WeatherPrefs = {
  v: 1,
  units: "F",
  location: { mode: "unset" },
};

export function isWeatherUnits(value: unknown): value is WeatherUnits {
  return value === "F" || value === "C";
}

export function parseCurrentWeather(raw: unknown): CurrentWeather | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const locationLabel = typeof value.locationLabel === "string" ? value.locationLabel.trim() : "";
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const temperatureC = Number(value.temperatureC);
  const temperatureF = Number(value.temperatureF);
  const condition = typeof value.condition === "string" ? value.condition.trim() : "";
  const weatherCode = Number(value.weatherCode);
  const observedAt = typeof value.observedAt === "string" ? value.observedAt : "";
  if (!locationLabel || !condition || !observedAt) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  if (!Number.isFinite(temperatureC) || !Number.isFinite(temperatureF) || !Number.isFinite(weatherCode)) return null;
  return {
    locationLabel,
    latitude,
    longitude,
    temperatureC,
    temperatureF,
    condition,
    weatherCode: Math.round(weatherCode),
    observedAt,
  };
}

export function parseWeatherLocation(raw: unknown): WeatherLocation {
  if (!raw || typeof raw !== "object") return { mode: "unset" };
  const value = raw as Record<string, unknown>;
  const mode = value.mode;
  if (mode !== "coords" && mode !== "manual" && mode !== "unset") return { mode: "unset" };
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim() : undefined;
  const query = typeof value.query === "string" && value.query.trim() ? value.query.trim() : undefined;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  const hasCoords = isValidLatitude(lat) && isValidLongitude(lon);
  if (mode === "coords" && !hasCoords) return { mode: "unset" };
  if (mode === "manual" && !query && !hasCoords) return { mode: "unset" };
  return {
    mode,
    label,
    query,
    lat: hasCoords ? lat : undefined,
    lon: hasCoords ? lon : undefined,
  };
}

export function parseWeatherCache(raw: unknown): WeatherCache | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const weather = parseCurrentWeather(value.weather);
  const fetchedAt = typeof value.fetchedAt === "string" ? value.fetchedAt : "";
  if (!weather || !fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) return undefined;
  return { weather, fetchedAt };
}

export function parseWeatherPrefs(raw: unknown): WeatherPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WEATHER_PREFS };
  const value = raw as Record<string, unknown>;
  if (value.v !== 1) return { ...DEFAULT_WEATHER_PREFS };
  return {
    v: 1,
    units: isWeatherUnits(value.units) ? value.units : "F",
    location: parseWeatherLocation(value.location),
    cache: parseWeatherCache(value.cache),
  };
}

export function readWeatherPrefs(storage?: WeatherStorage | null): WeatherPrefs {
  const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!store) return { ...DEFAULT_WEATHER_PREFS };
  try {
    const raw = store.getItem(WEATHER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WEATHER_PREFS };
    return parseWeatherPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WEATHER_PREFS };
  }
}

export function writeWeatherPrefs(prefs: WeatherPrefs, storage?: WeatherStorage | null): WeatherPrefs {
  const next = parseWeatherPrefs(prefs);
  const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (!store) return next;
  try {
    store.setItem(WEATHER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Device storage can be unavailable; keep the in-memory prefs.
  }
  return next;
}

export function isWeatherCacheFresh(
  fetchedAt: string | undefined,
  now: Date,
  ttlMs = WEATHER_CACHE_MS,
): boolean {
  if (!fetchedAt) return false;
  const at = Date.parse(fetchedAt);
  if (!Number.isFinite(at)) return false;
  const age = now.getTime() - at;
  return age >= 0 && age < ttlMs;
}

export function hasConfiguredLocation(location: WeatherLocation): boolean {
  if (location.mode === "unset") return false;
  if (location.mode === "coords") return isValidLatitude(Number(location.lat)) && isValidLongitude(Number(location.lon));
  return Boolean(location.query) || (isValidLatitude(Number(location.lat)) && isValidLongitude(Number(location.lon)));
}

export function shouldFetchWeather(prefs: WeatherPrefs, now: Date, ttlMs = WEATHER_CACHE_MS): boolean {
  if (!hasConfiguredLocation(prefs.location)) return false;
  return !isWeatherCacheFresh(prefs.cache?.fetchedAt, now, ttlMs);
}

export function applyWeatherSuccess(prefs: WeatherPrefs, weather: CurrentWeather, now: Date): WeatherPrefs {
  return parseWeatherPrefs({
    ...prefs,
    location: {
      ...prefs.location,
      label: weather.locationLabel,
      lat: weather.latitude,
      lon: weather.longitude,
    },
    cache: {
      weather,
      fetchedAt: now.toISOString(),
    },
  });
}

export function applyWeatherFailure(prefs: WeatherPrefs): WeatherPrefs {
  return parseWeatherPrefs(prefs);
}

export function withUnits(prefs: WeatherPrefs, units: WeatherUnits): WeatherPrefs {
  return parseWeatherPrefs({ ...prefs, units });
}

export function clearWeatherLocation(prefs: WeatherPrefs): WeatherPrefs {
  return parseWeatherPrefs({
    v: 1,
    units: prefs.units,
    location: { mode: "unset" },
  });
}
