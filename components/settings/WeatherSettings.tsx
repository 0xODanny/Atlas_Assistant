"use client";

import { useWeather } from "@/lib/hooks/useWeather";
import { OPEN_METEO_ATTRIBUTION_HREF, OPEN_METEO_ATTRIBUTION_LABEL } from "@/lib/weather/types";
import { SettingRow } from "../ui/SettingRow";
import { WeatherCityForm } from "../weather/WeatherCityForm";

export function WeatherSettings() {
  const weather = useWeather();

  return (
    <section id="weather" className="settings-section">
      <h2 className="settings-heading">Weather</h2>
      <SettingRow
        label="Temperature"
        control={
          <div className="weather-units" role="group" aria-label="Temperature">
            <button
              type="button"
              className="btn-quiet"
              aria-pressed={weather.units === "F"}
              onClick={() => weather.setUnits("F")}
            >
              °F
            </button>
            <button
              type="button"
              className="btn-quiet"
              aria-pressed={weather.units === "C"}
              onClick={() => weather.setUnits("C")}
            >
              °C
            </button>
          </div>
        }
      />
      <SettingRow label="Location" value={weather.locationLabel ?? "Not configured"} />
      {weather.phase === "locating" ? (
        <p className="weather-status" aria-live="polite">
          Getting location…
        </p>
      ) : null}
      {weather.phase === "city" ? (
        <WeatherCityForm
          id="settings-weather-city"
          error={weather.error}
          onSubmit={weather.submitCity}
          onCancel={weather.cancelCityEntry}
        />
      ) : (
        <div className="weather-settings-actions">
          <button type="button" className="btn-quiet" onClick={weather.beginCityEntry}>
            Change location
          </button>
          <button type="button" className="btn-quiet" onClick={() => void weather.requestDeviceLocation()}>
            Use my location
          </button>
          {weather.configured ? (
            <button type="button" className="btn-quiet" onClick={weather.clearLocation}>
              Clear weather location
            </button>
          ) : null}
        </div>
      )}
      <p className="setting-note weather-attribution">
        <a href={OPEN_METEO_ATTRIBUTION_HREF} rel="noreferrer">
          {OPEN_METEO_ATTRIBUTION_LABEL}
        </a>
      </p>
    </section>
  );
}
