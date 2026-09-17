import { findFreeTime, suggestFocusWindow, totalOpenMinutes } from "../calendar/freeTime";
import { resolveScheduleHours } from "../calendar/hours";
import { planningFreeTimeOptions } from "../calendar/transitionBuffer";
import { eventDurationMinutes, formatAllDayLabel, formatClock, formatCompactHours, formatRange, greetingOnly } from "../format";
import { participantSummary, presentEventRow } from "../present/event";
import { isUpcomingMeeting } from "../calendar/meetings";
import { linkedMeeting, linkedWorkout } from "../prepare/content";
import { dayEventsFor } from "../calendar/dayAgenda";
import { addDays, startOfZonedDay } from "../time";
import { availabilitySearchStart } from "../time/clock";
import type { CalendarEvent } from "../types/event";
import type { FreeWindow } from "../types/assistant";
import type { Meeting } from "../types/meeting";
import type { UserProfile } from "../types/profile";
import type { Task } from "../types/task";
import type { Workout } from "../types/training";

export type BriefLine = {
  kind: "event" | "focus";
  eventId?: string;
  start: string;
  timeLabel: string;
  heading: string;
  meta?: string;
  lines: string[];
  action?: "prepare";
};

export type BriefItem = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  minutes: number;
  preparationRequired: boolean;
  preparationMinutes: number;
  category: CalendarEvent["category"];
  meta?: string;
  detail?: string;
};

export type MorningBrief = {
  date: string;
  greeting: string;
  eventCount: number;
  openMinutes: number;
  summary: string;
  timeline: BriefLine[];
  items: BriefItem[];
  bestFocus?: FreeWindow;
  important: Task[];
  prepItems: Array<{
    eventId: string;
    title: string;
    minutes: number;
  }>;
};

function briefEventLine(input: {
  event: CalendarEvent;
  workout?: Workout;
  meeting?: Meeting;
  timezone: string;
  selfName: string;
  now: Date;
}): BriefLine {
  const { event, workout, meeting, timezone, selfName, now } = input;
  const row = presentEventRow({ event, timezone, workout, meeting, selfName });
  const lines: string[] = [];
  if (event.category === "training") {
    if (row.detail) lines.push(row.detail);
    if (workout?.weatherDependent) {
      lines.push("Indoor alternative available if weather changes.");
    }
  } else if (event.category === "meeting" && event.preparationRequired) {
    lines.push(`${event.preparationMinutes} minutes of preparation recommended.`);
  } else if (row.detail) {
    lines.push(row.detail);
  }

  const people = participantSummary(event, selfName);
  const minutes = eventDurationMinutes(event.start, event.end);
  let meta = row.meta;
  if (!event.allDay && event.category === "meeting" && people) {
    meta = `${minutes} min · ${people}`;
  }

  return {
    kind: "event",
    eventId: event.id,
    start: event.start,
    timeLabel: event.allDay ? formatAllDayLabel(event.start, event.end, timezone) : formatClock(event.start, timezone),
    heading: event.title.toUpperCase(),
    meta,
    lines,
    action: event.category === "meeting" && event.preparationRequired && isUpcomingMeeting(event, now) ? "prepare" : undefined,
  };
}

export function generateBrief(input: {
  now: Date;
  profile: UserProfile;
  events: CalendarEvent[];
  tasks: Task[];
  workouts: Workout[];
  meetings?: Meeting[];
}): MorningBrief {
  const { profile } = input;
  const meetings = input.meetings ?? [];
  const dayStart = startOfZonedDay(profile.timezone, input.now);
  const dayEnd = addDays(dayStart, 1);
  const todaysEvents = dayEventsFor(input.events, input.now, profile.timezone);

  const windows = findFreeTime({
    start: availabilitySearchStart(input.now, profile.timezone),
    end: dayEnd,
    durationMinutes: 30,
    events: todaysEvents,
    timezone: profile.timezone,
    workingHours: resolveScheduleHours(profile, "focus"),
    useWorkingHours: true,
    ...planningFreeTimeOptions(profile, input.workouts),
  });

  const bestFocus = suggestFocusWindow(windows, profile.timezone, input.now);
  const important = input.tasks.filter((task) => task.important && !task.completed);

  const items: BriefItem[] = todaysEvents.map((event) => {
    const workout = linkedWorkout(event, input.workouts);
    const meeting = linkedMeeting(event, meetings);
    const row = presentEventRow({
      event,
      timezone: profile.timezone,
      workout,
      meeting,
      selfName: profile.displayName,
    });
    return {
      eventId: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      minutes: eventDurationMinutes(event.start, event.end),
      preparationRequired: event.preparationRequired,
      preparationMinutes: event.preparationMinutes,
      category: event.category,
      meta: row.meta,
      detail: row.detail,
    };
  });

  const timeline: BriefLine[] = todaysEvents.map((event) =>
    briefEventLine({
      event,
      workout: linkedWorkout(event, input.workouts),
      meeting: linkedMeeting(event, meetings),
      timezone: profile.timezone,
      selfName: profile.displayName,
      now: input.now,
    }),
  );

  if (bestFocus) {
    const hours = Math.round(bestFocus.minutes / 60);
    timeline.push({
      kind: "focus",
      start: bestFocus.start,
      timeLabel: formatRange(bestFocus.start, bestFocus.end, profile.timezone),
      heading: "BEST FOCUS WINDOW",
      lines: [`${hours} uninterrupted ${hours === 1 ? "hour" : "hours"}.`],
    });
    timeline.sort((left, right) => left.start.localeCompare(right.start));
  }

  return {
    date: dayStart.toISOString(),
    greeting: greetingOnly(input.now.toISOString(), profile.timezone),
    eventCount: todaysEvents.length,
    openMinutes: totalOpenMinutes(windows),
    summary: `${todaysEvents.length} ${todaysEvents.length === 1 ? "event" : "events"} today · approximately ${formatCompactHours(totalOpenMinutes(windows))} open`,
    timeline,
    items,
    bestFocus,
    important,
    prepItems: todaysEvents
      .filter(
        (event) =>
          event.preparationRequired &&
          event.preparationMinutes > 0 &&
          (event.category === "meeting"
            ? isUpcomingMeeting(event, input.now)
            : event.category === "work"),
      )
      .map((event) => ({
        eventId: event.id,
        title: event.title,
        minutes: event.preparationMinutes,
      })),
  };
}
