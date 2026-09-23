import { celsiusToFahrenheit, conditionFromWmo } from "./conditions";
import { detailedForecastUrl, fetchJsonWithTimeout, type FetchLike, type OpenMeteoForecastPayload } from "./openMeteo";
import { isValidLatitude, isValidLongitude } from "./service";
import type { ForecastDay, ForecastHour, WeatherForecast } from "./types";
import { FORECAST_UNAVAILABLE } from "./types";

const CIVIL_HOUR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ForecastFailure = {
  ok: false;
  message: string;
  status: number;
};

export type ForecastSuccess = {
  ok: true;
  forecast: WeatherForecast;
};

export type ForecastResult = ForecastSuccess | ForecastFailure;

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function probability(value: unknown): number | null {
  const number = finite(value);
  if (number === null) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function temperatures(celsius: number): { temperatureC: number; temperatureF: number } {
  return { temperatureC: celsius, temperatureF: celsiusToFahrenheit(celsius) };
}

export function normalizeForecast(payload: OpenMeteoForecastPayload): WeatherForecast | null {
  const timezone = payload.timezone?.trim();
  const current = payload.current;
  const hourly = payload.hourly;
  const daily = payload.daily;
  if (!timezone || !current || !hourly || !daily) return null;
  const temperatureC = finite(current.temperature_2m);
  const apparentC = finite(current.apparent_temperature);
  const weatherCode = finite(current.weather_code);
  const windSpeedKmh = finite(current.wind_speed_10m);
  const times = hourly.time ?? [];
  const hourTemps = hourly.temperature_2m ?? [];
  const hourCodes = hourly.weather_code ?? [];
  const hourPrecip = hourly.precipitation_probability ?? [];
  const dates = daily.time ?? [];
  const dayCodes = daily.weather_code ?? [];
  const highs = daily.temperature_2m_max ?? [];
  const lows = daily.temperature_2m_min ?? [];
  const dayPrecip = daily.precipitation_probability_max ?? [];
  if (
    temperatureC === null ||
    apparentC === null ||
    weatherCode === null ||
    windSpeedKmh === null ||
    times.length < 12 ||
    dates.length < 7
  ) {
    return null;
  }

  const hours: ForecastHour[] = [];
  for (let index = 0; index < 12; index += 1) {
    const time = times[index];
    const hourC = finite(hourTemps[index]);
    const code = finite(hourCodes[index]);
    if (!time || !CIVIL_HOUR.test(time) || hourC === null || code === null) return null;
    const temps = temperatures(hourC);
    hours.push({
      time,
      temperatureC: temps.temperatureC,
      temperatureF: temps.temperatureF,
      condition: conditionFromWmo(code),
      weatherCode: Math.round(code),
      precipitationProbability: probability(hourPrecip[index]),
    });
  }

  const days: ForecastDay[] = [];
  for (let index = 0; index < 7; index += 1) {
    const date = dates[index];
    const code = finite(dayCodes[index]);
    const highC = finite(highs[index]);
    const lowC = finite(lows[index]);
    if (!date || !CIVIL_DATE.test(date) || code === null || highC === null || lowC === null) return null;
    days.push({
      date,
      condition: conditionFromWmo(code),
      weatherCode: Math.round(code),
      highC,
      highF: celsiusToFahrenheit(highC),
      lowC,
      lowF: celsiusToFahrenheit(lowC),
      precipitationProbability: probability(dayPrecip[index]),
    });
  }

  const currentTemps = temperatures(temperatureC);
  const feels = temperatures(apparentC);
  return {
    timezone,
    current: {
      temperatureC: currentTemps.temperatureC,
      temperatureF: currentTemps.temperatureF,
      apparentTemperatureC: feels.temperatureC,
      apparentTemperatureF: feels.temperatureF,
      condition: conditionFromWmo(weatherCode),
      weatherCode: Math.round(weatherCode),
      precipitationProbability: hours[0]?.precipitationProbability ?? null,
      windSpeedKmh,
    },
    hourly: hours,
    daily: days,
  };
}

export function parseWeatherForecast(raw: unknown): WeatherForecast | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as WeatherForecast;
  if (!value.timezone?.trim() || !value.current || !Array.isArray(value.hourly) || !Array.isArray(value.daily)) return null;
  if (value.hourly.length !== 12 || value.daily.length !== 7) return null;
  return normalizeForecast({
    timezone: value.timezone,
    current: {
      temperature_2m: value.current.temperatureC,
      apparent_temperature: value.current.apparentTemperatureC,
      weather_code: value.current.weatherCode,
      wind_speed_10m: value.current.windSpeedKmh,
    },
    hourly: {
      time: value.hourly.map((hour) => hour.time),
      temperature_2m: value.hourly.map((hour) => hour.temperatureC),
      weather_code: value.hourly.map((hour) => hour.weatherCode),
      precipitation_probability: value.hourly.map((hour) => hour.precipitationProbability),
    },
    daily: {
      time: value.daily.map((day) => day.date),
      weather_code: value.daily.map((day) => day.weatherCode),
      temperature_2m_max: value.daily.map((day) => day.highC),
      temperature_2m_min: value.daily.map((day) => day.lowC),
      precipitation_probability_max: value.daily.map((day) => day.precipitationProbability),
    },
  });
}

export async function getWeatherForecast(
  latitude: number,
  longitude: number,
  fetchFn?: FetchLike,
): Promise<ForecastResult> {
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return { ok: false, message: "Enter a valid latitude and longitude.", status: 400 };
  }
  const response = await fetchJsonWithTimeout<OpenMeteoForecastPayload>(detailedForecastUrl(latitude, longitude), { fetchFn });
  if (!response.ok) {
    return response.reason === "timeout"
      ? { ok: false, message: "Weather is taking too long. Try again.", status: 504 }
      : { ok: false, message: FORECAST_UNAVAILABLE, status: 502 };
  }
  const forecast = normalizeForecast(response.data);
  if (!forecast) return { ok: false, message: FORECAST_UNAVAILABLE, status: 502 };
  return { ok: true, forecast };
}

export async function handleForecastRequest(request: Request): Promise<{ status: number; body: unknown }> {
  const params = new URL(request.url).searchParams;
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon");
  const latitude = Number(latRaw);
  const longitude = Number(lonRaw);
  if (latRaw === null || lonRaw === null || !isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return { status: 400, body: { error: "Enter a valid latitude and longitude." } };
  }
  const result = await getWeatherForecast(latitude, longitude);
  if (!result.ok) return { status: result.status, body: { error: result.message } };
  return { status: 200, body: result.forecast };
}
