import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { currentCapabilities, capabilityCopy } from "../lib/assistant/capabilities";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { createSeedState } from "../lib/data/seed";
import { GEOLOCATION_OPTIONS, requestDevicePosition } from "../lib/weather/geolocation";
import { normalizeForecast } from "../lib/weather/forecast";
import { formatTemperature, formatWindSpeed } from "../lib/weather/conditions";
import { readWeatherPrefs, writeWeatherPrefs } from "../lib/weather/prefs";
import { fetchForecastFromApi, fetchLocationLabelFromApi, PLACE_RESOLUTION_MESSAGES, WeatherSession } from "../lib/weather/session";
import type { LocationResolution } from "../lib/weather/types";
import {
  FALLBACK_LOCATION_LABEL,
  OPEN_METEO_ATTRIBUTION_HREF,
  OPEN_METEO_ATTRIBUTION_LABEL,
  OSM_ATTRIBUTION_HREF,
  OSM_ATTRIBUTION_LABEL,
  WEATHER_STORAGE_KEY,
  type CurrentWeather,
} from "../lib/weather/types";

const ROOT = join(process.cwd());

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

function fakeGeo(result: Awaited<ReturnType<typeof requestDevicePosition>>) {
  let calls = 0;
  return {
    calls: () => calls,
    api: {
      getCurrentPosition(
        success: (position: GeolocationPosition) => void,
        error?: (err: GeolocationPositionError) => void,
      ) {
        calls += 1;
        if (result.ok) {
          success({
            coords: { latitude: result.latitude, longitude: result.longitude },
          } as GeolocationPosition);
          return;
        }
        const code = result.reason === "denied" ? 1 : result.reason === "timeout" ? 3 : 2;
        error?.({ code, message: result.reason } as GeolocationPositionError);
      },
    },
  };
}

test("Today does not request geolocation on load", async () => {
  const geo = fakeGeo({ ok: true, latitude: 37.77, longitude: -122.42 });
  const session = new WeatherSession({
    storage: new MemoryStorage(),
    geolocation: geo.api,
    fetchWeather: async () => {
      throw new Error("should not fetch on unconfigured load");
    },
  });
  await session.loadIfNeeded();
  assert.equal(session.geoRequests, 0);
  assert.equal(geo.calls(), 0);
  assert.equal(session.state.phase, "unconfigured");

  const today = readFileSync(join(ROOT, "components/today/TodayWeather.tsx"), "utf8");
  const hook = readFileSync(join(ROOT, "lib/hooks/useWeather.ts"), "utf8");
  assert.match(today, /Add weather/);
  assert.match(today, /<button type="button"/);
  assert.doesNotMatch(today, /getCurrentPosition|watchPosition/);
  assert.doesNotMatch(hook, /getCurrentPosition|watchPosition/);
  assert.match(hook, /loadIfNeeded/);
});

test("geolocation success saves coordinates and weather", async () => {
  const geo = fakeGeo({ ok: true, latitude: 37.7749, longitude: -122.4194 });
  const storage = new MemoryStorage();
  const session = new WeatherSession({
    storage,
    geolocation: geo.api,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => ({ ok: true, locationLabel: "San Francisco, California" }),
    fetchWeather: async (query) => {
      assert.equal(query.kind, "coords");
      if (query.kind !== "coords") throw new Error("expected coords");
      assert.equal(query.latitude, 37.7749);
      assert.equal(query.longitude, -122.4194);
      return { ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } };
    },
  });
  await session.requestDeviceLocation();
  assert.equal(session.geoRequests, 1);
  assert.equal(session.labelLookups, 1);
  assert.equal(geo.calls(), 1);
  assert.equal(session.state.phase, "ready");
  assert.equal(session.prefs.location.mode, "coords");
  assert.equal(session.prefs.location.lat, 37.7749);
  assert.equal(session.prefs.location.label, "San Francisco, California");
  assert.equal(session.prefs.location.labelState, "resolved");
  assert.equal(session.prefs.location.labelVersion, 2);
  assert.equal(session.weather?.condition, "Clear");
  assert.equal(session.weather?.locationLabel, "San Francisco, California");
  assert.equal(readWeatherPrefs(storage).location.mode, "coords");
});

