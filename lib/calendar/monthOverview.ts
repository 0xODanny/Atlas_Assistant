import type { CalendarEvent } from "../types/event";
import { addDays, startOfZonedDay, zonedLocalToUtc, zonedParts } from "../time";
import { dayEventsFor } from "./dayAgenda";

export function startOfCalendarMonth(date: Date, timezone: string): Date {
  const parts = zonedParts(timezone, date);
  return zonedLocalToUtc(timezone, parts.year, parts.month, 1, 12, 0);
}

export function monthGridDays(date: Date, timezone: string): Date[] {
  const start = startOfZonedDay(timezone, startOfCalendarMonth(date, timezone));
  const gridStart = addDays(start, -zonedParts(timezone, start).weekday);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function sameZonedMonth(left: Date, right: Date, timezone: string): boolean {
  const a = zonedParts(timezone, left);
  const b = zonedParts(timezone, right);
  return a.year === b.year && a.month === b.month;
}

export function monthDayEvents(events: CalendarEvent[], date: Date, timezone: string): CalendarEvent[] {
  return dayEventsFor(events, date, timezone);
}

export function compactMonthTitles(events: CalendarEvent[], max = 2): CalendarEvent[] {
  return events.slice(0, max);
}
