import { requestDevicePosition, type DeviceGeolocation } from "./geolocation";
import {
  applyLabelResolution,
  applyWeatherFailure,
  applyWeatherSuccess,
  clearWeatherLocation,
  hasConfiguredLocation,
  isUsefulLocationLabel,
  needsLabelRecovery,
  parseCurrentWeather,
  readWeatherPrefs,
  shouldFetchWeather,
  withUnits,
  writeWeatherPrefs,
  type WeatherStorage,
} from "./prefs";
import type { CurrentWeather, GeoFailureReason, WeatherPrefs, WeatherQuery, WeatherResult, WeatherUnits } from "./types";
import { LOCATION_LABEL_VERSION } from "./types";

export type WeatherPhase = "unconfigured" | "locating" | "city" | "loading" | "ready" | "error";

export type WeatherClientFetch = (query: WeatherQuery) => Promise<WeatherResult>;

export type LocationLabelResult = { ok: true; locationLabel: string } | { ok: false };

export type LocationLabelFetch = (latitude: number, longitude: number) => Promise<LocationLabelResult>;

export type WeatherSessionState = {
  prefs: WeatherPrefs;
  phase: WeatherPhase;
  error: string | null;
  geoRequests: number;
};

function queryFromPrefs(prefs: WeatherPrefs): WeatherQuery | null {
  const { location } = prefs;
  if (location.mode === "manual" && location.query) return { kind: "city", q: location.query };
  if (
    (location.mode === "coords" || location.mode === "manual") &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lon)
  ) {
    return { kind: "coords", latitude: Number(location.lat), longitude: Number(location.lon) };
  }
  return null;
}

function phaseFor(prefs: WeatherPrefs, overlay: WeatherPhase | null, error: string | null): WeatherPhase {
  if (overlay) return overlay;
  if (error && !prefs.cache?.weather) return "error";
  if (prefs.cache?.weather && hasConfiguredLocation(prefs.location)) return "ready";
  if (hasConfiguredLocation(prefs.location)) return "loading";
  return "unconfigured";
}

export class WeatherSession {
  prefs: WeatherPrefs;
  error: string | null = null;
  geoRequests = 0;
  labelLookups = 0;
  private locationRequestId = 0;
  private labelLookupInFlight = false;
  private overlay: WeatherPhase | null = null;
  private readonly storage: WeatherStorage | null;
  private readonly fetchWeather: WeatherClientFetch;
  private readonly resolveLabel: LocationLabelFetch;
  private readonly geolocation: DeviceGeolocation | null | undefined;
  private readonly now: () => Date;
  onChange: (() => void) | null = null;

  constructor(options: {
    storage?: WeatherStorage | null;
    fetchWeather?: WeatherClientFetch;
    resolveLabel?: LocationLabelFetch;
    geolocation?: DeviceGeolocation | null;
    now?: () => Date;
    prefs?: WeatherPrefs;
    onChange?: () => void;
  } = {}) {
    this.storage = options.storage ?? (typeof window === "undefined" ? null : window.localStorage);
    this.fetchWeather = options.fetchWeather ?? fetchWeatherFromApi;
    this.resolveLabel = options.resolveLabel ?? fetchLocationLabelFromApi;
    this.geolocation = options.geolocation;
    this.now = options.now ?? (() => new Date());
    this.prefs = options.prefs ?? readWeatherPrefs(this.storage);
    this.onChange = options.onChange ?? null;
  }

  private notify() {
    this.onChange?.();
  }

  get state(): WeatherSessionState {
    return {
      prefs: this.prefs,
      phase: phaseFor(this.prefs, this.overlay, this.error),
      error: this.error,
      geoRequests: this.geoRequests,
    };
  }

  get weather(): CurrentWeather | null {
    return this.prefs.cache?.weather ?? null;
  }

  commit(next: WeatherPrefs) {
    this.prefs = writeWeatherPrefs(next, this.storage);
    this.notify();
    return this.state;
  }

  async recoverLabelIfNeeded() {
    if (!needsLabelRecovery(this.prefs.location) || this.labelLookupInFlight) return this.state;
    const lat = Number(this.prefs.location.lat);
    const lon = Number(this.prefs.location.lon);
    this.labelLookupInFlight = true;
    this.labelLookups += 1;
    try {
      const resolved = await this.resolveLabel(lat, lon);
      this.commit(applyLabelResolution(this.prefs, resolved));
    } finally {
      this.labelLookupInFlight = false;
    }
    return this.state;
  }

  async loadIfNeeded() {
    await this.recoverLabelIfNeeded();
    if (!shouldFetchWeather(this.prefs, this.now())) return this.state;
    return this.refresh();
  }