test("geolocation denied offers manual city fallback", async () => {
  const geo = fakeGeo({ ok: false, reason: "denied" });
  const session = new WeatherSession({
    storage: new MemoryStorage(),
    geolocation: geo.api,
    fetchWeather: async () => {
      throw new Error("denied location should not fetch");
    },
  });
  await session.requestDeviceLocation();
  assert.equal(session.state.phase, "city");
  assert.match(session.state.error ?? "", /denied/i);
  assert.equal(session.prefs.location.mode, "unset");
});

test("manual city success persists query, label, and coordinates", async () => {
  const storage = new MemoryStorage();
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    fetchWeather: async (query) => {
      assert.equal(query.kind, "city");
      if (query.kind !== "city") throw new Error("expected city");
      assert.equal(query.q, "São Paulo");
      return {
        ok: true,
        weather: {
          ...SF,
          locationLabel: "São Paulo, São Paulo",
          latitude: -23.55,
          longitude: -46.63,
        },
      };
    },
  });
  await session.submitCity("São Paulo");
  assert.equal(session.prefs.location.mode, "manual");
  assert.equal(session.prefs.location.query, "São Paulo");
  assert.equal(session.prefs.location.label, "São Paulo, São Paulo");
  assert.equal(session.prefs.location.lat, -23.55);
  assert.equal(session.weather?.locationLabel, "São Paulo, São Paulo");
});

test("saved coordinates reuse without another permission request", async () => {
  const geo = fakeGeo({ ok: true, latitude: 1, longitude: 2 });
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.7749,
        lon: -122.4194,
        label: "San Francisco, California",
        labelState: "resolved",
        labelVersion: 2,
      },
    },
    storage,
  );
  let fetches = 0;
  const session = new WeatherSession({
    storage,
    geolocation: geo.api,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      throw new Error("saved coordinates must not reverse-geocode");
    },
    fetchWeather: async (query) => {
      fetches += 1;
      assert.equal(query.kind, "coords");
      if (query.kind === "coords") {
        assert.equal(query.latitude, 37.7749);
        assert.equal(query.longitude, -122.4194);
      }
      return { ok: true, weather: SF };
    },
  });
  await session.loadIfNeeded();
  assert.equal(session.geoRequests, 0);
  assert.equal(geo.calls(), 0);
  assert.equal(fetches, 1);
  assert.equal(session.labelLookups, 0);
  assert.equal(session.state.phase, "ready");
});

test("normal weather refresh does not reverse-geocode", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.7749,
        lon: -122.4194,
        label: "San Francisco, California",
        labelState: "resolved",
        labelVersion: 2,
      },
      cache: { weather: SF, fetchedAt: "2026-09-22T17:00:00.000Z" },
    },
    storage,
  );
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      throw new Error("stale weather refresh must not reverse-geocode");
    },
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.loadIfNeeded();
  assert.equal(session.labelLookups, 0);
  assert.equal(session.prefs.location.label, "San Francisco, California");
});

test("fresh cached weather does not reverse-geocode", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.7749,
        lon: -122.4194,
        label: "San Francisco, California",
        labelState: "resolved",
        labelVersion: 2,
      },
      cache: { weather: SF, fetchedAt: "2026-09-22T17:50:00.000Z" },
    },
    storage,
  );
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      throw new Error("fresh cache must not reverse-geocode");
    },
    fetchWeather: async () => {
      throw new Error("fresh cache must not fetch weather");
    },
  });
  await session.loadIfNeeded();
  assert.equal(session.labelLookups, 0);
  assert.equal(session.state.phase, "ready");
});

test("existing Current location recovers once", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: { mode: "coords", lat: 37.7749, lon: -122.4194, label: FALLBACK_LOCATION_LABEL },
      cache: { weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL }, fetchedAt: "2026-09-22T17:50:00.000Z" },
    },
    storage,
  );
  let lookups = 0;
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      lookups += 1;
      return { ok: true, locationLabel: "San Francisco, California" };
    },
    fetchWeather: async () => {
      throw new Error("fresh recovered weather should not refetch");
    },
  });
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
  assert.equal(session.prefs.location.label, "San Francisco, California");
  assert.equal(session.prefs.location.labelState, "resolved");
  assert.equal(session.prefs.location.labelVersion, 2);
  assert.equal(session.weather?.locationLabel, "San Francisco, California");
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
  assert.equal(readWeatherPrefs(storage).location.label, "San Francisco, California");
});

