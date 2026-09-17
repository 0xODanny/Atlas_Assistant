import type { BusyBlock, CalendarEvent } from "../types/event";

export type EventProjection = CalendarEvent | BusyBlock | null;

export function projectEventForViewer(
  event: CalendarEvent,
  viewer: { isOwner: boolean },
): EventProjection {
  if (event.status === "cancelled") return null;
  if (viewer.isOwner) return event;

  if (event.privacy === "private") return null;
  if (event.privacy === "busy-only") {
    return {
      start: event.start,
      end: event.end,
      busy: true,
    };
  }
  return event;
}

export function projectEventsForViewer(
  events: CalendarEvent[],
  viewer: { isOwner: boolean },
): Array<CalendarEvent | BusyBlock> {
  return events
    .map((event) => projectEventForViewer(event, viewer))
    .filter((item): item is CalendarEvent | BusyBlock => item !== null);
}

export function isBusyBlock(value: CalendarEvent | BusyBlock): value is BusyBlock {
  return "busy" in value && value.busy === true;
}
