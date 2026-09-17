import { rematchPersistedEvents } from "../calendar/busy";
import type { CalendarEvent } from "../types/event";
import { eventKey } from "./mapEvent";

export type CalendarReadScope = {
  provider?: "google";
  complete?: boolean;
  calendarIds?: string[];
  rangeStart?: string;
  rangeEnd?: string;
  accountEmail?: string;
  generation?: number;
  appliedGeneration?: number;
};

export function shouldApplyCalendarRead(scope?: CalendarReadScope): boolean {
  if (!scope?.complete) return false;
  if (
    scope.generation != null &&
    scope.appliedGeneration != null &&
    scope.generation < scope.appliedGeneration
  ) {
    return false;
  }
  return true;
}

function eventInScope(event: CalendarEvent, scope: CalendarReadScope): boolean {
  const provider = scope.provider ?? "google";
  if (event.source !== provider) return false;
  if (scope.calendarIds?.length) {
    if (!event.calendarId || !scope.calendarIds.includes(event.calendarId)) return false;
  }
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (scope.rangeStart && end <= Date.parse(scope.rangeStart)) return false;
  if (scope.rangeEnd && start >= Date.parse(scope.rangeEnd)) return false;
  return true;
}

function dedupeProviderEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const remote: CalendarEvent[] = [];
  for (const event of events) {
    const key = eventKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    remote.push(event);
  }
  return remote;
}

export function mergeCalendarEvents(
  localEvents: CalendarEvent[],
  providerEvents: CalendarEvent[],
  scope?: CalendarReadScope,
  provider: "google" = "google",
): CalendarEvent[] {
  if (!scope || !shouldApplyCalendarRead(scope)) {
    if (!scope && providerEvents.length > 0) {
      const locals = localEvents.filter((event) => event.source !== provider);
      return rematchPersistedEvents(
        [...locals, ...dedupeProviderEvents(providerEvents)].sort((a, b) => a.start.localeCompare(b.start)),
      );
    }
    return rematchPersistedEvents([...localEvents].sort((left, right) => left.start.localeCompare(right.start)));
  }

  const applied = { ...scope, provider: scope.provider ?? provider };
  const kept = localEvents.filter((event) => !eventInScope(event, applied));
  return rematchPersistedEvents(
    [...kept, ...dedupeProviderEvents(providerEvents)].sort((a, b) => a.start.localeCompare(b.start)),
  );
}

export function removeProviderEvents(events: CalendarEvent[], provider: "google" = "google"): CalendarEvent[] {
  return events.filter((event) => event.source !== provider);
}
