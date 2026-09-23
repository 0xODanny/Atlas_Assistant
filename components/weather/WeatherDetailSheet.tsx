"use client";

import Link from "next/link";
import { Sheet } from "@/components/sheets/Sheet";
import { formatCivilDay, formatCivilHour, formatTemperature, formatWindSpeed } from "@/lib/weather/conditions";
import type { ForecastDay, WeatherForecast, WeatherUnits } from "@/lib/weather/types";
import { FORECAST_UNAVAILABLE, OPEN_METEO_ATTRIBUTION_HREF, OPEN_METEO_ATTRIBUTION_LABEL } from "@/lib/weather/types";
import type { ForecastPhase } from "@/lib/weather/session";
import { WeatherIcon } from "./WeatherIcon";

type WeatherDetailSheetProps = {
  locationLabel: string;
  units: WeatherUnits;
  forecast: WeatherForecast | null;
  phase: ForecastPhase;
  onClose: () => void;
};

export function WeatherDetailSheet({ locationLabel, units, forecast, phase, onClose }: WeatherDetailSheetProps) {
  const showForecast = Boolean(forecast);
  const today = forecast?.daily[0];

  return (
    <Sheet
      title={locationLabel}
      onClose={onClose}
      footer={
        <div className="weather-sheet-footer">
          <Link href="/settings#weather">Weather settings</Link>
          <a href={OPEN_METEO_ATTRIBUTION_HREF} rel="noreferrer">
            {OPEN_METEO_ATTRIBUTION_LABEL}
          </a>
        </div>
      }
    >
      <div data-atlas-weather-detail>
        {!showForecast && phase !== "unavailable" ? (
          <p className="weather-status" aria-live="polite" aria-busy="true">
            Loading forecast…
          </p>
        ) : null}
        {!showForecast && phase === "unavailable" ? (
          <p className="weather-status" role="alert">
            {FORECAST_UNAVAILABLE}
          </p>
        ) : null}
        {forecast && today ? (
          <>
            <p className="weather-sheet-temp">{formatTemperature(forecast.current, units)}</p>
            <p className="weather-sheet-condition">{forecast.current.condition}</p>
            <div className="weather-metrics">
              <Metric label="Feels like" value={formatTemperature(apparent(forecast), units)} />
              <Metric
                label="High / Low"
                value={`${formatTemperature(high(today), units)} / ${formatTemperature(low(today), units)}`}
              />
              <Metric label="Rain" value={rainLabel(forecast.current.precipitationProbability)} />
              <Metric label="Wind" value={formatWindSpeed(forecast.current.windSpeedKmh, units)} />
            </div>
            <p className="section-kicker">Next 12 hours</p>
            <ol className="weather-hour-strip">
              {forecast.hourly.map((hour) => (
                <li key={hour.time} className="weather-hour">
                  <span className="weather-hour-time">{formatCivilHour(hour.time)}</span>
                  <WeatherIcon condition={hour.condition} />
                  <span className="weather-hour-temp">{compactTemperature(hour, units)}</span>
                  <span className="weather-hour-rain">{rainLabel(hour.precipitationProbability)}</span>
                </li>
              ))}
            </ol>
            <p className="section-kicker">7 days</p>
            <ol className="weather-day-list">
              {forecast.daily.map((day) => (
                <li key={day.date} className="weather-day">
                  <span className="weather-day-when">{formatCivilDay(day.date)}</span>
                  <WeatherIcon condition={day.condition} />
                  <span className="weather-day-condition">{day.condition}</span>
                  <span className="weather-day-high">{compactTemperature(high(day), units)}</span>
                  <span className="weather-day-low">{compactTemperature(low(day), units)}</span>
                  <span className="weather-day-rain">{rainLabel(day.precipitationProbability)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="weather-metric-label">{label}</p>
      <p className="weather-metric-value">{value}</p>
    </div>
  );
}

function apparent(forecast: WeatherForecast) {
  return {
    temperatureC: forecast.current.apparentTemperatureC,
    temperatureF: forecast.current.apparentTemperatureF,
  };
}

function high(day: ForecastDay) {
  return { temperatureC: day.highC, temperatureF: day.highF };
}

function low(day: ForecastDay) {
  return { temperatureC: day.lowC, temperatureF: day.lowF };
}

function compactTemperature(reading: { temperatureC: number; temperatureF: number }, units: WeatherUnits): string {
  const value = units === "C" ? Math.round(reading.temperatureC) : Math.round(reading.temperatureF);
  return `${value}°`;
}

function rainLabel(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
