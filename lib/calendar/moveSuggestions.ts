import { eventDurationMinutes, formatSuggestionSlot } from "../format";
import { addDays, addMinutes, atZonedTime, parseHHMM, sameZonedDay, startOfZonedDay, zonedParts } from "../time";
import { availabilitySearchStart } from "../time/clock";
import type { CalendarEvent } from "../types/event";
import type { WorkingHours } from "../types/profile";
import { eventBlocksTime } from "./busy";
import { findFreeTime } from "./freeTime";
import { snapZonedDate } from "./snap";
import { isRecognizedWorkout, planningConflicts } from "./transitionBuffer";
import type { Workout } from "../types/training";

export type MoveSuggestion = {
  start: string;
  end: string;
  minutes: number;
  dateLabel: string;
  label: string;
  working: boolean;
};

export function othersForMove(events: CalendarEvent[], eventId: string): CalendarEvent[] {
  return events.filter((event) => event.id !== eventId && event.status !== "cancelled");
}

export function proposedLocationConflicts(input: {
  event: CalendarEvent;
  start: string;
  end: string;
  events: CalendarEvent[];
  workouts?: Workout[];
  afterWorkoutBufferMinutes?: number;
}): boolean {
  const others = othersForMove(input.events, input.event.id);
  const planning = {
    workouts: input.workouts,
    afterWorkoutBufferMinutes: input.afterWorkoutBufferMinutes ?? 0,
  };
  if (planningConflicts(input.start, input.end, others, planning)) return true;
  if (!isRecognizedWorkout(input.event, input.workouts ?? []) || !planning.afterWorkoutBufferMinutes) {
    return false;
  }
  const bufferStart = input.end;
  const bufferEnd = addMinutes(new Date(input.end), planning.afterWorkoutBufferMinutes).toISOString();
  return (
    eventsConflict(bufferStart, bufferEnd, others) ||
    planningConflicts(bufferStart, bufferEnd, others, { workouts: input.workouts, afterWorkoutBufferMinutes: 0 })
  );
}

function intervalOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aEnd > bStart && aStart < bEnd;
}

export function eventsConflict(
  startIso: string,
  endIso: string,
  events: CalendarEvent[],
): boolean {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return events.some((event) => {
    if (!eventBlocksTime(event)) return false;
    return intervalOverlap(start, end, new Date(event.start).getTime(), new Date(event.end).getTime());
  });
}

function inWorkingHours(start: Date, end: Date, timezone: string, workingHours: WorkingHours): boolean {
  const startParts = zonedParts(timezone, start);
  const endParts = zonedParts(timezone, end);
  if (!workingHours.days.includes(startParts.weekday)) return false;
  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;
  const workStart = parseHHMM(workingHours.start);
  const workEnd = parseHHMM(workingHours.end);
  const workStartMinutes = workStart.hour * 60 + workStart.minute;
  const workEndMinutes = workEnd.hour * 60 + workEnd.minute;
  return startMinutes >= workStartMinutes && endMinutes <= workEndMinutes;
}

function beforeWorkingHours(start: Date, timezone: string, workingHours: WorkingHours): boolean {
  const parts = zonedParts(timezone, start);
  const workStart = parseHHMM(workingHours.start);
  return parts.hour * 60 + parts.minute < workStart.hour * 60 + workStart.minute;
}

function slotsFromWindow(
  windowStart: Date,
  windowEnd: Date,
  duration: number,
  timezone: string,
  workingHours: WorkingHours,
): Date[] {
  const slots: Date[] = [];
  const seen = new Set<number>();
  const push = (date: Date) => {
    if (date.getTime() + duration * 60_000 > windowEnd.getTime()) return;
    if (seen.has(date.getTime())) return;
    seen.add(date.getTime());
    slots.push(date);
  };

  const workStartClock = parseHHMM(workingHours.start);
  const workStart = atZonedTime(timezone, windowStart, workStartClock.hour, workStartClock.minute);
  if (windowStart.getTime() < workStart.getTime() && workStart.getTime() + duration * 60_000 <= windowEnd.getTime()) {
    push(snapZonedDate(workStart, timezone));
  }
  push(snapZonedDate(windowStart, timezone));
  return slots;
}

function rank(suggestion: MoveSuggestion, originalStart: string, timezone: string, workingHours: WorkingHours): number[] {
  const start = new Date(suggestion.start);
  const sameDay = sameZonedDay(new Date(originalStart), start, timezone) ? 0 : 1;
  const early = beforeWorkingHours(start, timezone, workingHours) ? 1 : 0;
  const working = suggestion.working ? 0 : 1;
  return [sameDay, early, working, start.getTime()];
}

export function suggestMoveWindows(input: {
  event: CalendarEvent;
  events: CalendarEvent[];
  timezone: string;
  workingHours: WorkingHours;
  limit?: number;
  after: Date;
  workouts?: Workout[];
  afterWorkoutBufferMinutes?: number;
}): MoveSuggestion[] {
  const { event, timezone, workingHours } = input;
  const limit = input.limit ?? 3;
  const now = input.after;
  const others = othersForMove(input.events, event.id);
  const duration = eventDurationMinutes(event.start, event.end);
  const searchStart = availabilitySearchStart(now, timezone);
  const windows = findFreeTime({
    start: searchStart,
    end: addDays(startOfZonedDay(timezone, now), 2),
    durationMinutes: duration,
    events: others,
    timezone,
    workingHours,
    useWorkingHours: false,
    workouts: input.workouts,
    afterWorkoutBufferMinutes: input.afterWorkoutBufferMinutes ?? 0,
  });

  const seen = new Set<string>();
  const candidates: MoveSuggestion[] = [];

  for (const window of windows) {
    const windowStart = new Date(window.start);
    const windowEnd = new Date(window.end);
    if (windowEnd.getTime() <= now.getTime()) continue;
    const clippedStart = windowStart.getTime() < now.getTime() ? now : windowStart;
    for (const slotStart of slotsFromWindow(clippedStart, windowEnd, duration, timezone, workingHours)) {
      const slotEnd = addMinutes(slotStart, duration);
      if (slotStart.getTime() < now.getTime()) continue;
      if (slotStart.toISOString() === event.start) continue;
      if (
        proposedLocationConflicts({
          event,
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          events: input.events,
          workouts: input.workouts,
          afterWorkoutBufferMinutes: input.afterWorkoutBufferMinutes,
        })
      ) {
        continue;
      }
      const key = slotStart.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        start: key,
        end: slotEnd.toISOString(),
        minutes: duration,
        dateLabel: formatSuggestionSlot(key, slotEnd.toISOString(), timezone, now),
        label: formatSuggestionSlot(key, slotEnd.toISOString(), timezone, now),
        working: inWorkingHours(slotStart, slotEnd, timezone, workingHours),
      });
    }
  }

  return candidates
    .sort((left, right) => {
      const a = rank(left, event.start, timezone, workingHours);
      const b = rank(right, event.start, timezone, workingHours);
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index];
      }
      return 0;
    })
    .slice(0, limit)
    .sort((left, right) => left.start.localeCompare(right.start));
}
