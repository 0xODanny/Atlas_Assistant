import { addDays, startOfZonedDay, zonedParts } from "../time";
import type { CalendarEvent } from "../types/event";

export const COMPACT_WEEK_VISIBLE = 3;

export function startOfCalendarWeek(date: Date, timezone: string): Date {
  const start = startOfZonedDay(timezone, date);
  return addDays(start, -zonedParts(timezone, start).weekday);
}

export function weekDays(date: Date, timezone: string): Date[] {
  const start = startOfCalendarWeek(date, timezone);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function visibleCompactEvents(
  events: CalendarEvent[],
  max = COMPACT_WEEK_VISIBLE,
): CalendarEvent[] {
  return events.slice(0, max);
}

export function compactOverflowCount(events: CalendarEvent[], max = COMPACT_WEEK_VISIBLE): number {
  return Math.max(0, events.length - max);
}

export function compactMoreLabel(count: number): string {
  return `+${count} more`;
}

export function dayDetailsLabel(date: Date, timezone: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(date);
  const rest = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: timezone }).format(date);
  return `Open ${weekday}, ${rest} details`;
}

export function weekdayName(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(date);
}

export function weekdayLong(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(date);
}

export function formatWeekRange(date: Date, timezone: string): string {
  const days = weekDays(date, timezone);
  const first = days[0];
  const last = days[6];
  if (!first || !last) return "";
  const start = zonedParts(timezone, first);
  const end = zonedParts(timezone, last);
  const monthStart = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: timezone }).format(first);
  const monthEnd = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: timezone }).format(last);
  if (start.year !== end.year) {
    return `${monthStart} ${start.day}, ${start.year}–${monthEnd} ${end.day}, ${end.year}`;
  }
  if (start.month !== end.month) {
    return `${monthStart} ${start.day}–${monthEnd} ${end.day}`;
  }
  return `${monthStart} ${start.day}–${end.day}`;
}
