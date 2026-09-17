import { formatDuration } from "../format";
import type { FreeWindow } from "../types/assistant";
import type { WorkingHours } from "../types/profile";
import { formatHourClock, formatHoursSpan } from "./hours";
import { findFreeTime, findOpenFragments, longestOpenMinutes } from "./freeTime";
import { planningFreeTimeOptions } from "./transitionBuffer";
import type { CalendarEvent } from "../types/event";
import type { UserProfile } from "../types/profile";
import type { Workout } from "../types/training";

export type NoSlotReason = "no_free_time" | "too_short" | "hours_too_short" | "outside_hours";

export type SlotSearchDiagnosis = {
  reason: NoSlotReason;
  hours: WorkingHours;
  hoursLabel: string;
  longestInside: number;
  longestOutside: number;
  remainingAfterLastBusy?: number;
  message: string;
};

export function diagnoseMissingSlot(input: {
  start: Date;
  end: Date;
  durationMinutes: number;
  events: CalendarEvent[];
  timezone: string;
  hours: WorkingHours;
  useHours: boolean;
  profile?: UserProfile;
  workouts?: Workout[];
  kindLabel?: string;
}): SlotSearchDiagnosis {
  const planning = planningFreeTimeOptions(input.profile, input.workouts);
  const inside = findOpenFragments({
    start: input.start,
    end: input.end,
    events: input.events,
    timezone: input.timezone,
    workingHours: input.hours,
    useWorkingHours: input.useHours,
    ...planning,
  });
  const unconstrained = findOpenFragments({
    start: input.start,
    end: input.end,
    events: input.events,
    timezone: input.timezone,
    workingHours: input.hours,
    useWorkingHours: false,
    ...planning,
  });
  const fitting = findFreeTime({
    start: input.start,
    end: input.end,
    durationMinutes: input.durationMinutes,
    events: input.events,
    timezone: input.timezone,
    workingHours: input.hours,
    useWorkingHours: input.useHours,
    ...planning,
  });
  const longestInside = longestOpenMinutes(inside);
  const longestOutside = longestOpenMinutes(unconstrained);
  const hoursLabel = formatHoursSpan(input.hours);
  const kind = input.kindLabel ?? "these hours";
  const duration = formatDuration(input.durationMinutes);

  if (fitting.length) {
    return {
      reason: "too_short",
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      message: "",
    };
  }

  if (longestInside <= 0 && longestOutside <= 0) {
    return {
      reason: "no_free_time",
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      message: "There is no remaining open time in that window.",
    };
  }

  if (input.useHours && longestInside < input.durationMinutes) {
    return {
      reason: longestOutside >= input.durationMinutes ? "outside_hours" : "hours_too_short",
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      remainingAfterLastBusy: longestInside,
      message: `${duration} will not fit before ${kind} end at ${formatHourClock(input.hours.end)}. I can look later, try another day, or a shorter block.`,
    };
  }

  return {
    reason: "too_short",
    hours: input.hours,
    hoursLabel,
    longestInside,
    longestOutside,
    message: `Nothing contiguous is long enough for ${duration} in ${kind} (${hoursLabel}). The longest open stretch is ${formatDuration(Math.max(longestInside, 1))}. I can look later, try another day, or a shorter duration.`,
  };
}

export function windowsFitDuration(windows: FreeWindow[], durationMinutes: number): FreeWindow[] {
  return windows.filter((window) => window.minutes >= durationMinutes);
}
