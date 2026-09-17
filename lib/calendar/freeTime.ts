import { DAY_END_HOUR, DAY_START_HOUR } from "../config";
import {
  addDays,
  atZonedTime,
  minutesBetween,
  startOfZonedDay,
  zonedParts,
} from "../time";
import { busyIntervals } from "./busy";
import { hoursEndInstant, hoursStartInstant } from "./hours";
import { workoutBufferIntervals } from "./transitionBuffer";
import type { CalendarEvent } from "../types/event";
import type { FreeWindow } from "../types/assistant";
import type { WorkingHours } from "../types/profile";
import type { Workout } from "../types/training";

export type FreeTimeInput = {
  start: Date;
  end: Date;
  durationMinutes: number;
  events: CalendarEvent[];
  timezone: string;
  workingHours?: WorkingHours;
  useWorkingHours?: boolean;
  workouts?: Workout[];
  afterWorkoutBufferMinutes?: number;
};

type Interval = { start: number; end: number };

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (!last || current.start > last.end) {
      merged.push({ ...current });
    } else {
      last.end = Math.max(last.end, current.end);
    }
  }
  return merged;
}

function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  let open = [window];
  for (const block of busy) {
    const next: Interval[] = [];
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

function dayWindow(
  timezone: string,
  day: Date,
  workingHours: WorkingHours | undefined,
  useWorkingHours: boolean,
): Interval | null {
  const parts = zonedParts(timezone, day);
  if (useWorkingHours && workingHours && !workingHours.days.includes(parts.weekday)) {
    return null;
  }
  const start = useWorkingHours && workingHours
    ? hoursStartInstant(timezone, day, workingHours.start).getTime()
    : atZonedTime(timezone, day, DAY_START_HOUR, 0).getTime();
  const end = useWorkingHours && workingHours
    ? hoursEndInstant(timezone, day, workingHours.end).getTime()
    : atZonedTime(timezone, day, DAY_END_HOUR, 0).getTime();
  if (end <= start) return null;
  return { start, end };
}

export function findFreeTime(input: FreeTimeInput): FreeWindow[] {
  const useWorkingHours = input.useWorkingHours ?? true;
  const rangeStart = input.start.getTime();
  const rangeEnd = input.end.getTime();
  const busy = mergeIntervals([
    ...busyIntervals(input.events, { start: rangeStart, end: rangeEnd }),
    ...workoutBufferIntervals(input.events, input.workouts, input.afterWorkoutBufferMinutes ?? 0, {
      start: rangeStart,
      end: rangeEnd,
    }),
  ]);

  const windows: FreeWindow[] = [];
  let cursor = startOfZonedDay(input.timezone, input.start);

  while (cursor.getTime() < rangeEnd) {
    const window = dayWindow(input.timezone, cursor, input.workingHours, useWorkingHours);
    cursor = addDays(cursor, 1);
    if (!window) continue;

    const clipped = {
      start: Math.max(window.start, rangeStart),
      end: Math.min(window.end, rangeEnd),
    };
    if (clipped.end <= clipped.start) continue;

    for (const open of subtractBusy(clipped, busy)) {
      const minutes = Math.round((open.end - open.start) / 60_000);
      if (minutes >= input.durationMinutes) {
        windows.push({
          start: new Date(open.start).toISOString(),
          end: new Date(open.end).toISOString(),
          minutes,
        });
      }
    }
  }

  return windows;
}

export function longestWindow(windows: FreeWindow[]): FreeWindow | undefined {
  return [...windows].sort((a, b) => b.minutes - a.minutes)[0];
}

function remainingWindow(window: FreeWindow, now?: Date): FreeWindow | undefined {
  if (!now) return window;
  const start = Math.max(new Date(window.start).getTime(), now.getTime());
  const end = new Date(window.end).getTime();
  if (end <= start) return undefined;
  const minutes = Math.round((end - start) / 60_000);
  if (minutes < 30) return undefined;
  return { start: new Date(start).toISOString(), end: window.end, minutes };
}

export function suggestFocusWindow(windows: FreeWindow[], timezone: string, now?: Date): FreeWindow | undefined {
  const usable = windows
    .map((window) => remainingWindow(window, now))
    .filter((window): window is FreeWindow => Boolean(window));
  const preferred = usable.find((window) => {
    const start = zonedParts(timezone, new Date(window.start));
    const end = zonedParts(timezone, new Date(window.end));
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    return startMinutes <= 13 * 60 && endMinutes >= 16 * 60;
  });
  if (preferred) {
    const start = laterOrExact(atZonedTime(timezone, new Date(preferred.start), 13, 0), now);
    const end = atZonedTime(timezone, new Date(preferred.start), 16, 0);
    if (end.getTime() <= start.getTime()) return longestWindow(usable);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      minutes: minutesBetween(start, end),
    };
  }
  return longestWindow(usable);
}

function laterOrExact(date: Date, now?: Date): Date {
  if (!now || date.getTime() >= now.getTime()) return date;
  return now;
}

export function totalOpenMinutes(windows: FreeWindow[]): number {
  return windows.reduce((sum, window) => sum + window.minutes, 0);
}

export function findOpenFragments(input: Omit<FreeTimeInput, "durationMinutes">): FreeWindow[] {
  return findFreeTime({ ...input, durationMinutes: 1 });
}

export function longestOpenMinutes(windows: FreeWindow[]): number {
  return windows.reduce((max, window) => Math.max(max, window.minutes), 0);
}
