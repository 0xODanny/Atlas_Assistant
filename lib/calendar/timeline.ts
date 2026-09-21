import { minutesBetween, zonedParts } from "../time";
import type { CalendarEvent } from "../types/event";
import { splitAllDay } from "./dayEvents";

export type TimelineGap = {
  kind: "gap";
  id: string;
  minutes: number;
  start: string;
  end: string;
};

export type TimelineEventItem = {
  kind: "event";
  event: CalendarEvent;
};

export type TimelineItem = TimelineEventItem | TimelineGap;

const MIN_GAP_MINUTES = 30;

export function dayTimelineItems(events: CalendarEvent[]): TimelineItem[] {
  const { allDay, timed } = splitAllDay(events);
  const items: TimelineItem[] = allDay.map((event) => ({ kind: "event", event }));
  timed.forEach((event, index) => {
    const previous = timed[index - 1];
    if (previous) {
      const minutes = minutesBetween(new Date(previous.end), new Date(event.start));
      if (minutes >= MIN_GAP_MINUTES) {
        items.push({
          kind: "gap",
          id: `gap:${previous.id}:${event.id}`,
          minutes,
          start: previous.end,
          end: event.start,
        });
      }
    }
    items.push({ kind: "event", event });
  });
  return items;
}

export function todaySubtitle(input: {
  status: "ready" | "loading" | "unavailable";
  events?: Array<Pick<CalendarEvent, "start" | "end" | "allDay" | "category">>;
  timezone?: string;
  eventCount?: number;
}): string {
  if (input.status === "loading") return "Loading your calendar.";
  if (input.status === "unavailable") return "Could not read your calendar.";
  const events = input.events ?? [];
  const count = input.eventCount ?? events.length;
  if (count === 0) return "A clear start.";

  const timezone = input.timezone ?? "UTC";
  const buckets = { morning: 0, afternoon: 0, evening: 0 };
  let eveningTraining = false;
  let largestGap = 0;
  const timed = events
    .filter((event) => !event.allDay)
    .slice()
    .sort((left, right) => left.start.localeCompare(right.start));

  timed.forEach((event, index) => {
    const hour = zonedParts(timezone, new Date(event.start)).hour;
    const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    buckets[part] += 1;
    if (part === "evening" && event.category === "training") eveningTraining = true;
    const previous = timed[index - 1];
    if (previous) {
      largestGap = Math.max(largestGap, minutesBetween(new Date(previous.end), new Date(event.start)));
    }
  });

  if (buckets.morning === 0 && eveningTraining) {
    return "A clear morning. Training this evening.";
  }
  if (buckets.morning === 0 && count > 0) {
    return count <= 2 ? "A clear morning. Plans later." : "A clear morning. More later.";
  }
  if (count <= 2) return "A lighter day with time to plan.";
  if (count === 3 || largestGap >= 90) {
    return count === 3 ? "Three events with room to focus." : `${count} events with room to focus.`;
  }
  if (count >= 4) return "A fuller day with less room between.";
  return `${count} events today.`;
}
