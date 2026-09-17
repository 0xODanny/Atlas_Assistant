import type { CalendarEvent } from "../types/event";
import { addDays, startOfZonedDay } from "../time";
import { resolveCreateDestination } from "./destination";

export function eventOverlapsRange(event: CalendarEvent, start: Date, end: Date): boolean {
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end).getTime();
  return event.status !== "cancelled" && eventEnd > start.getTime() && eventStart < end.getTime();
}

export function eventsOnZonedDay(
  events: CalendarEvent[],
  date: Date,
  timezone: string,
): CalendarEvent[] {
  const start = startOfZonedDay(timezone, date);
  const end = addDays(start, 1);
  return events
    .filter((event) => eventOverlapsRange(event, start, end))
    .sort((a, b) => {
      if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
}

export function splitAllDay(events: CalendarEvent[]): { allDay: CalendarEvent[]; timed: CalendarEvent[] } {
  return {
    allDay: events.filter((event) => event.allDay),
    timed: events.filter((event) => !event.allDay),
  };
}

export function destinationGoogleCalendar(connections?: {
  google?: {
    status: string;
    writeEnabled?: boolean;
    defaultWriteCalendarId?: string;
    calendars?: Array<{ id: string; primary?: boolean; included: boolean; summary: string; accessRole?: string }>;
  };
}) {
  const destination = resolveCreateDestination({
    googleConnected: connections?.google?.status === "connected",
    googleWritesEnabled: Boolean(connections?.google?.writeEnabled),
    includedCalendars: connections?.google?.calendars,
    preferredCalendarId: connections?.google?.defaultWriteCalendarId,
  });
  if (destination.provider !== "google") return undefined;
  return connections?.google?.calendars?.find((calendar) => calendar.id === destination.calendarId);
}
