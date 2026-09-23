"use client";

import { useState } from "react";
import { useWeather } from "@/lib/hooks/useWeather";
import { OPEN_METEO_ATTRIBUTION_HREF, OPEN_METEO_ATTRIBUTION_LABEL } from "@/lib/weather/types";
import { WeatherCityForm } from "../weather/WeatherCityForm";
import { WeatherDetailSheet } from "../weather/WeatherDetailSheet";

export function TodayWeather() {
  const weather = useWeather();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!weather.ready) {
    return <div className="today-weather" data-atlas-weather />;
  }

  return (
    <div className="today-weather" data-atlas-weather>
      {weather.phase === "unconfigured" ? (
        <button type="button" className="today-weather-add" onClick={() => void weather.requestDeviceLocation()}>
          Add weather
        </button>
      ) : null}

      {weather.phase === "locating" ? (
        <div className="today-weather-setup">
          <p className="weather-status" aria-live="polite">
            {weather.locateStep === "place" ? "Finding place name…" : "Getting location…"}
          </p>
          <button type="button" className="today-weather-add" onClick={weather.beginCityEntry}>
            Enter a city
          </button>
        </div>
      ) : null}

      {weather.phase === "loading" ? (
        <p className="weather-status" aria-live="polite" aria-busy="true">
          Updating weather…
        </p>
      ) : null}

      {weather.phase === "city" ? (
        <div className="today-weather-setup">
          {weather.error ? <p className="weather-status">{weather.error}</p> : null}
          <p className="weather-status">Enter a city</p>
          <WeatherCityForm
            id="today-weather-city"
            pending={false}
            onSubmit={weather.submitCity}
            onCancel={weather.configured ? weather.cancelCityEntry : undefined}
          />
        </div>
      ) : null}

      {weather.phase === "error" ? (
        <div className="today-weather-setup">
          <p className="weather-status" role="alert">
            {weather.error ?? "Weather is unavailable right now."}
          </p>
          <button type="button" className="today-weather-add" onClick={weather.beginCityEntry}>
            Enter a city
          </button>
        </div>
      ) : null}

      {weather.phase === "ready" && weather.weather && weather.temperature ? (
        <button
          type="button"
          className="today-weather-ready"
          onClick={() => {
            setSheetOpen(true);
            void weather.loadForecast();
          }}
        >
          <p className="today-weather-line">
            {weather.temperature} · {weather.weather.condition}
          </p>
          <p className="today-weather-place">{weather.locationLabel}</p>
        </button>
      ) : null}
      {weather.placeNotice && weather.phase !== "locating" && weather.phase !== "city" ? (
        <p className="weather-status" role="status">
          {weather.placeNotice}
        </p>
      ) : null}

      <a className="sr-only" href={OPEN_METEO_ATTRIBUTION_HREF}>
        {OPEN_METEO_ATTRIBUTION_LABEL}
      </a>
      {sheetOpen && weather.phase === "ready" ? (
        <WeatherDetailSheet
          locationLabel={weather.locationLabel ?? "Current location"}
          units={weather.units}
          forecast={weather.forecast}
          phase={weather.forecastPhase}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </div>
  );
}
