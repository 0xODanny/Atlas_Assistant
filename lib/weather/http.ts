import { getCurrentWeather, parseWeatherSearchParams } from "./service";
import type { CurrentWeather, WeatherFailure, WeatherQuery } from "./types";

export function publicWeather(weather: CurrentWeather): CurrentWeather {
  return {
    locationLabel: weather.locationLabel,
    latitude: weather.latitude,
    longitude: weather.longitude,
    temperatureC: weather.temperatureC,
    temperatureF: weather.temperatureF,
    condition: weather.condition,
    weatherCode: weather.weatherCode,
    observedAt: weather.observedAt,
  };
}

export function isWeatherQuery(value: WeatherQuery | WeatherFailure): value is WeatherQuery {
  return "kind" in value;
}

export async function handleWeatherRequest(request: Request): Promise<{ status: number; body: unknown }> {
  const parsed = parseWeatherSearchParams(new URL(request.url).searchParams);
  if (!isWeatherQuery(parsed)) {
    return { status: parsed.status, body: { error: parsed.message } };
  }
  const result = await getCurrentWeather(parsed);
  if (!result.ok) {
    return { status: result.status, body: { error: result.message } };
  }
  return { status: 200, body: publicWeather(result.weather) };
}
