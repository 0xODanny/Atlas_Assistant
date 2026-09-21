import { formatDuration, formatDurationAdjective } from "../format";
import type { FreeWindow } from "../types/assistant";
import type { WorkingHours } from "../types/profile";
import { formatHourClock, formatHoursSpan, hoursEndInstant } from "./hours";
import { findFreeTime, findOpenFragments, longestOpenMinutes } from "./freeTime";
import { planningFreeTimeOptions } from "./transitionBuffer";
import type { CalendarEvent } from "../types/event";
import type { UserProfile } from "../types/profile";
import type { Workout } from "../types/training";

export type NoSlotReason =
  | "no_free_time"
  | "too_short"
  | "hours_too_short"
  | "outside_hours"
  | "hours_ended"
  | "buffer";

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
  boundLabel?: string;
  now?: Date;
  bufferMinutes?: number;
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
  const durationAdj = formatDurationAdjective(input.durationMinutes);
  const window = input.boundLabel ?? "that window";
  const hoursEnd =
    input.now && input.useHours ? hoursEndInstant(input.timezone, input.start, input.hours.end) : undefined;
  const hoursAlreadyEnded = Boolean(hoursEnd && input.now && input.now.getTime() >= hoursEnd.getTime());
  const insideNoBuffer = findOpenFragments({
    start: input.start,
    end: input.end,
    events: input.events,
    timezone: input.timezone,
    workingHours: input.hours,
    useWorkingHours: input.useHours,
  });
  const longestInsideNoBuffer = longestOpenMinutes(insideNoBuffer);

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

  if (hoursAlreadyEnded && input.useHours) {
    return {
      reason: "hours_ended",
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      message: `I couldn't find a ${durationAdj} opening ${window} within your ${kind}. Your ${kind} end at ${formatHourClock(input.hours.end)}.`,
    };
  }

  if (
    /workout/.test(kind) &&
    input.bufferMinutes &&
    input.bufferMinutes > 0 &&
    longestInside < input.durationMinutes &&
    longestInsideNoBuffer >= input.durationMinutes
  ) {
    return {
      reason: "buffer",
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      message: `Your ${formatDuration(input.bufferMinutes)} workout buffer leaves no eligible opening ${window}.`,
    };
  }

  if (longestInside <= 0 && longestOutside <= 0) {
    return {
      reason: "no_free_time",
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      message: `I couldn't find a ${durationAdj} opening ${window}. You're busy for the rest of your ${kind.replace(/ hours$/, "")} window ${window}.`,
    };
  }

  if (input.useHours && longestInside < input.durationMinutes) {
    const reason: NoSlotReason = longestOutside >= input.durationMinutes ? "outside_hours" : "hours_too_short";
    return {
      reason,
      hours: input.hours,
      hoursLabel,
      longestInside,
      longestOutside,
      remainingAfterLastBusy: longestInside,
      message:
        reason === "outside_hours"
          ? `I couldn't find a ${durationAdj} opening ${window} within your ${kind}. Your ${kind} end at ${formatHourClock(input.hours.end)}.`
          : `${duration} will not fit before ${kind} end at ${formatHourClock(input.hours.end)}. I can look later, try another day, or a shorter block.`,
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
