import { FALLBACK_LOCATION_LABEL, WEATHER_FETCH_TIMEOUT_MS, type LocationResolution } from "./types";
import { isValidLatitude, isValidLongitude } from "./service";
import type { FetchLike } from "./openMeteo";

export const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
export const NOMINATIM_USER_AGENT = "AtlasAssistant/1.0 (https://github.com/0xODanny/Atlas_Assistant; weather city labels)";
export const NOMINATIM_ZOOM = 14;

export type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  borough?: string;
  locality?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  region?: string;
  road?: string;
  house_number?: string;
  postcode?: string;
};

export type NominatimReversePayload = {
  address?: NominatimAddress;
  name?: string;
};

export type ReverseGeocodeResult = {
  ok: boolean;
  locationLabel: string;
  resolution: LocationResolution;
};

export type LocationResponseBody = {
  locationLabel: string;
  resolution: LocationResolution;
};

const LOCALITY_FIELDS = ["city", "town", "village", "municipality", "borough", "locality", "hamlet"] as const;
const REGION_FIELDS = ["state", "region"] as const;

function cleanPlacePart(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return next || undefined;
}

export function localityFromAddress(address: NominatimAddress | undefined): string | undefined {
  if (!address) return undefined;
  for (const field of LOCALITY_FIELDS) {
    const value = cleanPlacePart(address[field]);
    if (value) return value;
  }
  return undefined;
}

export function regionFromAddress(address: NominatimAddress | undefined): string | undefined {
  if (!address) return undefined;
  for (const field of REGION_FIELDS) {
    const value = cleanPlacePart(address[field]);
    if (value) return value;
  }
  return undefined;
}

export function formatCityRegionLabel(locality?: string, region?: string): string | undefined {
  const city = cleanPlacePart(locality);
  if (!city) return undefined;
  const admin = cleanPlacePart(region);
  return admin ? `${city}, ${admin}` : city;
}

export function labelFromNominatim(payload: NominatimReversePayload | null | undefined): string {
  const locality = localityFromAddress(payload?.address);
  const region = regionFromAddress(payload?.address);
  return formatCityRegionLabel(locality, region) ?? FALLBACK_LOCATION_LABEL;
}

export function nominatimReverseUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
    zoom: String(NOMINATIM_ZOOM),
    "accept-language": "en",
  });
  return `${NOMINATIM_REVERSE_URL}?${params.toString()}`;
}

function unresolved(resolution: Exclude<LocationResolution, "ok">): ReverseGeocodeResult {
  return { ok: false, locationLabel: FALLBACK_LOCATION_LABEL, resolution };
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "AbortError") return true;
  const message = "message" in error ? String(error.message) : "";
  return /aborted|timeout/i.test(message);
}

function isAddressRecord(value: unknown): value is NominatimAddress {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function nominatimPayloadFromJson(value: unknown): NominatimReversePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = (value as { address?: unknown }).address;
  if (!isAddressRecord(address)) return null;
  return { address };
}

export async function reverseGeocodeCity(
  latitude: number,
  longitude: number,
  fetchFn?: FetchLike,
): Promise<ReverseGeocodeResult> {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return unresolved("invalid_response");
  }
  const fetchImpl = fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(nominatimReverseUrl(latitude, longitude), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
      },
    });
    if (response.status === 429) return unresolved("rate_limited");
    if (!response.ok) return unresolved("provider_error");
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return unresolved("invalid_response");
    }
    const payload = nominatimPayloadFromJson(parsed);
    if (!payload) return unresolved("invalid_response");
    const locationLabel = labelFromNominatim(payload);
    if (locationLabel === FALLBACK_LOCATION_LABEL) return unresolved("no_locality");
    return { ok: true, locationLabel, resolution: "ok" };
  } catch (error) {
    return unresolved(isAbortError(error) ? "timeout" : "provider_error");
  } finally {
    clearTimeout(timer);
  }
}

export function locationResponseBody(result: ReverseGeocodeResult): LocationResponseBody {
  return { locationLabel: result.locationLabel, resolution: result.resolution };
}

export async function handleLocationRequest(
  request: Request,
): Promise<{ status: number; body: LocationResponseBody | { error: string } }> {
  const params = new URL(request.url).searchParams;
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const latitude = Number(latRaw);
  const longitude = Number(lonRaw);
  if (latRaw === null || lonRaw === null || !isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return { status: 400, body: { error: "Enter a valid latitude and longitude." } };
  }
  const result = await reverseGeocodeCity(latitude, longitude);
  return { status: 200, body: locationResponseBody(result) };
}