test("failed label recovery does not loop", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: { mode: "coords", lat: 37.7749, lon: -122.4194, label: FALLBACK_LOCATION_LABEL },
    },
    storage,
  );
  let lookups = 0;
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      lookups += 1;
      return { ok: false };
    },
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
  assert.equal(session.prefs.location.label, FALLBACK_LOCATION_LABEL);
  assert.equal(session.prefs.location.labelState, "fallback");
  assert.equal(session.prefs.location.labelVersion, 2);
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
});

test("old state-only label migrates once to the corrected locality", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.4275,
        lon: -122.1697,
        label: "California",
        labelState: "resolved",
      },
      cache: { weather: { ...SF, locationLabel: "California" }, fetchedAt: "2026-09-22T17:50:00.000Z" },
    },
    storage,
  );
  let lookups = 0;
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      lookups += 1;
      return { ok: true, locationLabel: "Stanford, California" };
    },
    fetchWeather: async () => {
      throw new Error("fresh cache must not refetch weather during label migration");
    },
  });
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
  assert.equal(session.prefs.location.label, "Stanford, California");
  assert.equal(session.prefs.location.labelState, "resolved");
  assert.equal(session.prefs.location.labelVersion, 2);
  assert.equal(session.weather?.locationLabel, "Stanford, California");
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
});

test("failed V2 migration drops the old state-only label", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.4275,
        lon: -122.1697,
        label: "California",
        labelState: "resolved",
      },
    },
    storage,
  );
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => ({ ok: false }),
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.loadIfNeeded();
  assert.equal(session.labelLookups, 1);
  assert.equal(session.prefs.location.label, FALLBACK_LOCATION_LABEL);
  assert.equal(session.prefs.location.labelState, "fallback");
  assert.equal(session.prefs.location.labelVersion, 2);
  await session.loadIfNeeded();
  assert.equal(session.labelLookups, 1);
});

test("explicit Use my location can resolve a label again", async () => {
  const geo = fakeGeo({ ok: true, latitude: 47.4979, longitude: 19.0402 });
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.77,
        lon: -122.42,
        label: FALLBACK_LOCATION_LABEL,
        labelState: "fallback",
        labelVersion: 2,
      },
    },
    storage,
  );
  let lookups = 0;
  const session = new WeatherSession({
    storage,
    geolocation: geo.api,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      lookups += 1;
      return { ok: true, locationLabel: "Budapest, Budapest" };
    },
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.loadIfNeeded();
  assert.equal(lookups, 0);
  await session.requestDeviceLocation();
  assert.equal(lookups, 1);
  assert.equal(session.prefs.location.label, "Budapest, Budapest");
  assert.equal(session.prefs.location.labelState, "resolved");
});

test("manual city remains Open-Meteo only", async () => {
  const storage = new MemoryStorage();
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      throw new Error("manual city must not use Nominatim");
    },
    fetchWeather: async (query) => {
      assert.equal(query.kind, "city");
      return { ok: true, weather: { ...SF, locationLabel: "Budapest, Budapest", latitude: 47.5, longitude: 19.04 } };
    },
  });
  await session.submitCity("Budapest");
  assert.equal(session.labelLookups, 0);
  assert.equal(session.prefs.location.query, "Budapest");
  assert.equal(session.prefs.location.label, "Budapest, Budapest");
  assert.equal(session.prefs.location.labelVersion, 2);
  assert.equal(session.placeNotice, null);
  assert.doesNotMatch(storage.getItem(WEATHER_STORAGE_KEY) ?? "", /"resolution"/);
});

test("stale weather refresh does not reverse-geocode", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.7749,
        lon: -122.4194,
        label: "San Francisco, California",
        labelState: "resolved",
        labelVersion: 2,
      },
      cache: { weather: SF, fetchedAt: "2026-09-22T17:00:00.000Z" },
    },
    storage,
  );
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      throw new Error("stale weather refresh must not reverse-geocode");
    },
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.refresh();
  assert.equal(session.labelLookups, 0);
  assert.equal(session.prefs.location.label, "San Francisco, California");
  assert.equal(session.placeNotice, null);
  assert.doesNotMatch(storage.getItem(WEATHER_STORAGE_KEY) ?? "", /"resolution"/);
});

test("unit preference persists independently of location", () => {
  const storage = new MemoryStorage();
  const session = new WeatherSession({ storage });
  assert.equal(session.prefs.units, "F");
  session.setUnits("C");
  assert.equal(readWeatherPrefs(storage).units, "C");
  session.clearLocation();
  assert.equal(readWeatherPrefs(storage).units, "C");
  assert.equal(readWeatherPrefs(storage).location.mode, "unset");
});

