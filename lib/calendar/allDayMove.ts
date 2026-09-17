import { allDaySpanDays, formatAllDayRange } from "../format";
import { addDays, startOfZonedDay, zonedLocalToUtc, zonedDateKey } from "../time";
import type { CalendarEvent, UpdateEventInput } from "../types/event";

function parseDateInput(value: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function allDayInclusiveEnd(startIso: string, endIso: string, timeZone: string): Date {
  return addDays(startOfZonedDay(timeZone, new Date(endIso)), -1);
}

export function formatAllDayCurrent(startIso: string, endIso: string, timeZone: string): string {
  const days = allDaySpanDays(startIso, endIso, timeZone);
  const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
    new Date(startIso),
  );
  if (days <= 1) return `${startLabel} · All day`;
  return `${formatAllDayRange(startIso, endIso, timeZone)} · All day`;
}

export function allDayMoveControls(
  event: Pick<CalendarEvent, "start" | "end">,
  timeZone: string,
): {
  currentLabel: string;
  mode: "single" | "range";
  startDate: string;
  endDate: string;
  keepLabel: "All day";
} {
  const days = allDaySpanDays(event.start, event.end, timeZone);
  return {
    currentLabel: formatAllDayCurrent(event.start, event.end, timeZone),
    mode: days <= 1 ? "single" : "range",
    startDate: zonedDateKey(timeZone, new Date(event.start)),
    endDate: zonedDateKey(timeZone, allDayInclusiveEnd(event.start, event.end, timeZone)),
    keepLabel: "All day",
  };
}

export function moveAllDayEvent(input: {
  event: Pick<CalendarEvent, "start" | "end" | "allDay">;
  timezone: string;
  startDate: string;
  endDate?: string;
}): UpdateEventInput {
  const startParts = parseDateInput(input.startDate);
  const span = allDaySpanDays(input.event.start, input.event.end, input.timezone);
  const start = startParts
    ? zonedLocalToUtc(input.timezone, startParts.year, startParts.month, startParts.day, 0, 0)
    : startOfZonedDay(input.timezone, new Date(input.event.start));
  const endParts = input.endDate ? parseDateInput(input.endDate) : null;
  let end = endParts
    ? addDays(zonedLocalToUtc(input.timezone, endParts.year, endParts.month, endParts.day, 0, 0), 1)
    : addDays(start, span);
  if (end.getTime() <= start.getTime()) {
    end = addDays(start, 1);
  }
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: true,
  };
}
