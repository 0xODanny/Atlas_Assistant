import { isDemoEvent, isDemoWorkout } from "../data/sample";
import {
  eventDurationMinutes,
  formatClockNatural,
  formatDuration,
  formatDurationMinutes,
  formatRangeNatural,
  formatRelativeDayDate,
  formatSuggestionSlot,
} from "../format";
import { linkedWorkout } from "../prepare/content";
import { addDays, addMinutes, atZonedTime, sameZonedDay, startOfZonedDay, zonedParts } from "../time";
import { availabilitySearchStart, laterInstant } from "../time/clock";
import type { TimeHint } from "../types/assistant";
import type { CalendarEvent } from "../types/event";
import type { UserProfile } from "../types/profile";
import type { Sport, Workout, WorkoutSchedulePreference } from "../types/training";
import { findFreeTime } from "./freeTime";
import { resolveScheduleHours } from "./hours";
import { firstSnappedSlot, snapZonedDate } from "./snap";
import { planningConflicts, planningFreeTimeOptions, resolveAfterWorkoutBufferMinutes } from "./transitionBuffer";
import { clipRangeToNow, resolveAnchorDay, resolveExactStart, resolveSearchRange } from "../assistant/resolveTime";

export const SUGGESTED_WORKOUT_DURATION_MINUTES = 60;
const HISTORY_MIN = 2;
const DIVERSE_GAP_MINUTES = 120;

export type DurationSource = "requested" | "preference" | "history" | "suggested";

export type DurationResolution = {
  minutes: number;
  source: DurationSource;
};

export type WorkoutSlotOption = {
  start: string;
  end: string;
  label: string;
  reason: string;
  recommended: boolean;
};

export function workoutSchedulePreference(
  profile: UserProfile,
  sport?: Sport,
): WorkoutSchedulePreference {
  const sportPref = sport ? profile.trainingPreferences.sports?.[sport] : undefined;
  const general = profile.trainingPreferences.schedule ?? {};
  return {
    durationMinutes: sportPref?.durationMinutes ?? general.durationMinutes,
    part: sportPref?.part ?? general.part,
    startHour: sportPref?.startHour ?? general.startHour,
  };
}

function learnableEvents(
  events: CalendarEvent[],
  workouts: Workout[],
  sport?: Sport,
): CalendarEvent[] {
  return events
    .filter((event) => event.status !== "cancelled" && !event.allDay && !isDemoEvent(event))
    .filter((event) => {
      const workout = linkedWorkout(event, workouts);
      if (workout && isDemoWorkout(workout)) return false;
      if (sport) {
        if (workout?.sport === sport) return true;
        return event.category === "training" && event.title.toLowerCase().includes(sport);
      }
      return event.category === "training";
    })
    .sort((left, right) => left.start.localeCompare(right.start));
}

function uniqueByZonedDay(events: CalendarEvent[], timezone: string): CalendarEvent[] {
  const seen = new Set<string>();
  const unique: CalendarEvent[] = [];
  for (const event of events) {
    const parts = zonedParts(timezone, new Date(event.start));
    const key = `${parts.year}-${parts.month}-${parts.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }
  return unique;
}

export function historicalDurationMinutes(
  events: CalendarEvent[],
  workouts: Workout[],
  timezone: string,
  sport?: Sport,
): number | undefined {
  const samples = uniqueByZonedDay(learnableEvents(events, workouts, sport), timezone).map((event) =>
    eventDurationMinutes(event.start, event.end),
  );
  return modeIfRepeated(samples);
}

export function historicalStartHour(
  events: CalendarEvent[],
  workouts: Workout[],
  timezone: string,
  sport?: Sport,
): number | undefined {
  return historicalStartClock(events, workouts, timezone, sport)?.hour;
}

export function historicalStartClock(
  events: CalendarEvent[],
  workouts: Workout[],
  timezone: string,
  sport?: Sport,
): { hour: number; minute: number } | undefined {
  const samples = uniqueByZonedDay(learnableEvents(events, workouts, sport), timezone).map((event) => {
    const parts = zonedParts(timezone, new Date(event.start));
    return parts.hour * 60 + parts.minute;
  });
  const mode = modeIfRepeated(samples);
  if (mode === undefined) return undefined;
  return { hour: Math.floor(mode / 60), minute: mode % 60 };
}

function modeIfRepeated(values: number[]): number | undefined {
  if (values.length < HISTORY_MIN) return undefined;
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: { value: number; count: number } | undefined;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best && best.count >= HISTORY_MIN ? best.value : undefined;
}

export function resolveWorkoutDuration(input: {
  requestedMinutes?: number;
  durationRequested?: boolean;
  profile: UserProfile;
  events: CalendarEvent[];
  workouts: Workout[];
  timezone: string;
  sport?: Sport;
}): DurationResolution {
  if (input.durationRequested && input.requestedMinutes && input.requestedMinutes > 0) {
    return { minutes: input.requestedMinutes, source: "requested" };
  }
  const pref = workoutSchedulePreference(input.profile, input.sport);
  if (pref.durationMinutes && pref.durationMinutes > 0) {
    return { minutes: pref.durationMinutes, source: "preference" };
  }
  const learned = historicalDurationMinutes(input.events, input.workouts, input.timezone, input.sport);
  if (learned) return { minutes: learned, source: "history" };
  return { minutes: SUGGESTED_WORKOUT_DURATION_MINUTES, source: "suggested" };
}

function partOfHour(hour: number): NonNullable<TimeHint["part"]> {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function slotReason(input: {
  start: string;
  end: string;
  events: CalendarEvent[];
  profile: UserProfile;
  workouts: Workout[];
  timezone: string;
  duration: DurationResolution;
  pref: WorkoutSchedulePreference;
  historicalClock?: { hour: number; minute: number };
}): string {
  const buffer = resolveAfterWorkoutBufferMinutes(input.profile);
  const bufferEnd = addMinutes(new Date(input.end), buffer);
  const bufferFits =
    buffer > 0 &&
    !planningConflicts(input.end, bufferEnd.toISOString(), input.events, planningFreeTimeOptions(input.profile, input.workouts));
  const hour = zonedParts(input.timezone, new Date(input.start)).hour;
  if (input.pref.startHour !== undefined && hour === input.pref.startHour) {
    return `That matches your saved ${formatClockNatural(input.start, input.timezone)} preference.`;
  }
  if (input.pref.part && partOfHour(hour) === input.pref.part) {
    return `That matches your saved ${input.pref.part} preference.`;
  }
  if (
    input.historicalClock &&
    hour === input.historicalClock.hour &&
    zonedParts(input.timezone, new Date(input.start)).minute === input.historicalClock.minute
  ) {
    return `You've scheduled this workout around ${formatClockNatural(input.start, input.timezone)} before.`;
  }
  void bufferFits;
  return `You have an open ${formatDuration(input.duration.minutes)} then.`;
}

