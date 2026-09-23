import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { celsiusToFahrenheit, conditionFromWmo, formatTemperature } from "../lib/weather/conditions";
import { handleWeatherRequest } from "../lib/weather/http";
import {
  applyWeatherFailure,
  applyWeatherSuccess,
  DEFAULT_WEATHER_PREFS,
  isWeatherCacheFresh,
  parseWeatherPrefs,
  readWeatherPrefs,
  shouldFetchWeather,
  writeWeatherPrefs,
} from "../lib/weather/prefs";
import { getCurrentWeather, parseWeatherSearchParams } from "../lib/weather/service";
import { WEATHER_CACHE_MS, WEATHER_STORAGE_KEY, type CurrentWeather } from "../lib/weather/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

class MemoryStorage {
  #map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, String(value));
  }
}

const SF: CurrentWeather = {
  locationLabel: "San Francisco, California",
  latitude: 37.7749,
  longitude: -122.4194,
  temperatureC: 22.2,
  temperatureF: 72,
  condition: "Clear",
  weatherCode: 0,
  observedAt: "2026-09-22T17:00:00.000Z",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function openMeteoFetch(options: {
  forecast?: unknown;
  geocode?: unknown;
  reverse?: unknown;
  geocodeEmpty?: boolean;
}): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("geocoding-api.open-meteo.com/v1/search")) {
      if (options.geocodeEmpty) return jsonResponse({ results: [] });
      return jsonResponse(
        options.geocode ?? {
          results: [{ name: "San Francisco", admin1: "California", latitude: 37.7749, longitude: -122.4194 }],
        },
      );
    }
    if (url.includes("geocoding-api.open-meteo.com/v1/reverse")) {
      return jsonResponse(
        options.reverse ?? {
          results: [{ name: "San Francisco", admin1: "California", latitude: 37.7749, longitude: -122.4194 }],
        },
      );
    }
    if (url.includes("api.open-meteo.com/v1/forecast")) {
      return jsonResponse(
        options.forecast ?? {
          latitude: 37.77,
          longitude: -122.42,
          current: { time: "2026-09-22T10:00", temperature_2m: 22.2, weather_code: 0 },
        },
      );
    }
    return jsonResponse({ error: "unexpected" }, 500);
  };
}

test("valid coordinates return normalized current weather", async () => {
  const result = await getCurrentWeather(
    { kind: "coords", latitude: 37.7749, longitude: -122.4194 },
    openMeteoFetch({}),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.weather.locationLabel, "San Francisco, California");
  assert.equal(result.weather.condition, "Clear");
  assert.equal(result.weather.temperatureC, 22.2);
  assert.equal(result.weather.temperatureF, 72);
  assert.equal(result.weather.weatherCode, 0);
  assert.ok(!("current" in result.weather));
  assert.ok(!("temperature_2m" in result.weather));
});

test("invalid coordinates are rejected before fetch", async () => {
  const parsed = parseWeatherSearchParams(new URLSearchParams("lat=91&lon=-122"));
  assert.equal("ok" in parsed && parsed.ok === false, true);
  if (!("ok" in parsed) || parsed.ok) return;
  assert.equal(parsed.error, "invalid_coordinates");
  assert.equal(parsed.status, 400);

  const missingLon = parseWeatherSearchParams(new URLSearchParams("lat=37.77"));
  assert.equal("ok" in missingLon && missingLon.ok === false, true);
  if ("ok" in missingLon && missingLon.ok === false) {
    assert.equal(missingLon.error, "invalid_coordinates");
  }

  const result = await getCurrentWeather({ kind: "coords", latitude: 200, longitude: 0 }, async () => {
    throw new Error("should not fetch");
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "invalid_coordinates");
});

test("manual city resolution uses the top geocode result", async () => {
  const result = await getCurrentWeather({ kind: "city", q: "San Francisco" }, openMeteoFetch({}));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.weather.locationLabel, "San Francisco, California");
  assert.equal(result.weather.latitude, 37.77);
  assert.equal(result.weather.condition, "Clear");
});

test("city not found returns a clean 404", async () => {
  const result = await getCurrentWeather({ kind: "city", q: "NotARealCityxyz" }, openMeteoFetch({ geocodeEmpty: true }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "city_not_found");
  assert.equal(result.status, 404);
});

test("API rejects missing location and unreasonable queries", async () => {
  const missing = await handleWeatherRequest(new Request("http://atlas.test/api/weather"));
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body, { error: "Add a location to see weather." });

  const tooLong = await handleWeatherRequest(new Request(`http://atlas.test/api/weather?q=${"x".repeat(81)}`));
  assert.equal(tooLong.status, 400);

  const valid = await (async () => {
    globalThis.fetch = openMeteoFetch({});
    return handleWeatherRequest(new Request("http://atlas.test/api/weather?lat=37.7749&lon=-122.4194"));
  })();
  assert.equal(valid.status, 200);
  assert.deepEqual(Object.keys(valid.body as object).sort(), [
    "condition",
    "latitude",
    "locationLabel",
    "longitude",
    "observedAt",
    "temperatureC",
    "temperatureF",
    "weatherCode",
  ]);
});

