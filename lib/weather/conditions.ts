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

export function formatWindSpeed(windSpeedKmh: number, units: "F" | "C"): string {
  if (units === "F") return `${Math.round(windSpeedKmh * 0.621371)} mph`;
  return `${Math.round(windSpeedKmh)} km/h`;
}

export function formatCivilHour(time: string): string {
  const hour = Number(time.slice(11, 13));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || time.charAt(10) !== "T") return time;
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 || 12;
  return `${hour12} ${suffix}`;
}

export function formatCivilDay(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(utc);
  return `${weekday} ${Number(match[3])}`;
}
