import { eventDurationMinutes } from "../format";
import { addMinutes } from "../time";
import { isInstantInPast } from "../time/clock";
import type { CalendarEvent } from "../types/event";
import type { Workout } from "../types/training";
import { proposedLocationConflicts } from "./moveSuggestions";

export type TimedMoveValidation =
  | { ok: true; start: string; end: string; durationMinutes: number }
  | { ok: false; reason: "past" | "conflict" | "invalid" };

export function validateTimedMove(input: {
  event: CalendarEvent;
  start: Date;
  now: Date;
  events: CalendarEvent[];
  workouts?: Workout[];
  afterWorkoutBufferMinutes?: number;
  allowPast?: boolean;
}): TimedMoveValidation {
  if (Number.isNaN(input.start.getTime())) return { ok: false, reason: "invalid" };
  const durationMinutes = eventDurationMinutes(input.event.start, input.event.end);
  if (durationMinutes <= 0) return { ok: false, reason: "invalid" };
  const start = input.start.toISOString();
  const end = addMinutes(input.start, durationMinutes).toISOString();
  if (isInstantInPast(start, input.now) && !input.allowPast) return { ok: false, reason: "past" };
  if (
    proposedLocationConflicts({
      event: input.event,
      start,
      end,
      events: input.events,
      workouts: input.workouts,
      afterWorkoutBufferMinutes: input.afterWorkoutBufferMinutes,
    })
  ) {
    return { ok: false, reason: "conflict" };
  }
  return { ok: true, start, end, durationMinutes };
}