function candidateStarts(
  windowStart: Date,
  windowEnd: Date,
  timezone: string,
  clocks: Array<{ hour: number; minute?: number }>,
): Date[] {
  const starts: Date[] = [];
  const push = (date: Date) => {
    if (date.getTime() < windowStart.getTime() || date.getTime() >= windowEnd.getTime()) return;
    if (starts.some((item) => item.getTime() === date.getTime())) return;
    starts.push(date);
  };
  push(snapZonedDate(windowStart, timezone));
  for (const clock of clocks) {
    push(snapZonedDate(atZonedTime(timezone, windowStart, clock.hour, clock.minute ?? 0), timezone));
  }
  return starts.sort((left, right) => left.getTime() - right.getTime());
}

function laterSearchStart(hint: TimeHint | undefined, timezone: string, now: Date): Date | undefined {
  if (hint?.part !== "later") return undefined;
  const day = resolveAnchorDay(hint, timezone, now);
  if (sameZonedDay(now, day, timezone)) return now;
  return atZonedTime(timezone, day, 12, 0);
}

export function recommendWorkoutSlots(input: {
  now: Date;
  timezone: string;
  profile: UserProfile;
  events: CalendarEvent[];
  workouts: Workout[];
  duration: DurationResolution;
  when?: TimeHint;
  sport?: Sport;
  limit?: number;
}): WorkoutSlotOption[] {
  const { now, timezone, profile, events, workouts, duration } = input;
  const pref = workoutSchedulePreference(profile, input.sport);
  const historicalClock = historicalStartClock(events, workouts, timezone, input.sport);
  const laterStart = laterSearchStart(input.when, timezone, now);
  const rawRange = resolveSearchRange(
    {
      ...input.when,
      part: input.when?.part === "working" ? undefined : input.when?.part,
    },
    timezone,
    now,
    profile.workingHours,
  );
  const range = clipRangeToNow(
    {
      start: laterStart ? laterInstant(rawRange.start, laterStart) : rawRange.start,
      end: rawRange.end,
    },
    now,
  );
  const searchEnd = range.end.getTime() <= range.start.getTime() ? addDays(range.start, 1) : range.end;
  const windows = findFreeTime({
    start: laterInstant(range.start, availabilitySearchStart(now, timezone)),
    end: searchEnd,
    durationMinutes: duration.minutes,
    events,
    timezone,
    workingHours: resolveScheduleHours(profile, "workout"),
    useWorkingHours: input.when?.part !== "morning" && input.when?.part !== "evening" && input.when?.part !== "afternoon",
    ...planningFreeTimeOptions(profile, workouts),
  });

  const preferredClocks: Array<{ hour: number; minute?: number }> = [
    { hour: 9, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 17, minute: 0 },
  ];
  if (pref.startHour !== undefined) preferredClocks.push({ hour: pref.startHour, minute: 0 });
  if (historicalClock) preferredClocks.push(historicalClock);
  const planning = planningFreeTimeOptions(profile, workouts);
  const scored: Array<WorkoutSlotOption & { score: number }> = [];

  for (const window of windows) {
    const windowStart = new Date(window.start);
    const windowEnd = new Date(window.end);
    for (const startDate of candidateStarts(windowStart, windowEnd, timezone, preferredClocks)) {
      const slot = firstSnappedSlot(startDate.toISOString(), window.end, duration.minutes, timezone);
      if (!slot) continue;
      if (new Date(slot.start).getTime() < now.getTime()) continue;
      if (planningConflicts(slot.start, slot.end, events, planning)) continue;
      const hour = zonedParts(timezone, new Date(slot.start)).hour;
      const part = partOfHour(hour);
      let score = 0;
      if (input.when?.part && input.when.part !== "later" && input.when.part !== "working" && part === input.when.part) {
        score += 120;
      }
      if (pref.startHour !== undefined && hour === pref.startHour) score += 100;
      if (pref.part && part === pref.part) score += 80;
      if (
        historicalClock &&
        hour === historicalClock.hour &&
        zonedParts(timezone, new Date(slot.start)).minute === historicalClock.minute
      ) {
        score += 60;
      }
      if (hour >= 9 && hour < 18) score += 8;
      score -= Math.round((new Date(slot.start).getTime() - now.getTime()) / 3_600_000);
      if (scored.some((item) => item.start === slot.start)) continue;
      scored.push({
        start: slot.start,
        end: slot.end,
        label: formatSuggestionSlot(slot.start, slot.end, timezone, now),
        reason: slotReason({
          start: slot.start,
          end: slot.end,
          events,
          profile,
          workouts,
          timezone,
          duration,
          pref,
          historicalClock,
        }),
        recommended: false,
        score,
      });
    }
  }

  scored.sort((left, right) => right.score - left.score || left.start.localeCompare(right.start));
  const picked: typeof scored = [];
  for (const candidate of scored) {
    if (
      picked.some(
        (item) =>
          Math.abs(new Date(item.start).getTime() - new Date(candidate.start).getTime()) < DIVERSE_GAP_MINUTES * 60_000,
      )
    ) {
      continue;
    }
    picked.push(candidate);
    if (picked.length >= (input.limit ?? 3)) break;
  }
  return picked.map((item, index) => ({
    start: item.start,
    end: item.end,
    label: item.label,
    reason: item.reason,
    recommended: index === 0,
  }));
}

