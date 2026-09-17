import { addDays, addMinutes, zonedLocalToUtc, zonedParts } from "../time";

export const SCHEDULE_INCREMENT_MINUTES = 15;

export function snapZonedDate(
  date: Date,
  timezone: string,
  incrementMinutes = SCHEDULE_INCREMENT_MINUTES,
): Date {
  const parts = zonedParts(timezone, date);
  const total = parts.hour * 60 + parts.minute;
  const snapped = Math.ceil(total / incrementMinutes) * incrementMinutes;
  if (snapped >= 24 * 60) {
    return addDays(zonedLocalToUtc(timezone, parts.year, parts.month, parts.day, 0, 0), 1);
  }
  return zonedLocalToUtc(
    timezone,
    parts.year,
    parts.month,
    parts.day,
    Math.floor(snapped / 60),
    snapped % 60,
  );
}

export function firstSnappedSlot(
  windowStartIso: string,
  windowEndIso: string,
  durationMinutes: number,
  timezone: string,
): { start: string; end: string } | undefined {
  const windowEnd = new Date(windowEndIso).getTime();
  let start = snapZonedDate(new Date(windowStartIso), timezone);
  const endLimit = 12;
  for (let i = 0; i < endLimit; i += 1) {
    const end = addMinutes(start, durationMinutes);
    if (end.getTime() <= windowEnd) {
      return { start: start.toISOString(), end: end.toISOString() };
    }
    start = addMinutes(start, SCHEDULE_INCREMENT_MINUTES);
  }
  return undefined;
}
