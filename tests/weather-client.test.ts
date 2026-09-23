import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { currentCapabilities, capabilityCopy } from "../lib/assistant/capabilities";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { createSeedState } from "../lib/data/seed";
import { GEOLOCATION_OPTIONS, requestDevicePosition } from "../lib/weather/geolocation";
import { readWeatherPrefs, writeWeatherPrefs } from "../lib/weather/prefs";
import { WeatherSession } from "../lib/weather/session";
import {
  OPEN_METEO_ATTRIBUTION_HREF,
  OPEN_METEO_ATTRIBUTION_LABEL,
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
    fetchWeather: async (query) => {
      assert.equal(query.kind, "coords");
      if (query.kind !== "coords") throw new Error("expected coords");
      assert.equal(query.latitude, 37.7749);
      assert.equal(query.longitude, -122.4194);
      return { ok: true, weather: SF };
    },
  });
  await session.requestDeviceLocation();
  assert.equal(session.geoRequests, 1);
  assert.equal(geo.calls(), 1);
  assert.equal(session.state.phase, "ready");
  assert.equal(session.prefs.location.mode, "coords");
  assert.equal(session.prefs.location.lat, 37.7749);
  assert.equal(session.weather?.condition, "Clear");
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
      location: { mode: "coords", lat: 37.7749, lon: -122.4194, label: "San Francisco, California" },
    },
    storage,
  );
  let fetches = 0;
  const session = new WeatherSession({
    storage,
    geolocation: geo.api,
    now: () => new Date("2026-09-22T18:00:00.000Z"),
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
  assert.equal(session.state.phase, "ready");
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
    "app/api/weather/route.ts",
  ].map((file) => readFileSync(join(ROOT, file), "utf8"));

  assert.match(todayView, /<TodayWeather \/>/);
  assert.match(todayView, /data-atlas-greeting[\s\S]*<TodayWeather \/>[\s\S]*subtitle/);
  assert.match(today, /settings#weather/);
  assert.doesNotMatch(today, /getCurrentPosition/);
  assert.match(today, /aria-live="polite"/);
  assert.match(settings, /aria-pressed=\{weather\.units === "F"\}/);
  const types = readFileSync(join(ROOT, "lib/weather/types.ts"), "utf8");
  assert.match(types, /Weather data by Open-Meteo.com/);
  assert.match(types, /https:\/\/open-meteo.com\//);
  assert.match(settings, /OPEN_METEO_ATTRIBUTION_LABEL/);
  assert.match(settings, /OPEN_METEO_ATTRIBUTION_HREF/);
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
});