export function recommendedWorkoutMessage(input: {
  title: string;
  slot: WorkoutSlotOption;
  duration: DurationResolution;
  timezone: string;
  now: Date;
  bufferMinutes?: number;
}): string {
  const clock = formatClockNatural(input.slot.start, input.timezone);
  const day = sameZonedDay(input.now, new Date(input.slot.start), input.timezone)
    ? "today"
    : sameZonedDay(addDays(startOfZonedDay(input.timezone, input.now), 1), new Date(input.slot.start), input.timezone)
      ? "tomorrow"
      : formatRelativeDayDate(input.slot.start, input.timezone, input.now);
  const bufferNote =
    input.bufferMinutes && input.bufferMinutes > 0
      ? ` Atlas keeps ${formatDuration(input.bufferMinutes)} after a workout so you can shower and get ready. That is planning time, not a calendar event.`
      : "";
  const lead = `How about ${clock} ${day}? ${input.slot.reason}${bufferNote}`;
  const durationLead =
    input.duration.source === "requested"
      ? ""
      : input.duration.source === "preference"
        ? `Suggested duration: ${formatDurationMinutes(input.duration.minutes)} from your saved preference. `
        : input.duration.source === "history"
          ? `Suggested duration: ${formatDurationMinutes(input.duration.minutes)}, from your past planned sessions. `
          : `Suggested duration: ${formatDurationMinutes(input.duration.minutes)}. `;
  return `${durationLead}${lead}`;
}

export function describeAddedWorkout(input: {
  title: string;
  start: string;
  end: string;
  timezone: string;
  now: Date;
}): string {
  const day = sameZonedDay(input.now, new Date(input.start), input.timezone)
    ? "today"
    : sameZonedDay(addDays(startOfZonedDay(input.timezone, input.now), 1), new Date(input.start), input.timezone)
      ? "tomorrow"
      : formatRelativeDayDate(input.start, input.timezone, input.now);
  return `${input.title} added for ${day}, ${formatRangeNatural(input.start, input.end, input.timezone)}.`;
}

export function exactWorkoutStart(when: TimeHint | undefined, timezone: string, now: Date): Date | undefined {
  return resolveExactStart(when, timezone, now, now);
}

export function createEventAlreadyExists(
  events: CalendarEvent[],
  title: string,
  start: string,
): CalendarEvent | undefined {
  const needle = title.trim().toLowerCase();
  return events.find(
    (event) =>
      event.status !== "cancelled" &&
      event.title.trim().toLowerCase() === needle &&
      event.start === start,
  );
}
