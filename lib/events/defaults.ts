import { addDays, addMinutes, zonedLocalToUtc, zonedParts } from "../time";

export const DEFAULT_EVENT_MINUTES = 60;

export function roundUpToNextHalfHour(date: Date, timeZone: string): Date {
  const parts = zonedParts(timeZone, date);
  if (parts.minute === 0 || parts.minute === 30) {
    return zonedLocalToUtc(timeZone, parts.year, parts.month, parts.day, parts.hour, parts.minute);
  }

  if (parts.minute < 30) {
    return zonedLocalToUtc(timeZone, parts.year, parts.month, parts.day, parts.hour, 30);
  }

  if (parts.hour === 23) {
    const nextDay = addDays(zonedLocalToUtc(timeZone, parts.year, parts.month, parts.day, 0, 0), 1);
    const next = zonedParts(timeZone, nextDay);
    return zonedLocalToUtc(timeZone, next.year, next.month, next.day, 0, 0);
  }

  return zonedLocalToUtc(timeZone, parts.year, parts.month, parts.day, parts.hour + 1, 0);
}

export function defaultEventTimes(
  now: Date,
  timeZone: string,
  selectedStart?: Date,
): { start: Date; end: Date } {
  const start = selectedStart ?? roundUpToNextHalfHour(now, timeZone);
  return {
    start,
    end: addMinutes(start, DEFAULT_EVENT_MINUTES),
  };
}
