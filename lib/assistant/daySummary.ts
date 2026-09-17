import { dayEventsFor } from "../calendar/dayAgenda";
import { findFreeTime } from "../calendar/freeTime";
import {
  describeTightTransition,
  describeWorkoutBufferAvailability,
  isRecognizedWorkout,
  resolveAfterWorkoutBufferMinutes,
  tightTransitions,
} from "../calendar/transitionBuffer";
import {
  eventDurationMinutes,
  formatAllDayLabel,
  formatRange,
  formatRangeNatural,
  formatShortDay,
  indefiniteDurationAdjective,
} from "../format";
import { linkedWorkout } from "../prepare/content";
import { sameZonedDay } from "../time";
import type { AssistantContext, FreeWindow } from "../types/assistant";
import type { CalendarEvent } from "../types/event";
import type { UserProfile, WorkingHours } from "../types/profile";
import type { Workout } from "../types/training";
import { hoursEndInstant, hoursStartInstant } from "../calendar/hours";

function workingBounds(dayStart: Date, timezone: string, workingHours: WorkingHours): { start: Date; end: Date } {
  return {
    start: hoursStartInstant(timezone, dayStart, workingHours.start),
    end: hoursEndInstant(timezone, dayStart, workingHours.end),
  };
}

function eventKind(event: CalendarEvent, hasWorkout: boolean): string {
  const title = event.title.toLowerCase();
  if (hasWorkout || event.category === "training") {
    return /\bworkout\b/.test(title) ? "" : " workout";
  }
  if (event.category === "meeting" && !/\bmeeting\b/.test(title)) return " meeting";
  return "";
}

