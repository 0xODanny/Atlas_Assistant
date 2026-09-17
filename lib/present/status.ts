import { formatEventTiming } from "../format";
import type { CalendarEvent } from "../types/event";
import type { Meeting } from "../types/meeting";
import type { Workout } from "../types/training";
import { presentEventRow } from "./event";

export { isUpcomingMeeting, nextEligibleMeeting } from "../calendar/meetings";

export function nextActiveEvent(events: CalendarEvent[], now: Date): CalendarEvent | undefined {
  return events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => new Date(event.end).getTime() > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

export function nextUpcomingEvent(events: CalendarEvent[], now: Date): CalendarEvent | undefined {
  return events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => new Date(event.start).getTime() > now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

export function presentNextStatus(input: {
  event: CalendarEvent;
  now: Date;
  timezone: string;
  workout?: Workout;
  meeting?: Meeting;
  selfName?: string;
}): { title: string; lead: string; summary: string } {
  const row = presentEventRow(input);
  const timing = formatEventTiming(input.now, input.event.start, input.event.end, input.timezone, Boolean(input.event.allDay));
  const lead =
    timing && timing.toLowerCase() !== row.time.toLowerCase()
      ? `${row.time} · ${timing.charAt(0).toLowerCase()}${timing.slice(1)}`
      : row.time;
  const summary = [row.meta, row.detail].filter(Boolean).join(" · ");
  return { title: row.title, lead, summary };
}