test("WMO codes map to Atlas conditions", () => {
  assert.equal(conditionFromWmo(0), "Clear");
  assert.equal(conditionFromWmo(1), "Mostly clear");
  assert.equal(conditionFromWmo(2), "Partly cloudy");
  assert.equal(conditionFromWmo(3), "Cloudy");
  assert.equal(conditionFromWmo(45), "Fog");
  assert.equal(conditionFromWmo(48), "Fog");
  assert.equal(conditionFromWmo(51), "Drizzle");
  assert.equal(conditionFromWmo(61), "Rain");
  assert.equal(conditionFromWmo(71), "Snow");
  assert.equal(conditionFromWmo(80), "Showers");
  assert.equal(conditionFromWmo(95), "Thunderstorm");
  assert.equal(conditionFromWmo(99), "Thunderstorm");
  assert.equal(conditionFromWmo(1234), "Cloudy");
});

test("F/C conversion is deterministic", () => {
  assert.equal(celsiusToFahrenheit(0), 32);
  assert.equal(celsiusToFahrenheit(22.2), 72);
  assert.equal(celsiusToFahrenheit(100), 212);
  assert.equal(formatTemperature(SF, "F"), "72°F");
  assert.equal(formatTemperature(SF, "C"), "22°C");
});

test("preference validation keeps °F as the default", () => {
  const parsed = parseWeatherPrefs({
    v: 1,
    units: "C",
    location: { mode: "manual", query: "Budapest", label: "Budapest", lat: 47.5, lon: 19.04 },
  });
  assert.equal(parsed.units, "C");
  assert.equal(parsed.location.mode, "manual");
  assert.equal(parsed.location.query, "Budapest");

  assert.equal(parseWeatherPrefs({ v: 2, units: "C" }).units, "F");
  assert.equal(parseWeatherPrefs({ v: 1, units: "K" }).units, "F");
  assert.equal(parseWeatherPrefs({ v: 1, location: { mode: "coords" } }).location.mode, "unset");
  assert.deepEqual(DEFAULT_WEATHER_PREFS.units, "F");
  assert.equal(DEFAULT_WEATHER_PREFS.location.mode, "unset");
});

test("malformed localStorage fails safely", () => {
  const storage = new MemoryStorage();
  storage.setItem(WEATHER_STORAGE_KEY, "{not-json");
  assert.deepEqual(readWeatherPrefs(storage), DEFAULT_WEATHER_PREFS);

  storage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ v: 1, units: "C", location: "Paris" }));
  const recovered = readWeatherPrefs(storage);
  assert.equal(recovered.units, "C");
  assert.equal(recovered.location.mode, "unset");
  assert.equal(recovered.cache, undefined);
});

test("cache fresh/stale behavior is deterministic", () => {
  const now = new Date("2026-09-22T18:00:00.000Z");
  const freshAt = new Date(now.getTime() - WEATHER_CACHE_MS + 1).toISOString();
  const staleAt = new Date(now.getTime() - WEATHER_CACHE_MS).toISOString();
  assert.equal(isWeatherCacheFresh(freshAt, now), true);
  assert.equal(isWeatherCacheFresh(staleAt, now), false);
  assert.equal(isWeatherCacheFresh(undefined, now), false);

  const prefs = writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: { mode: "coords", lat: 37.77, lon: -122.42, label: "San Francisco, California" },
      cache: { weather: SF, fetchedAt: freshAt },
    },
    new MemoryStorage(),
  );
  assert.equal(shouldFetchWeather(prefs, now), false);
  assert.equal(shouldFetchWeather({ ...prefs, cache: { weather: SF, fetchedAt: staleAt } }, now), true);
});

test("a failed refresh keeps a usable cached result", () => {
  const now = new Date("2026-09-22T18:00:00.000Z");
  const prefs = applyWeatherSuccess(
    {
      v: 1,
      units: "F",
      location: { mode: "coords", lat: 37.77, lon: -122.42 },
    },
    SF,
    now,
  );
  const afterFailure = applyWeatherFailure(prefs);
  assert.equal(afterFailure.cache?.weather.condition, "Clear");
  assert.equal(afterFailure.cache?.weather.temperatureF, 72);
});
