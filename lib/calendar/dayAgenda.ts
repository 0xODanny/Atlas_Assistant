import type { CalendarEvent } from "../types/event";
import type { ConnectionState } from "../types/profile";
import { eventsOnZonedDay, splitAllDay } from "./dayEvents";

export type DayEventPhase = "allDay" | "upcoming" | "now" | "completed";

export type CalendarReadStatus = "ready" | "loading" | "unavailable";

export function dayEventsFor(events: CalendarEvent[], date: Date, timezone: string): CalendarEvent[] {
  return eventsOnZonedDay(events, date, timezone);
}

export function dayEventPhase(event: CalendarEvent, now: Date): DayEventPhase {
  if (event.allDay) return "allDay";
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const current = now.getTime();
  if (current < start) return "upcoming";
  if (current < end) return "now";
  return "completed";
}

export function groupDayEvents(events: CalendarEvent[], now: Date): {
  allDay: CalendarEvent[];
  upcoming: CalendarEvent[];
  now: CalendarEvent[];
  completed: CalendarEvent[];
} {
  const { allDay, timed } = splitAllDay(events);
  return {
    allDay,
    upcoming: timed.filter((event) => dayEventPhase(event, now) === "upcoming"),
    now: timed.filter((event) => dayEventPhase(event, now) === "now"),
    completed: timed.filter((event) => dayEventPhase(event, now) === "completed"),
  };
}

export function calendarReadStatus(input: {
  ready: boolean;
  syncing?: boolean;
  google?: ConnectionState;
  dayEventCount: number;
}): CalendarReadStatus {
  if (!input.ready) return "loading";
  const google = input.google;
  if (google?.status === "error" && input.dayEventCount === 0) return "unavailable";
  if (input.dayEventCount === 0 && google?.status === "connecting") return "loading";
  if (
    input.dayEventCount === 0 &&
    google?.status === "connected" &&
    (input.syncing || !google.lastSyncedAt)
  ) {
    return "loading";
  }
  return "ready";
}

export function todayCountLabel(count: number, status: CalendarReadStatus): string {
  if (status === "loading") return "Loading calendar";
  if (status === "unavailable") return "Calendar unavailable";
  return `${count} ${count === 1 ? "event" : "events"}`;
}