  async refresh() {
    const query = queryFromPrefs(this.prefs);
    if (!query) return this.state;
    this.overlay = this.weather ? null : "loading";
    this.notify();
    const result = await this.fetchWeather(query);
    if (result.ok) {
      this.error = null;
      this.overlay = null;
      return this.commit(applyWeatherSuccess(this.prefs, result.weather, this.now()));
    }
    this.error = result.message;
    this.overlay = this.weather ? null : "error";
    return this.commit(applyWeatherFailure(this.prefs));
  }

  async requestDeviceLocation() {
    this.geoRequests += 1;
    this.locationRequestId += 1;
    const requestId = this.locationRequestId;
    this.overlay = "locating";
    this.error = null;
    this.notify();
    const position = await requestDevicePosition(this.geolocation);
    if (requestId !== this.locationRequestId) return this.state;
    if (!position.ok) {
      this.overlay = "city";
      this.error = geoErrorMessage(position.reason);
      this.notify();
      return this.state;
    }
    this.overlay = this.weather ? null : "loading";
    this.labelLookups += 1;
    const resolved = await this.resolveLabel(position.latitude, position.longitude);
    if (requestId !== this.locationRequestId) return this.state;
    this.commit(
      applyLabelResolution(this.prefs, resolved, {
        lat: position.latitude,
        lon: position.longitude,
      }),
    );
    return this.refresh();
  }

  beginCityEntry() {
    this.locationRequestId += 1;
    this.overlay = "city";
    this.notify();
    return this.state;
  }

  cancelCityEntry() {
    this.overlay = null;
    if (!hasConfiguredLocation(this.prefs.location)) this.error = null;
    this.notify();
    return this.state;
  }

  async submitCity(rawQuery: string) {
    this.overlay = "loading";
    this.error = null;
    this.notify();
    const result = await this.fetchWeather({ kind: "city", q: rawQuery });
    if (!result.ok) {
      this.error = result.message;
      this.overlay = "city";
      this.notify();
      return this.state;
    }
    this.overlay = null;
    return this.commit(
      applyWeatherSuccess(
        {
          ...this.prefs,
          location: {
            mode: "manual",
            query: rawQuery.trim(),
            label: result.weather.locationLabel,
            lat: result.weather.latitude,
            lon: result.weather.longitude,
            labelState: isUsefulLocationLabel(result.weather.locationLabel) ? "resolved" : undefined,
            labelVersion: LOCATION_LABEL_VERSION,
          },
        },
        result.weather,
        this.now(),
      ),
    );
  }

  setUnits(units: WeatherUnits) {
    this.commit(withUnits(this.prefs, units));
    return this.state;
  }

  clearLocation() {
    this.error = null;
    this.overlay = null;
    return this.commit(clearWeatherLocation(this.prefs));
  }
}

export function geoErrorMessage(reason: GeoFailureReason): string {
  if (reason === "denied") return "Location permission was denied.";
  if (reason === "timeout") return "Location timed out.";
  if (reason === "unsupported") return "This device cannot share location.";
  return "Location is unavailable.";
}

export async function fetchLocationLabelFromApi(
  latitude: number,
  longitude: number,
  fetchFn: typeof fetch = fetch,
): Promise<LocationLabelResult> {
  try {
    const response = await fetchFn(
      `/api/weather/location?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
      { headers: { Accept: "application/json" } },
    );
    const payload = (await response.json()) as { locationLabel?: string };
    if (!response.ok || !isUsefulLocationLabel(payload.locationLabel)) return { ok: false };
    return { ok: true, locationLabel: payload.locationLabel!.trim() };
  } catch {
    return { ok: false };
  }
}

export async function fetchWeatherFromApi(query: WeatherQuery, fetchFn: typeof fetch = fetch): Promise<WeatherResult> {
  const url =
    query.kind === "coords"
      ? `/api/weather?lat=${encodeURIComponent(String(query.latitude))}&lon=${encodeURIComponent(String(query.longitude))}`
      : `/api/weather?q=${encodeURIComponent(query.q)}`;
  try {
    const response = await fetchFn(url, { headers: { Accept: "application/json" } });
    const payload = (await response.json()) as { error?: string } & Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 404 ? "city_not_found" : response.status === 504 ? "timeout" : "upstream",
        message: typeof payload.error === "string" ? payload.error : "Weather is unavailable right now.",
        status: response.status,
      };
    }
    const weather = parseCurrentWeather(payload);
    if (!weather) {
      return { ok: false, error: "upstream", message: "Weather is unavailable right now.", status: 502 };
    }
    return { ok: true, weather };
  } catch {
    return { ok: false, error: "upstream", message: "Weather is unavailable right now.", status: 502 };
  }
}