test("geolocation uses a single getCurrentPosition with sensible options", () => {
  assert.equal(GEOLOCATION_OPTIONS.enableHighAccuracy, false);
  assert.equal(GEOLOCATION_OPTIONS.timeout, 10_000);
  assert.equal(GEOLOCATION_OPTIONS.maximumAge, 5 * 60 * 1000);
  const src = readFileSync(join(ROOT, "lib/weather/geolocation.ts"), "utf8");
  assert.match(src, /getCurrentPosition/);
  assert.doesNotMatch(src, /watchPosition/);
});

test("Assistant weather capability stays unavailable", () => {
  const weather = currentCapabilities().find((item) => item.id === "weather");
  assert.equal(weather?.available, false);
  assert.match(capabilityCopy("weather"), /don't have live weather connected yet/);
  const state = createSeedState(new Date("2026-09-22T18:00:00.000Z"));
  const answer = fulfillIntent(
    { type: "answer", capability: "weather" },
    {
      now: "2026-09-22T18:00:00.000Z",
      timezone: state.profile.timezone,
      profile: state.profile,
      events: state.events,
      tasks: state.tasks,
      workouts: state.workouts,
      meetings: state.meetings,
    },
  );
  assert.match(answer.message, /don't have live weather connected yet/);
  const fulfill = readFileSync(join(ROOT, "lib/assistant/fulfill.ts"), "utf8");
  const capabilities = readFileSync(join(ROOT, "lib/assistant/capabilities.ts"), "utf8");
  assert.match(capabilities, /id: "weather", available: false/);
  assert.match(fulfill, /I don't have live weather connected yet|capabilityCopy\("weather"\)/);
});

test("Today and Settings keep weather compact, labeled, and attributed", () => {
  const today = readFileSync(join(ROOT, "components/today/TodayWeather.tsx"), "utf8");
  const todayView = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  const settings = readFileSync(join(ROOT, "components/settings/WeatherSettings.tsx"), "utf8");
  const form = readFileSync(join(ROOT, "components/weather/WeatherCityForm.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const api = readFileSync(join(ROOT, "app/api/weather/route.ts"), "utf8");
  const weatherFiles = [
    "lib/weather/service.ts",
    "lib/weather/openMeteo.ts",
    "lib/weather/http.ts",
    "lib/weather/session.ts",
    "lib/weather/reverseGeocode.ts",
    "app/api/weather/route.ts",
    "app/api/weather/location/route.ts",
    "lib/weather/forecast.ts",
    "app/api/weather/forecast/route.ts",
  ].map((file) => readFileSync(join(ROOT, file), "utf8"));

  assert.match(todayView, /<TodayWeather \/>/);
  assert.match(todayView, /data-atlas-greeting[\s\S]*<TodayWeather \/>[\s\S]*subtitle/);
  assert.match(today, /loadForecast\(\)/);
  assert.match(today, /setSheetOpen\(true\)/);
  assert.doesNotMatch(today, /href="\/settings#weather"/);
  assert.match(readFileSync(join(ROOT, "components/weather/WeatherDetailSheet.tsx"), "utf8"), /\/settings#weather/);
  assert.doesNotMatch(today, /getCurrentPosition/);
  assert.match(today, /aria-live="polite"/);
  assert.match(settings, /aria-pressed=\{weather\.units === "F"\}/);
  const types = readFileSync(join(ROOT, "lib/weather/types.ts"), "utf8");
  assert.match(types, /Weather data by Open-Meteo.com/);
  assert.match(types, /https:\/\/open-meteo.com\//);
  assert.match(settings, /OPEN_METEO_ATTRIBUTION_LABEL/);
  assert.match(settings, /OPEN_METEO_ATTRIBUTION_HREF/);
  assert.match(settings, /OSM_ATTRIBUTION_LABEL/);
  assert.match(settings, /OSM_ATTRIBUTION_HREF/);
  assert.match(settings, /Not configured/);
  assert.match(settings, /Clear weather location/);
  assert.match(form, /htmlFor=\{id\}/);
  assert.match(form, /htmlFor=\{id\}[\s\S]*City/);
  assert.match(css, /\.today-weather/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /\.today-weather[\s\S]{0,80}--atlas-plum/);
  assert.match(api, /handleWeatherRequest/);
  for (const src of weatherFiles) {
    assert.doesNotMatch(src, /console\.(log|info|debug)\(/);
  }
  assert.equal(WEATHER_STORAGE_KEY, "atlas.weather.v1");
  assert.equal(OPEN_METEO_ATTRIBUTION_LABEL, "Weather data by Open-Meteo.com");
  assert.equal(OPEN_METEO_ATTRIBUTION_HREF, "https://open-meteo.com/");
  assert.equal(OSM_ATTRIBUTION_LABEL, "© OpenStreetMap contributors");
  assert.equal(OSM_ATTRIBUTION_HREF, "https://www.openstreetmap.org/copyright");
  const openMeteo = readFileSync(join(ROOT, "lib/weather/openMeteo.ts"), "utf8");
  const weatherApi = readFileSync(join(ROOT, "lib/weather/service.ts"), "utf8");
  const weatherRoute = readFileSync(join(ROOT, "app/api/weather/route.ts"), "utf8");
  assert.doesNotMatch(openMeteo, /\/v1\/reverse/);
  assert.doesNotMatch(weatherApi, /nominatim|reverseGeocode/);
  assert.doesNotMatch(weatherRoute, /nominatim|location/);
  assert.match(readFileSync(join(ROOT, "lib/weather/reverseGeocode.ts"), "utf8"), /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(readFileSync(join(ROOT, "lib/weather/reverseGeocode.ts"), "utf8"), /User-Agent/);
});

test("explicit Use my location stays resolving through the place lookup", async () => {
  const geo = fakeGeo({ ok: true, latitude: 37.4419, longitude: -122.143 });
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.44,
        lon: -122.14,
        label: FALLBACK_LOCATION_LABEL,
        labelState: "fallback",
        labelVersion: 2,
      },
      cache: { weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL }, fetchedAt: "2026-09-22T17:50:00.000Z" },
    },
    storage,
  );
  let during: { phase: string; step: string | null } | null = null;
  const session = new WeatherSession({
    storage,
    geolocation: geo.api,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      during = { phase: session.state.phase, step: session.state.locateStep };
      return { ok: true, locationLabel: "Palo Alto, California", resolution: "ok" };
    },
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.requestDeviceLocation();
  assert.deepEqual(during, { phase: "locating", step: "place" });
  assert.equal(session.state.phase, "ready");
  assert.equal(session.prefs.location.label, "Palo Alto, California");
  assert.equal(session.prefs.location.labelState, "resolved");
  assert.equal(session.placeNotice, null);
  assert.equal(session.weather?.temperatureF, 72);
  assert.doesNotMatch(storage.getItem(WEATHER_STORAGE_KEY) ?? "", /"resolution"/);
  const settings = readFileSync(join(ROOT, "components/settings/WeatherSettings.tsx"), "utf8");
  const today = readFileSync(join(ROOT, "components/today/TodayWeather.tsx"), "utf8");
  assert.match(settings, /Finding place name…/);
  assert.match(settings, /Getting location…/);
  assert.match(today, /Finding place name…/);
});

async function explicitPlaceFailure(resolution: Exclude<LocationResolution, "ok">) {
  const geo = fakeGeo({ ok: true, latitude: 37.4419, longitude: -122.143 });
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "C",
      location: {
        mode: "coords",
        lat: 37.44,
        lon: -122.14,
        label: FALLBACK_LOCATION_LABEL,
        labelState: "fallback",
        labelVersion: 2,
      },
      cache: { weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL }, fetchedAt: "2026-09-22T17:50:00.000Z" },
    },
    storage,
  );
  let duringLocate = false;
  const session = new WeatherSession({
    storage,
    geolocation: geo.api,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      duringLocate = session.state.phase === "locating" && session.state.locateStep === "place";
      return { ok: false, resolution };
    },
    fetchWeather: async () => ({ ok: true, weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL } }),
  });
  await session.requestDeviceLocation();
  return { session, storage, duringLocate };
}

test("explicit place-name failures stay visible and out of saved prefs", async () => {
  const resolutions = Object.keys(PLACE_RESOLUTION_MESSAGES) as Array<Exclude<LocationResolution, "ok">>;
  for (const resolution of resolutions) {
    const { session, storage, duringLocate } = await explicitPlaceFailure(resolution);
    assert.equal(duringLocate, true, resolution);
    assert.equal(session.placeNotice, PLACE_RESOLUTION_MESSAGES[resolution], resolution);
    assert.equal(session.prefs.location.label, FALLBACK_LOCATION_LABEL, resolution);
    assert.equal(session.prefs.location.labelState, "fallback", resolution);
    assert.equal(session.prefs.location.labelVersion, 2, resolution);
    assert.equal(session.state.phase, "ready", resolution);
    assert.equal(session.weather?.condition, "Clear", resolution);
    const raw = storage.getItem(WEATHER_STORAGE_KEY) ?? "";
    assert.doesNotMatch(raw, /"resolution"/, resolution);
    assert.doesNotMatch(raw, new RegExp(resolution), resolution);
  }
});

test("automatic V2 migration consumes resolution without showing it", async () => {
  const storage = new MemoryStorage();
  writeWeatherPrefs(
    {
      v: 1,
      units: "F",
      location: {
        mode: "coords",
        lat: 37.4275,
        lon: -122.1697,
        label: "California",
        labelState: "resolved",
      },
      cache: { weather: { ...SF, locationLabel: "California" }, fetchedAt: "2026-09-22T17:50:00.000Z" },
    },
    storage,
  );
  let lookups = 0;
  const session = new WeatherSession({
    storage,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
    resolveLabel: async () => {
      lookups += 1;
      return { ok: false, resolution: "no_locality" };
    },
    fetchWeather: async () => {
      throw new Error("fresh cache must not refetch weather during label migration");
    },
  });
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
  assert.equal(session.placeNotice, null);
  assert.equal(session.locateStep, null);
  assert.notEqual(session.state.phase, "locating");
  assert.equal(session.prefs.location.label, FALLBACK_LOCATION_LABEL);
  assert.equal(session.prefs.location.labelState, "fallback");
  assert.equal(session.prefs.location.labelVersion, 2);
  await session.loadIfNeeded();
  assert.equal(lookups, 1);
  assert.doesNotMatch(storage.getItem(WEATHER_STORAGE_KEY) ?? "", /"resolution"|no_locality/);
});

test("location client keeps only the closed resolution code", async () => {
  const result = await fetchLocationLabelFromApi(37.44, -122.14, async () => {
    return new Response(
      JSON.stringify({
        locationLabel: FALLBACK_LOCATION_LABEL,
        resolution: "rate_limited",
        error: "PROVIDER_BODY_SHOULD_NOT_LEAK",
        display_name: "Campus Drive",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  assert.deepEqual(result, { ok: false, resolution: "rate_limited" });
  assert.doesNotMatch(JSON.stringify(result), /PROVIDER_BODY_SHOULD_NOT_LEAK|Campus Drive|37\.44/);
});

function sampleForecast(timezone = "America/Los_Angeles") {
  const times = Array.from({ length: 12 }, (_, index) => {
    const hour = (22 + index) % 24;
    const day = 22 + index >= 24 ? 24 : 23;
    return `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`;
  });
  const forecast = normalizeForecast({
    timezone,
    current: { temperature_2m: 20, apparent_temperature: 18, weather_code: 0, wind_speed_10m: 16 },
    hourly: {
      time: times,
      temperature_2m: Array(12).fill(20),
      weather_code: Array(12).fill(0),
      precipitation_probability: [35, ...Array(11).fill(0)],
    },
    daily: {
      time: ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"],
      weather_code: Array(7).fill(1),
      temperature_2m_max: Array(7).fill(22),
      temperature_2m_min: Array(7).fill(12),
      precipitation_probability_max: Array(7).fill(10),
    },
  });
  if (!forecast) throw new Error("sample forecast failed");
  return forecast;
}

function readyPrefs(forecastFetchedAt: string, forecast = sampleForecast()) {
  return {
    v: 1 as const,
    units: "F" as const,
    location: {
      mode: "coords" as const,
      lat: 37.4419,
      lon: -122.143,
      label: FALLBACK_LOCATION_LABEL,
      labelState: "fallback" as const,
      labelVersion: 2,
    },
    cache: {
      weather: { ...SF, locationLabel: FALLBACK_LOCATION_LABEL },
      fetchedAt: "2026-09-23T18:00:00.000Z",
    },
    forecast: { forecast, fetchedAt: forecastFetchedAt },
  };
}

test("forecast cache renders fresh data and preserves weather when refresh fails", async () => {
  const now = new Date("2026-09-23T18:00:00.000Z");
  let forecastCalls = 0;
  const fresh = new WeatherSession({
    storage: new MemoryStorage(),
    prefs: readyPrefs(now.toISOString()),
    now: () => now,
    fetchForecast: async () => {
      forecastCalls += 1;
      throw new Error("fresh forecast should not fetch");
    },
    geolocation: { getCurrentPosition() { throw new Error("geo"); } },
    resolveLabel: async () => { throw new Error("label"); },
  });
  await fresh.loadForecast();
  assert.equal(forecastCalls, 0);
  assert.equal(fresh.forecastPhase, "ready");
  assert.equal(fresh.prefs.location.label, "Current location");

  let release: (value: { ok: false; message: string }) => void = () => {};
  const gate = new Promise<{ ok: false; message: string }>((resolve) => {
    release = resolve;
  });
  const staleAt = new Date(now.getTime() - 31 * 60 * 1000).toISOString();
  const stale = new WeatherSession({
    storage: new MemoryStorage(),
    prefs: readyPrefs(staleAt),
    now: () => now,
    fetchForecast: async () => {
      forecastCalls += 1;
      return gate;
    },
    fetchWeather: async () => { throw new Error("current weather"); },
  });
  const pending = stale.loadForecast();
  assert.equal(stale.forecastPhase, "refreshing");
  assert.equal(stale.prefs.forecast?.forecast.timezone, "America/Los_Angeles");
  assert.equal(stale.weather?.temperatureF, 72);
  release({ ok: false, message: "Forecast is unavailable right now." });
  await pending;
  assert.equal(stale.forecastPhase, "ready");
  assert.equal(stale.prefs.forecast?.forecast.current.temperatureC, 20);
  assert.equal(stale.weather?.condition, "Clear");
  assert.equal(stale.prefs.location.label, "Current location");

  const missing = new WeatherSession({
    storage: new MemoryStorage(),
    prefs: { ...readyPrefs(now.toISOString()), forecast: undefined },
    now: () => now,
    fetchForecast: async () => ({ ok: false, message: "Forecast is unavailable right now." }),
  });
  let sawLoading = false;
  const original = missing.onChange;
  missing.onChange = () => {
    if (missing.forecastPhase === "loading") sawLoading = true;
    original?.();
  };
  await missing.loadForecast();
  assert.equal(sawLoading, true);
  assert.equal(missing.forecastPhase, "unavailable");
  assert.equal(missing.prefs.forecast, undefined);
  assert.equal(missing.weather?.temperatureF, 72);
  assert.equal(missing.prefs.units, "F");
});

test("unit switch and forecast open stay on saved coordinates", async () => {
  const now = new Date("2026-09-23T18:00:00.000Z");
  let forecastCalls = 0;
  let weatherCalls = 0;
  let labelCalls = 0;
  const geo = fakeGeo({ ok: true, latitude: 1, longitude: 2 });
  const seen: Array<{ lat: number; lon: number }> = [];
  const session = new WeatherSession({
    storage: new MemoryStorage(),
    prefs: {
      ...readyPrefs(new Date(now.getTime() - 31 * 60 * 1000).toISOString()),
      units: "F",
      location: {
        mode: "manual",
        query: "Palo Alto",
        lat: 37.4419,
        lon: -122.143,
        label: "Palo Alto, California",
        labelVersion: 2,
      },
    },
    now: () => now,
    geolocation: geo.api,
    fetchWeather: async () => {
      weatherCalls += 1;
      throw new Error("should not geocode");
    },
    resolveLabel: async () => {
      labelCalls += 1;
      throw new Error("should not reverse");
    },
    fetchForecast: async (lat, lon) => {
      forecastCalls += 1;
      seen.push({ lat, lon });
      return { ok: true, forecast: sampleForecast("America/Sao_Paulo") };
    },
  });
  const forecast = session.prefs.forecast?.forecast;
  assert.ok(forecast);
  assert.equal(formatTemperature(forecast.current, "F"), "68°F");
  assert.equal(formatWindSpeed(forecast.current.windSpeedKmh, "F"), "10 mph");
  session.setUnits("C");
  assert.equal(session.prefs.units, "C");
  assert.equal(forecastCalls, 0);
  assert.equal(geo.calls(), 0);
  assert.equal(formatTemperature(forecast.current, session.prefs.units), "20°C");
  assert.equal(formatWindSpeed(forecast.current.windSpeedKmh, session.prefs.units), "16 km/h");
  const first = session.loadForecast();
  const second = session.loadForecast();
  await first;
  await second;
  assert.equal(forecastCalls, 1);
  assert.deepEqual(seen, [{ lat: 37.4419, lon: -122.143 }]);
  assert.equal(weatherCalls, 0);
  assert.equal(labelCalls, 0);
  assert.equal(geo.calls(), 0);
  assert.equal(session.prefs.forecast?.forecast.timezone, "America/Sao_Paulo");
  assert.equal(session.weather?.temperatureF, 72);
  await session.loadForecast();
  assert.equal(forecastCalls, 1);

  const url = await fetchForecastFromApi(37.4419, -122.143, async (input) => {
    assert.match(String(input), /^\/api\/weather\/forecast\?lat=37\.4419&lon=-122\.143$/);
    assert.doesNotMatch(String(input), /q=|nominatim|geocoding|location/);
    return new Response(JSON.stringify(sampleForecast()), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(url.ok, true);
});

test("Today forecast sheet stays local and coordinates-only", () => {
  const today = readFileSync(join(ROOT, "components/today/TodayWeather.tsx"), "utf8");
  const sheet = readFileSync(join(ROOT, "components/weather/WeatherDetailSheet.tsx"), "utf8");
  const icon = readFileSync(join(ROOT, "components/weather/WeatherIcon.tsx"), "utf8");
  const session = readFileSync(join(ROOT, "lib/weather/session.ts"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const provider = readFileSync(join(ROOT, "lib/state/provider.tsx"), "utf8");
  const forecastRoute = readFileSync(join(ROOT, "app/api/weather/forecast/route.ts"), "utf8");
  const loadForecast = session.slice(session.indexOf("async loadForecast"), session.indexOf("async requestDeviceLocation"));
  assert.match(today, /WeatherDetailSheet/);
  assert.match(today, /locationLabel=\{weather\.locationLabel/);
  assert.match(sheet, /title=\{locationLabel\}/);
  assert.match(sheet, /Next 12 hours/);
  assert.match(sheet, /7 days/);
  assert.match(sheet, /Feels like/);
  assert.match(sheet, /Forecast is unavailable right now|FORECAST_UNAVAILABLE/);
  assert.match(sheet, /Loading forecast/);
  assert.match(sheet, /href="\/settings#weather"/);
  assert.match(sheet, /OPEN_METEO_ATTRIBUTION_LABEL/);
  assert.doesNotMatch(sheet, /getCurrentPosition|nominatim|geocoding|no_locality|Couldn't determine the city/);
  assert.doesNotMatch(icon, /lucide|react-icons|day|night/);
  assert.match(icon, /<svg/);
  assert.doesNotMatch(loadForecast, /requestDevicePosition|resolveLabel|geocode|\/api\/weather\/location|queryFromPrefs/);
  assert.match(loadForecast, /fetchForecast\(/);
  assert.doesNotMatch(forecastRoute, /nominatim|geocoding/);
  assert.doesNotMatch(provider, /weather:/);
  assert.match(css, /\.atlas-sheet-panel \{[^}]*max-height: 100%/);
  assert.match(css, /\.atlas-sheet-panel \{[^}]*min-height: 0/);
  assert.match(css, /padding-top: calc\(12px \+ var\(--atlas-safe-top\)\)/);
  assert.match(css, /max-width: 28rem/);
  assert.match(css, /\.atlas-sheet-scroll \{[^}]*min-height: 0/);
  assert.match(css, /\.atlas-sheet-scroll \{[^}]*overflow-y: auto/);
  for (const file of ["EventSheet.tsx", "MoveSheet.tsx", "PrepareSheet.tsx", "ConfirmDeleteSheet.tsx"]) {
    assert.match(readFileSync(join(ROOT, "components/sheets", file), "utf8"), /import \{ Sheet \} from "\.\/Sheet"/);
  }
  assert.match(readFileSync(join(ROOT, "lib/assistant/capabilities.ts"), "utf8"), /id: "weather", available: false/);
  assert.match(readFileSync(join(ROOT, "lib/weather/reverseGeocode.ts"), "utf8"), /NOMINATIM_ZOOM = 14/);
  assert.match(session, /Couldn't determine the city for this location\./);
});
