import type { WeatherSnapshot } from "../types/assistant";

export interface WeatherProvider {
  getForecast(date: string): Promise<WeatherSnapshot | null>;
}

export class UnavailableWeatherProvider implements WeatherProvider {
  async getForecast(date: string): Promise<WeatherSnapshot | null> {
    return {
      date,
      condition: "unavailable",
      precipitationChance: 0,
      source: "none",
    };
  }
}
