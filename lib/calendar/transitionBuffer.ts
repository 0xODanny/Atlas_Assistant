import { formatDuration, formatClockNatural, formatRangeNatural } from "../format";
import { linkedWorkout } from "../prepare/content";
import type { CalendarEvent } from "../types/event";
import type { UserProfile } from "../types/profile";
import type { Workout } from "../types/training";
import { eventBlocksTime } from "./busy";

export const DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES = 30;
export const MAX_AFTER_WORKOUT_BUFFER_MINUTES = 180;

const TRANSITION_BLOCK = /\b(prep|prepare|preparation|recovery|shower|cool-?down|get ready|transition)\b/i;

export type TimeInterval = { start: number; end: number };

export type TightTransition = {
  workout: CalendarEvent;
  event: CalendarEvent;
  gapMinutes: number;
};

export function clampAfterWorkoutBufferMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES;
  return Math.min(MAX_AFTER_WORKOUT_BUFFER_MINUTES, Math.max(0, Math.round(value)));
}

export function resolveAfterWorkoutBufferMinutes(profile?: Pick<UserProfile, "afterWorkoutBufferMinutes">): number {
  if (profile?.afterWorkoutBufferMinutes == null) return DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES;
  return clampAfterWorkoutBufferMinutes(profile.afterWorkoutBufferMinutes);
}

export function planningFreeTimeOptions(
  profile?: Pick<UserProfile, "afterWorkoutBufferMinutes">,
  workouts: Workout[] = [],
): { workouts: Workout[]; afterWorkoutBufferMinutes: number } {
  return {
    workouts,
    afterWorkoutBufferMinutes: resolveAfterWorkoutBufferMinutes(profile),
  };
}

export function isRecognizedWorkout(event: CalendarEvent, workouts: Workout[] = []): boolean {
  if (event.status === "cancelled" || event.allDay) return false;
  if (linkedWorkout(event, workouts)) return true;
  if (event.workoutId) return true;
  return event.category === "training";
}

export function isReservedTransitionBlock(event: CalendarEvent, workouts: Workout[] = []): boolean {
  if (event.status === "cancelled" || event.allDay) return false;
  const workout = linkedWorkout(event, workouts);
  if (workout?.sport === "recovery") return true;
  return TRANSITION_BLOCK.test(event.title) || TRANSITION_BLOCK.test(event.description);
}

function subtractBusy(window: TimeInterval, busy: TimeInterval[]): TimeInterval[] {
  let open = [window];
  for (const block of busy) {
    const next: TimeInterval[] = [];
    for (const slot of open) {
      if (block.end <= slot.start || block.start >= slot.end) {
        next.push(slot);
        continue;
      }
      if (block.start > slot.start) {
        next.push({ start: slot.start, end: Math.min(block.start, slot.end) });
      }
      if (block.end < slot.end) {
        next.push({ start: Math.max(block.end, slot.start), end: slot.end });
      }
    }
    open = next;
  }
  return open.filter((slot) => slot.end > slot.start);
}

export function workoutBufferIntervals(
  events: CalendarEvent[],
  workouts: Workout[] = [],
  bufferMinutes = 0,
  range?: TimeInterval,
): TimeInterval[] {
  if (bufferMinutes <= 0) return [];
  const sessions = events.filter((event) => isRecognizedWorkout(event, workouts));
  const reserved = events.filter((event) => isReservedTransitionBlock(event, workouts));
  const intervals: TimeInterval[] = [];

  for (const workout of sessions) {
    const start = new Date(workout.end).getTime();
    const end = start + bufferMinutes * 60_000;
    const covering = reserved
      .filter((event) => event.id !== workout.id)
      .map((event) => ({
        start: new Date(event.start).getTime(),
        end: new Date(event.end).getTime(),
      }))
      .filter((block) => block.end > start && block.start < end);
    for (const leftover of subtractBusy({ start, end }, covering)) {
      intervals.push(leftover);
    }
  }

  return intervals.filter((interval) => {
    if (!range) return interval.end > interval.start;
    return interval.end > range.start && interval.start < range.end;
  });
}

export function planningConflicts(
  startIso: string,
  endIso: string,
  events: CalendarEvent[],
  extras?: { workouts?: Workout[]; afterWorkoutBufferMinutes?: number },
): boolean {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (
    events.some((event) => {
      if (!eventBlocksTime(event)) return false;
      return end > new Date(event.start).getTime() && start < new Date(event.end).getTime();
    })
  ) {
    return true;
  }
  return workoutBufferIntervals(events, extras?.workouts ?? [], extras?.afterWorkoutBufferMinutes ?? 0).some(
    (block) => block.end > start && block.start < end,
  );
}

export function tightTransitions(
  events: CalendarEvent[],
  workouts: Workout[] = [],
  bufferMinutes = 0,
): TightTransition[] {
  if (bufferMinutes <= 0) return [];
  const sessions = events.filter((event) => isRecognizedWorkout(event, workouts));
  const meetings = events.filter(
    (event) => event.status !== "cancelled" && event.category === "meeting" && !event.allDay,
  );
  const flags: TightTransition[] = [];
  for (const workout of sessions) {
    const workoutEnd = new Date(workout.end).getTime();
    const bufferEnd = workoutEnd + bufferMinutes * 60_000;
    for (const meeting of meetings) {
      const meetingStart = new Date(meeting.start).getTime();
      if (meetingStart >= workoutEnd && meetingStart < bufferEnd) {
        flags.push({
          workout,
          event: meeting,
          gapMinutes: Math.max(0, Math.round((meetingStart - workoutEnd) / 60_000)),
        });
      }
    }
  }
  return flags.sort((left, right) => left.workout.start.localeCompare(right.workout.start));
}

export function describeTightTransition(flag: TightTransition, timezone: string): string {
  return `${flag.workout.title} ends at ${formatClockNatural(flag.workout.end, timezone)}. ${flag.event.title} starts at ${formatClockNatural(flag.event.start, timezone)} — that is a tight transition with no time to shower and get ready. I have not moved it.`;
}

export function describeWorkoutBufferAvailability(input: {
  workout: CalendarEvent;
  bufferMinutes: number;
  windowStart: string;
  windowEnd: string;
  timezone: string;
}): string {
  return `${input.workout.title} ends at ${formatClockNatural(input.workout.end, input.timezone)}. Allowing ${formatDuration(input.bufferMinutes)} to shower and get ready, you're available from ${formatRangeNatural(input.windowStart, input.windowEnd, input.timezone)}.`;
}
