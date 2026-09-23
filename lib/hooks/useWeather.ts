"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTemperature } from "../weather/conditions";
import { hasConfiguredLocation, preferLocationLabel } from "../weather/prefs";
import { WeatherSession, type ForecastPhase, type WeatherPhase } from "../weather/session";
import type { CurrentWeather, WeatherForecast, WeatherPrefs, WeatherUnits } from "../weather/types";

export type WeatherView = {
  ready: boolean;
  prefs: WeatherPrefs;
  weather: CurrentWeather | null;
  phase: WeatherPhase;
  error: string | null;
  placeNotice: string | null;
  locateStep: "position" | "place" | null;
  units: WeatherUnits;
  temperature: string | null;
  locationLabel: string | null;
  configured: boolean;
  forecast: WeatherForecast | null;
  forecastPhase: ForecastPhase;
  loadForecast: () => Promise<void>;
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

  const loadForecast = useCallback(async () => {
    await sessionRef.current?.loadForecast();
    sync();
  }, [sync]);

  const weather = snapshot.prefs.cache?.weather ?? null;
  const units = snapshot.prefs.units;
  const configured = hasConfiguredLocation(snapshot.prefs.location);

  return {
    ready,
    prefs: snapshot.prefs,
    weather,
    phase: snapshot.phase,
    error: snapshot.error,
    placeNotice: snapshot.placeNotice,
    locateStep: snapshot.locateStep,
    units,
    temperature: weather ? formatTemperature(weather, units) : null,
    locationLabel: configured
      ? preferLocationLabel(snapshot.prefs.location.label, weather?.locationLabel)
      : null,
    configured,
    requestDeviceLocation,
    beginCityEntry,
    cancelCityEntry,
    submitCity,
    setUnits,
    clearLocation,
    refresh,
    forecast: snapshot.prefs.forecast?.forecast ?? null,
    forecastPhase: snapshot.forecastPhase,
    loadForecast,
  };
}
