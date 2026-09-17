import { hoursEndInstant, hoursStartInstant, isMidnightEnd } from "../calendar/hours";
import { DAY_END_HOUR, DAY_START_HOUR } from "../config";
import { addDays, addMinutes, atZonedTime, startOfZonedDay, zonedLocalToUtc, zonedParts } from "../time";
import type { TimeHint } from "../types/assistant";
import type { WorkingHours } from "../types/profile";

export type ResolvedRange = {
  start: Date;
  end: Date;
};

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function weekdayFromName(value: string): TimeHint["weekday"] | undefined {
  const index = WEEKDAY_NAMES.indexOf(value.toLowerCase());
  return index >= 0 ? (index as TimeHint["weekday"]) : undefined;
}

export function resolveAnchorDay(hint: TimeHint | undefined, timezone: string, now: Date): Date {
  const today = startOfZonedDay(timezone, now);
  if (hint?.month && hint.dayOfMonth) {
    const parts = zonedParts(timezone, now);
    const year = hint.year ?? parts.year;
    return zonedLocalToUtc(timezone, year, hint.month, hint.dayOfMonth, 0, 0);
  }
  if (!hint || hint.day === "today") return today;
  if (hint.day === "tomorrow") return addDays(today, 1);
  if (hint.day === "weekday" && hint.weekday !== undefined) {
    const current = zonedParts(timezone, today).weekday;
    let delta = (hint.weekday - current + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(today, delta);
  }
  return today;
}

function partHours(
  part: TimeHint["part"],
  workingHours?: WorkingHours,
): { startHour: number; startMinute: number; endHour: number; endMinute: number } {
  if (part === "morning") return { startHour: DAY_START_HOUR, startMinute: 0, endHour: 12, endMinute: 0 };
  if (part === "afternoon") return { startHour: 12, startMinute: 0, endHour: 17, endMinute: 0 };
  if (part === "evening") return { startHour: 17, startMinute: 0, endHour: DAY_END_HOUR, endMinute: 0 };
  if (part === "working" && workingHours) {
    const [sh, sm] = workingHours.start.split(":").map(Number);
    const [eh, em] = workingHours.end.split(":").map(Number);
    return {
      startHour: sh || 9,
      startMinute: sm || 0,
      endHour: isMidnightEnd(workingHours.end) ? 24 : eh || 18,
      endMinute: isMidnightEnd(workingHours.end) ? 0 : em || 0,
    };
  }
  return { startHour: DAY_START_HOUR, startMinute: 0, endHour: DAY_END_HOUR, endMinute: 0 };
}

export function resolveSearchRange(
  hint: TimeHint | undefined,
  timezone: string,
  now: Date,
  workingHours?: WorkingHours,
): ResolvedRange {
  const day = resolveAnchorDay(hint, timezone, now);
  if (hint?.week === "next") {
    const today = startOfZonedDay(timezone, now);
    const weekday = zonedParts(timezone, today).weekday;
    const daysUntilNextMonday = ((8 - weekday) % 7) || 7;
    const start = addDays(today, daysUntilNextMonday);
    return { start, end: addDays(start, 7) };
  }
  if (hint?.hour !== undefined) {
    const start = atZonedTime(timezone, day, hint.hour, hint.minute ?? 0);
    const end = workingHours
      ? hoursEndInstant(timezone, day, workingHours.end)
      : atZonedTime(timezone, day, DAY_END_HOUR, 0);
    return { start, end: end.getTime() > start.getTime() ? end : addMinutes(start, 180) };
  }
  if (hint?.part === "later") {
    const end = workingHours
      ? hoursEndInstant(timezone, day, workingHours.end)
      : atZonedTime(timezone, day, DAY_END_HOUR, 0);
    return { start: now, end };
  }
  const hours = partHours(hint?.part, workingHours);
  const start =
    hours.startHour >= 24
      ? hoursStartInstant(timezone, day, "00:00")
      : atZonedTime(timezone, day, hours.startHour, hours.startMinute);
  const end =
    hours.endHour >= 24
      ? hoursEndInstant(timezone, day, "24:00")
      : atZonedTime(timezone, day, hours.endHour, hours.endMinute);
  return { start, end };
}

export function clipRangeToNow(range: ResolvedRange, now: Date): ResolvedRange {
  if (range.end.getTime() <= now.getTime()) return range;
  if (range.start.getTime() < now.getTime()) return { start: now, end: range.end };
  return range;
}

export function resolveExactStart(
  hint: TimeHint | undefined,
  timezone: string,
  now: Date,
  fallbackDay: Date,
): Date | undefined {
  if (hint?.hour === undefined) return undefined;
  const day = hint.day || hint.weekday !== undefined ? resolveAnchorDay(hint, timezone, now) : fallbackDay;
  return atZonedTime(timezone, day, hint.hour, hint.minute ?? 0);
}
