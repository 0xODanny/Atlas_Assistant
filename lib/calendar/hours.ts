import { addDays, atZonedTime, parseHHMM, startOfZonedDay } from "../time";
import type { HourKind, ScheduleHours, SchedulingHours, UserProfile, WorkingHours } from "../types/profile";

export const WEEKDAY_FOCUS_DAYS = [1, 2, 3, 4, 5];
export const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const DEFAULT_FOCUS_HOURS: ScheduleHours = {
  start: "09:00",
  end: "24:00",
  days: [...WEEKDAY_FOCUS_DAYS],
  source: "default",
};

export const DEFAULT_MEETING_HOURS: ScheduleHours = {
  start: "09:00",
  end: "18:00",
  days: [...WEEKDAY_FOCUS_DAYS],
  source: "default",
};

export const DEFAULT_WORKOUT_HOURS: ScheduleHours = {
  start: "07:00",
  end: "20:00",
  days: [...ALL_WEEK_DAYS],
  source: "default",
};

export const DEFAULT_FOCUS_BLOCK_MINUTES = 90;

export const DEFAULT_SCHEDULING_HOURS: SchedulingHours = {
  focus: { ...DEFAULT_FOCUS_HOURS, days: [...DEFAULT_FOCUS_HOURS.days] },
  meeting: { ...DEFAULT_MEETING_HOURS, days: [...DEFAULT_MEETING_HOURS.days] },
  workout: { ...DEFAULT_WORKOUT_HOURS, days: [...DEFAULT_WORKOUT_HOURS.days] },
  focusBlockMinutes: DEFAULT_FOCUS_BLOCK_MINUTES,
  focusBlockSource: "default",
};

const LEGACY_DEFAULT_END = "18:00";
const LEGACY_DEFAULT_START = "09:00";

export function isMidnightEnd(value: string | undefined): boolean {
  if (!value) return false;
  const { hour, minute } = parseHHMM(value);
  return (hour === 0 && minute === 0) || hour >= 24;
}

export function normalizeHourEnd(value: string): string {
  return isMidnightEnd(value) ? "24:00" : value;
}

export function hoursEndInstant(timezone: string, day: Date, end: string): Date {
  if (isMidnightEnd(end)) {
    return addDays(startOfZonedDay(timezone, day), 1);
  }
  const clock = parseHHMM(end);
  return atZonedTime(timezone, day, clock.hour, clock.minute);
}

export function hoursStartInstant(timezone: string, day: Date, start: string): Date {
  const clock = parseHHMM(start);
  return atZonedTime(timezone, day, clock.hour, clock.minute);
}

export function toWorkingHours(hours: ScheduleHours): WorkingHours {
  return {
    start: hours.start,
    end: normalizeHourEnd(hours.end),
    days: [...hours.days],
  };
}

function sameDays(left: number[] | undefined, right: number[]): boolean {
  if (!left) return false;
  const a = [...left].sort((x, y) => x - y).join(",");
  const b = [...right].sort((x, y) => x - y).join(",");
  return a === b;
}

function isLegacyDefaultWorkingHours(hours: WorkingHours | undefined): boolean {
  if (!hours) return true;
  return (
    hours.start === LEGACY_DEFAULT_START &&
    hours.end === LEGACY_DEFAULT_END &&
    sameDays(hours.days, WEEKDAY_FOCUS_DAYS)
  );
}

export function defaultSchedulingHours(): SchedulingHours {
  return {
    focus: { ...DEFAULT_FOCUS_HOURS, days: [...DEFAULT_FOCUS_HOURS.days] },
    meeting: { ...DEFAULT_MEETING_HOURS, days: [...DEFAULT_MEETING_HOURS.days] },
    workout: { ...DEFAULT_WORKOUT_HOURS, days: [...DEFAULT_WORKOUT_HOURS.days] },
    focusBlockMinutes: DEFAULT_FOCUS_BLOCK_MINUTES,
    focusBlockSource: "default",
  };
}

