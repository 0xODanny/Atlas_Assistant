const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  56: "Drizzle",
  57: "Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Rain",
  66: "Rain",
  67: "Rain",
  71: "Snow",
  73: "Snow",
  75: "Snow",
  77: "Snow",
  80: "Showers",
  81: "Showers",
  82: "Showers",
  85: "Showers",
  86: "Showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

export function conditionFromWmo(code: number): string {
  if (!Number.isFinite(code)) return "Cloudy";
  return WMO_CONDITIONS[Math.round(code)] ?? "Cloudy";
}

export function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

export function formatTemperature(weather: { temperatureC: number; temperatureF: number }, units: "F" | "C"): string {
  const value = units === "C" ? Math.round(weather.temperatureC) : Math.round(weather.temperatureF);
  return `${value}°${units}`;
}
