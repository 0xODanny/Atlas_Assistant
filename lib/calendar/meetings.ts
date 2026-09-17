import { isDemoEvent } from "../data/sample";
import type { CalendarEvent } from "../types/event";

export function isMeetingLike(event: Pick<CalendarEvent, "category">): boolean {
  return event.category === "meeting";
}

export function isUpcomingMeeting(event: CalendarEvent, now: Date): boolean {
  if (event.status === "cancelled") return false;
  if (!isMeetingLike(event)) return false;
  return new Date(event.end).getTime() > now.getTime();
}

function genericMeetingHint(hint?: string): boolean {
  return !hint || hint.toLowerCase() === "meeting";
}

export function nextEligibleMeeting(
  events: CalendarEvent[],
  now: Date,
  hint?: string,
  options?: { preferNonDemo?: boolean },
): CalendarEvent | undefined {
  const needle = hint?.toLowerCase();
  const upcoming = events
    .filter((event) => isUpcomingMeeting(event, now))
    .filter((event) => {
      if (!needle || needle === "meeting") return true;
      if (event.title.toLowerCase().includes(needle)) return true;
      return event.participants.some((person) => person.name.toLowerCase().includes(needle));
    })
    .sort((a, b) => a.start.localeCompare(b.start));

  const preferNonDemo = options?.preferNonDemo ?? true;
  if (preferNonDemo && genericMeetingHint(hint)) {
    const real = upcoming.filter((event) => !isDemoEvent(event));
    if (real.length) return real[0];
  }
  return upcoming[0];
}

export function sampleMeetingNote(event: CalendarEvent): string {
  return isDemoEvent(event) ? " This is sample Atlas data." : "";
}