export function migrateSchedulingHours(workingHours?: WorkingHours): SchedulingHours {
  const next = defaultSchedulingHours();
  if (!workingHours || isLegacyDefaultWorkingHours(workingHours)) return next;
  const explicitEnd = workingHours.end !== LEGACY_DEFAULT_END && !isMidnightEnd(workingHours.end);
  next.focus = {
    start: workingHours.start || DEFAULT_FOCUS_HOURS.start,
    end: explicitEnd ? normalizeHourEnd(workingHours.end) : DEFAULT_FOCUS_HOURS.end,
    days: workingHours.days?.length ? [...workingHours.days] : [...DEFAULT_FOCUS_HOURS.days],
    source: explicitEnd ? "user" : "default",
  };
  return next;
}

function normalizeScheduleHours(hours: ScheduleHours | undefined, fallback: ScheduleHours): ScheduleHours {
  if (!hours) return { ...fallback, days: [...fallback.days] };
  return {
    start: hours.start || fallback.start,
    end: normalizeHourEnd(hours.end || fallback.end),
    days: hours.days?.length ? [...hours.days] : [...fallback.days],
    source: hours.source === "user" ? "user" : "default",
  };
}

export function resolveSchedulingHours(profile?: Pick<UserProfile, "schedulingHours" | "workingHours">): SchedulingHours {
  if (profile?.schedulingHours) {
    return {
      focus: normalizeScheduleHours(profile.schedulingHours.focus, DEFAULT_FOCUS_HOURS),
      meeting: normalizeScheduleHours(profile.schedulingHours.meeting, DEFAULT_MEETING_HOURS),
      workout: normalizeScheduleHours(profile.schedulingHours.workout, DEFAULT_WORKOUT_HOURS),
      focusBlockMinutes:
        profile.schedulingHours.focusBlockMinutes && profile.schedulingHours.focusBlockMinutes > 0
          ? profile.schedulingHours.focusBlockMinutes
          : DEFAULT_FOCUS_BLOCK_MINUTES,
      focusBlockSource: profile.schedulingHours.focusBlockSource === "user" ? "user" : "default",
    };
  }
  return migrateSchedulingHours(profile?.workingHours);
}

export function resolveScheduleHours(
  profile: Pick<UserProfile, "schedulingHours" | "workingHours"> | undefined,
  kind: HourKind,
): WorkingHours {
  return toWorkingHours(resolveSchedulingHours(profile)[kind]);
}

export function hoursForEvent(
  profile: Pick<UserProfile, "schedulingHours" | "workingHours"> | undefined,
  event: { category?: string },
): WorkingHours {
  if (event.category === "training") return resolveScheduleHours(profile, "workout");
  if (event.category === "meeting") return resolveScheduleHours(profile, "meeting");
  return resolveScheduleHours(profile, "focus");
}

export function resolveFocusBlockMinutes(
  profile?: Pick<UserProfile, "schedulingHours" | "workingHours">,
): { minutes: number; source: "default" | "user" } {
  const scheduling = resolveSchedulingHours(profile);
  return {
    minutes: scheduling.focusBlockMinutes ?? DEFAULT_FOCUS_BLOCK_MINUTES,
    source: scheduling.focusBlockSource ?? "default",
  };
}

export function withUpdatedHours(
  current: SchedulingHours,
  kind: HourKind,
  patch: Partial<ScheduleHours>,
): SchedulingHours {
  return {
    ...current,
    [kind]: {
      ...current[kind],
      ...patch,
      days: patch.days ? [...patch.days] : [...current[kind].days],
      source: "user",
    },
  };
}

export function formatHourClock(value: string): string {
  if (isMidnightEnd(value)) return "midnight";
  const { hour, minute } = parseHHMM(value);
  const mer = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 || 12;
  if (minute === 0) return `${hour12} ${mer}`;
  return `${hour12}:${String(minute).padStart(2, "0")} ${mer}`;
}

export function formatHoursSpan(hours: Pick<ScheduleHours, "start" | "end">): string {
  return `${formatHourClock(hours.start)}–${formatHourClock(hours.end)}`;
}

export function normalizeProfileHours<T extends UserProfile>(profile: T): T {
  const schedulingHours = resolveSchedulingHours(profile);
  return {
    ...profile,
    schedulingHours,
    workingHours: toWorkingHours(schedulingHours.focus),
  };
}
