import type { GeoResult } from "./types";

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60 * 1000,
};

export type DeviceGeolocation = {
  getCurrentPosition: (
    success: (position: GeolocationPosition) => void,
    error?: (error: GeolocationPositionError) => void,
    options?: PositionOptions,
  ) => void;
};

export function requestDevicePosition(
  geolocation?: DeviceGeolocation | null,
  options: PositionOptions = GEOLOCATION_OPTIONS,
): Promise<GeoResult> {
  const geo = geolocation ?? (typeof navigator === "undefined" ? null : navigator.geolocation);
  if (!geo?.getCurrentPosition) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: GeoResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: "timeout" }),
      (options.timeout ?? 10_000) + 1_000,
    );
    geo.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        finish({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        clearTimeout(timer);
        if (error.code === 1) finish({ ok: false, reason: "denied" });
        else if (error.code === 3) finish({ ok: false, reason: "timeout" });
        else finish({ ok: false, reason: "unavailable" });
      },
      options,
    );
  });
}
