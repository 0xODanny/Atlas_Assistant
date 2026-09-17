import type { CalendarEvent } from "../types/event";

export function eventBlocksTime(event: CalendarEvent): boolean {
  if (event.status === "cancelled") return false;
  if (event.transparency === "transparent") return false;
  if (event.transparency === "opaque") return true;
  if (event.allDay) return event.blocksTime === true;
  return event.blocksTime !== false;
}

export function busyIntervals(
  events: CalendarEvent[],
  range?: { start: number; end: number },
): Array<{ start: number; end: number }> {
  return events
    .filter((event) => eventBlocksTime(event))
    .map((event) => ({
      start: new Date(event.start).getTime(),
      end: new Date(event.end).getTime(),
    }))
    .filter((interval) => {
      if (!range) return interval.end > interval.start;
      return interval.end > range.start && interval.start < range.end;
    });
}

export function rematchPersistedEvent(event: CalendarEvent): CalendarEvent {
  if (event.status === "cancelled") return { ...event, blocksTime: false };
  if (!event.allDay) return event;
  if (event.transparency === "opaque") return { ...event, blocksTime: true };
  if (event.transparency === "transparent") return { ...event, blocksTime: false };
  if (event.source === "google" && event.transparency == null) {
    return { ...event, blocksTime: false };
  }
  return { ...event, blocksTime: event.blocksTime === true };
}

export function rematchPersistedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.map(rematchPersistedEvent);
}

export function normalizeAllDayBlocking(event: CalendarEvent): CalendarEvent {
  return rematchPersistedEvent(event);
}
