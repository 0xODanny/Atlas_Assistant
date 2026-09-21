import { addDays, minutesBetween, startOfZonedDay, zonedParts } from "../time";
import type { CalendarEvent } from "../types/event";
import { splitAllDay } from "./dayEvents";

export const DEFAULT_GRID_START_HOUR = 7;
export const DEFAULT_GRID_END_HOUR = 22;
export const HOUR_HEIGHT_PX = 52;

export type LaidOutEvent = {
  event: CalendarEvent;
  top: number;
  height: number;
  column: number;
  columns: number;
};

export function minutesFromDayStart(date: Date, timezone: string, day: Date): number {
  const start = startOfZonedDay(timezone, day);
  return minutesBetween(start, date);
}

export function visibleHourRange(
  events: CalendarEvent[],
  timezone: string,
  day: Date,
  now?: Date,
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_GRID_START_HOUR;
  let endHour = DEFAULT_GRID_END_HOUR;
  const { timed } = splitAllDay(events);
  for (const event of timed) {
    const start = zonedParts(timezone, new Date(event.start));
    const end = zonedParts(timezone, new Date(event.end));
    startHour = Math.min(startHour, start.hour);
    endHour = Math.max(endHour, end.minute > 0 ? end.hour + 1 : end.hour);
  }
  if (now) {
    const parts = zonedParts(timezone, now);
    startHour = Math.min(startHour, parts.hour);
    endHour = Math.max(endHour, parts.hour + 1);
  }
  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(startHour + 1, endHour)),
  };
}

export function layoutTimedEvents(
  events: CalendarEvent[],
  timezone: string,
  day: Date,
  startHour: number,
  endHour: number,
): LaidOutEvent[] {
  const dayStart = startOfZonedDay(timezone, day);
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const { timed } = splitAllDay(events);
  const items = timed
    .map((event) => {
      const start = Math.max(rangeStart, minutesFromDayStart(new Date(event.start), timezone, dayStart));
      const end = Math.min(rangeEnd, minutesFromDayStart(new Date(event.end), timezone, dayStart));
      return { event, start, end };
    })
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const assigned: Array<(typeof items)[number] & { column: number }> = [];
  const columnEnds: number[] = [];
  for (const item of items) {
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.end);
    } else {
      columnEnds[column] = item.end;
    }
    assigned.push({ ...item, column });
  }

  return assigned.map((item) => {
    const overlapping = assigned.filter(
      (other) => other.start < item.end && other.end > item.start,
    );
    const columns = Math.max(1, ...overlapping.map((other) => other.column + 1));
    return {
      event: item.event,
      top: ((item.start - rangeStart) / 60) * HOUR_HEIGHT_PX,
      height: Math.max(22, ((item.end - item.start) / 60) * HOUR_HEIGHT_PX),
      column: item.column,
      columns,
    };
  });
}

export function nowLineOffset(
  now: Date,
  timezone: string,
  day: Date,
  startHour: number,
  endHour: number,
): number | null {
  const minutes = minutesFromDayStart(now, timezone, day);
  const start = startHour * 60;
  const end = endHour * 60;
  if (minutes < start || minutes > end) return null;
  return ((minutes - start) / 60) * HOUR_HEIGHT_PX;
}

export function hoursInRange(startHour: number, endHour: number): number[] {
  return Array.from({ length: Math.max(0, endHour - startHour) }, (_, index) => startHour + index);
}

export function nextDays(start: Date, timezone: string, count: number): Date[] {
  const day = startOfZonedDay(timezone, start);
  return Array.from({ length: count }, (_, index) => addDays(day, index));
}
