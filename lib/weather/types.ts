export type WeatherUnits = "F" | "C";

export type WeatherLocationMode = "coords" | "manual" | "unset";

export type CurrentWeather = {
  locationLabel: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  temperatureF: number;
  condition: string;
  weatherCode: number;
  observedAt: string;
};

export type WeatherLabelState = "resolved" | "fallback";

export type WeatherLocation = {
  mode: WeatherLocationMode;
  label?: string;
  query?: string;
  lat?: number;
  lon?: number;
  labelState?: WeatherLabelState;
  labelVersion?: number;
};

export type WeatherCache = {
  weather: CurrentWeather;
  fetchedAt: string;
};

export type WeatherPrefs = {
  v: 1;
  units: WeatherUnits;
  location: WeatherLocation;
  cache?: WeatherCache;
};

export type WeatherQuery =
  | { kind: "coords"; latitude: number; longitude: number }
  | { kind: "city"; q: string };

export type WeatherErrorCode =
  | "invalid_coordinates"
  | "missing_location"
  | "invalid_query"
  | "city_not_found"
  | "upstream"
  | "timeout";

export type WeatherFailure = {
  ok: false;
  error: WeatherErrorCode;
  message: string;
  status: number;
};

export type WeatherSuccess = {
  ok: true;
  weather: CurrentWeather;
};

export type WeatherResult = WeatherSuccess | WeatherFailure;

export type LocationResolution =
  | "ok"
  | "no_locality"
  | "provider_error"
  | "rate_limited"
  | "timeout"
  | "invalid_response";

export type GeoFailureReason = "denied" | "unavailable" | "unsupported" | "timeout";

export type GeoResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: GeoFailureReason };

export const WEATHER_STORAGE_KEY = "atlas.weather.v1";
export const WEATHER_CACHE_MS = 12 * 60 * 1000;
export const WEATHER_FETCH_TIMEOUT_MS = 8_000;
export const WEATHER_MAX_QUERY_LENGTH = 80;
export const OPEN_METEO_ATTRIBUTION_HREF = "https://open-meteo.com/";
export const OPEN_METEO_ATTRIBUTION_LABEL = "Weather data by Open-Meteo.com";
export const OSM_ATTRIBUTION_HREF = "https://www.openstreetmap.org/copyright";
export const OSM_ATTRIBUTION_LABEL = "© OpenStreetMap contributors";
export const FALLBACK_LOCATION_LABEL = "Current location";
export const LOCATION_LABEL_VERSION = 2;