export function describeScheduledEvent(
  event: CalendarEvent,
  timezone: string,
  workouts: AssistantContext["workouts"],
): string {
  const workout = linkedWorkout(event, workouts);
  const range = event.allDay
    ? formatAllDayLabel(event.start, event.end, timezone)
    : formatRange(event.start, event.end, timezone);
  const minutes = eventDurationMinutes(event.start, event.end);
  const kind = eventKind(event, Boolean(workout));
  if (event.allDay) return `${event.title}${kind} ${range}`;
  return `${indefiniteDurationAdjective(minutes)} ${event.title}${kind} from ${range}`;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

function windowRange(window: FreeWindow, timezone: string): string {
  return formatRange(window.start, window.end, timezone);
}

export function remainingWindowsForDay(input: {
  events: CalendarEvent[];
  timezone: string;
  now: Date;
  dayStart: Date;
  workingHours: WorkingHours;
  workouts?: Workout[];
  afterWorkoutBufferMinutes?: number;
}): FreeWindow[] {
  const bounds = workingBounds(input.dayStart, input.timezone, input.workingHours);
  const isToday = sameZonedDay(input.dayStart, input.now, input.timezone);
  const start = isToday && input.now.getTime() > bounds.start.getTime() ? input.now : bounds.start;
  if (start.getTime() >= bounds.end.getTime()) return [];
  return findFreeTime({
    start,
    end: bounds.end,
    durationMinutes: 30,
    events: input.events,
    timezone: input.timezone,
    workingHours: input.workingHours,
    useWorkingHours: true,
    workouts: input.workouts,
    afterWorkoutBufferMinutes: input.afterWorkoutBufferMinutes ?? 0,
  });
}

export function calendarReadFailed(context: AssistantContext): boolean {
  return context.connections?.google.status === "error";
}

function availabilityAfterWorkouts(input: {
  events: CalendarEvent[];
  workouts: Workout[];
  windows: FreeWindow[];
  timezone: string;
  bufferMinutes: number;
  isToday: boolean;
  dayLabel: string;
}): string | undefined {
  if (!input.windows.length) {
    return input.isToday
      ? "There is no remaining open working time today."
      : `There is no open working time on ${input.dayLabel}.`;
  }

  const tight = tightTransitions(input.events, input.workouts, input.bufferMinutes)[0];
  if (tight) return describeTightTransition(tight, input.timezone);

  const workouts = input.events
    .filter((event) => isRecognizedWorkout(event, input.workouts))
    .sort((left, right) => left.end.localeCompare(right.end));
  const lastWorkout = workouts[workouts.length - 1];
  if (lastWorkout && input.bufferMinutes > 0) {
    const bufferedStart = new Date(lastWorkout.end).getTime() + input.bufferMinutes * 60_000;
    const after = input.windows.filter((window) => new Date(window.start).getTime() >= bufferedStart - 60_000);
    const before = input.windows.filter((window) => new Date(window.end).getTime() <= new Date(lastWorkout.start).getTime() + 60_000);
    if (after.length) {
      const first = after[0]!;
      const bufferLine = describeWorkoutBufferAvailability({
        workout: lastWorkout,
        bufferMinutes: input.bufferMinutes,
        windowStart: first.start,
        windowEnd: first.end,
        timezone: input.timezone,
      });
      const extra = after.slice(1).map((window) => formatRangeNatural(window.start, window.end, input.timezone));
      const earlier = before.map((window) => formatRangeNatural(window.start, window.end, input.timezone));
      const parts = [
        earlier.length ? `You have free time from ${earlier.join(" and ")}` : undefined,
        extra.length ? `${bufferLine} You also have free time from ${extra.join(" and ")}` : bufferLine,
      ].filter(Boolean);
      return parts.join(". ");
    }
  }

  return input.windows.length === 1
    ? `you have free time from ${windowRange(input.windows[0]!, input.timezone)}`
    : `you have free time from ${input.windows.map((window) => windowRange(window, input.timezone)).join(" and ")}`;
}

export function buildDaySummaryMessage(input: {
  events: CalendarEvent[];
  timezone: string;
  now: Date;
  dayStart: Date;
  workingHours: WorkingHours;
  workouts: AssistantContext["workouts"];
  calendarError?: boolean;
  profile?: Pick<UserProfile, "afterWorkoutBufferMinutes">;
}): string {
  const list = dayEventsFor(input.events, input.dayStart, input.timezone);
  const isToday = sameZonedDay(input.dayStart, input.now, input.timezone);
  const dayLabel = isToday ? "today" : formatShortDay(input.dayStart.toISOString(), input.timezone);
  const bufferMinutes = resolveAfterWorkoutBufferMinutes(input.profile);
  const windows = remainingWindowsForDay({
    events: input.events,
    timezone: input.timezone,
    now: input.now,
    dayStart: input.dayStart,
    workingHours: input.workingHours,
    workouts: input.workouts,
    afterWorkoutBufferMinutes: bufferMinutes,
  });

  if (!list.length && input.calendarError) {
    return "I could not read your calendar, so I cannot tell whether the day is empty.";
  }

  const availability = availabilityAfterWorkouts({
    events: list,
    workouts: input.workouts,
    windows,
    timezone: input.timezone,
    bufferMinutes,
    isToday,
    dayLabel,
  });

  if (!list.length) {
    const empty = isToday ? "Nothing is scheduled today." : `Nothing is scheduled on ${dayLabel}.`;
    if (!windows.length || !availability) return empty;
    if (/^[A-Z]/.test(availability)) return `${empty} ${availability}`;
    return `${empty} ${availability.charAt(0).toUpperCase()}${availability.slice(1)}.`;
  }

  const phrases = list.map((event) => describeScheduledEvent(event, input.timezone, input.workouts));
  const scheduled = `You have ${joinPhrases(phrases)}.`;
  if (!availability) return scheduled;
  if (/^[A-Z]/.test(availability)) return `${scheduled} ${availability}`;
  const lastEnd = Math.max(...list.map((event) => new Date(event.end).getTime()));
  const afterLast = windows.every((window) => new Date(window.start).getTime() >= lastEnd - 60_000);
  if (afterLast) return `${scheduled} Afterward, ${availability}.`;
  return `${scheduled} ${availability.charAt(0).toUpperCase()}${availability.slice(1)}.`;
}

export function dayEventsLoaded(context: AssistantContext, dayStart: Date): CalendarEvent[] {
  return dayEventsFor(context.events, dayStart, context.timezone);
}
