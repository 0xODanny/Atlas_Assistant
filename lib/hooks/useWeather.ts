"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTemperature } from "../weather/conditions";
import { hasConfiguredLocation } from "../weather/prefs";
import { WeatherSession, type WeatherPhase } from "../weather/session";
import type { CurrentWeather, WeatherPrefs, WeatherUnits } from "../weather/types";

export type WeatherView = {
  ready: boolean;
  prefs: WeatherPrefs;
  weather: CurrentWeather | null;
  phase: WeatherPhase;
  error: string | null;
  units: WeatherUnits;
  temperature: string | null;
  locationLabel: string | null;
  configured: boolean;
  requestDeviceLocation: () => Promise<void>;
  beginCityEntry: () => void;
  cancelCityEntry: () => void;
  submitCity: (query: string) => Promise<void>;
  setUnits: (units: WeatherUnits) => void;
  clearLocation: () => void;
  refresh: () => Promise<void>;
};

export function useWeather(): WeatherView {
  const sessionRef = useRef<WeatherSession | null>(null);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState(() => new WeatherSession({ storage: null }).state);

  const sync = useCallback(() => {
    if (!sessionRef.current) return;
    setSnapshot({ ...sessionRef.current.state });
  }, []);

  useEffect(() => {
    const session = new WeatherSession({
      onChange: () => setSnapshot({ ...session.state }),
    });
    sessionRef.current = session;
    setSnapshot({ ...session.state });
    setReady(true);
    void session.loadIfNeeded();
    return () => {
      session.onChange = null;
    };
  }, []);

  const requestDeviceLocation = useCallback(async () => {
    await sessionRef.current?.requestDeviceLocation();
    sync();
  }, [sync]);

  const beginCityEntry = useCallback(() => {
    sessionRef.current?.beginCityEntry();
    sync();
  }, [sync]);

  const cancelCityEntry = useCallback(() => {
    sessionRef.current?.cancelCityEntry();
    sync();
  }, [sync]);

  const submitCity = useCallback(
    async (query: string) => {
      await sessionRef.current?.submitCity(query);
      sync();
    },
    [sync],
  );

  const setUnits = useCallback(
    (units: WeatherUnits) => {
      sessionRef.current?.setUnits(units);
      sync();
    },
    [sync],
  );

  const clearLocation = useCallback(() => {
    sessionRef.current?.clearLocation();
    sync();
  }, [sync]);

  const refresh = useCallback(async () => {
    await sessionRef.current?.refresh();
    sync();
  }, [sync]);

  const weather = snapshot.prefs.cache?.weather ?? null;
  const units = snapshot.prefs.units;

  return {
    ready,
    prefs: snapshot.prefs,
    weather,
    phase: snapshot.phase,
    error: snapshot.error,
    units,
    temperature: weather ? formatTemperature(weather, units) : null,
    locationLabel: weather?.locationLabel ?? snapshot.prefs.location.label ?? null,
    configured: hasConfiguredLocation(snapshot.prefs.location),
    requestDeviceLocation,
    beginCityEntry,
    cancelCityEntry,
    submitCity,
    setUnits,
    clearLocation,
    refresh,
  };
}
