import { eventBlocksTime } from "../calendar/busy";
import { dayEventPhase, dayEventsFor } from "../calendar/dayAgenda";
import { findFreeTime, suggestFocusWindow } from "../calendar/freeTime";
import { resolveScheduleHours } from "../calendar/hours";
import { isUpcomingMeeting } from "../calendar/meetings";
import {
  isRecognizedWorkout,
  planningFreeTimeOptions,
  resolveAfterWorkoutBufferMinutes,
} from "../calendar/transitionBuffer";
import {
  eventDurationMinutes,
  formatAllDayLabel,
  formatClock,
  formatClockNatural,
  formatExactDuration,
  formatHoursMinutes,
  formatRange,
  formatUninterruptedSpan,
  greetingEditorial,
  greetingOnly,
  remainingOpenLabel,
} from "../format";
import { participantSummary, presentEventRow } from "../present/event";
import { resolveEventKind } from "../present/eventColor";
import { nextActiveEvent } from "../present/status";
import { linkedMeeting, linkedWorkout } from "../prepare/content";
import { startOfZonedDay, zonedLocalToUtc, zonedParts } from "../time";
import { availabilitySearchStart } from "../time/clock";
import type { CalendarEvent } from "../types/event";
import type { Meeting } from "../types/meeting";
import type { UserProfile } from "../types/profile";
import type { Task } from "../types/task";
import type { Workout } from "../types/training";
import type {
  BriefEvent,
  BriefItem,
  BriefLine,
  BriefNextEvent,
  BriefNote,
  BriefOpenBlock,
  MorningBrief,
} from "./model";

export type { BriefEvent, BriefItem, BriefLine, BriefNote, BriefOpenBlock, MorningBrief } from "./model";

const SMALL_OPEN_MINUTES = 30;
const MEANINGFUL_OPEN_MINUTES = 60;
const FOCUS_OPEN_MINUTES = 90;
const TIGHT_GAP_MINUTES = 15;

function nextZonedDay(timezone: string, dayStart: Date): Date {
  const parts = zonedParts(timezone, dayStart);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return zonedLocalToUtc(timezone, utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), 0, 0);
}

function isTrainingEvent(event: CalendarEvent, workouts: Workout[]): boolean {
  if (event.status === "cancelled" || event.allDay) return false;
  if (isRecognizedWorkout(event, workouts)) return true;
  return resolveEventKind({
    category: event.category,
    title: event.title,
    description: event.description,
    workoutId: event.workoutId,
  }) === "workout";
}

export function dedupeBriefEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const result: CalendarEvent[] = [];
  for (const event of events) {
    const key = event.providerEventId
      ? `${event.providerEventId}|${event.start}|${event.end}`
      : `${event.title.trim().toLowerCase()}|${event.start}|${event.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

function classifyOpenBlocks(windows: Array<{ start: string; end: string; minutes: number }>): BriefOpenBlock[] {
  const ranked = windows
    .filter((window) => window.minutes >= SMALL_OPEN_MINUTES)
    .map((window) => ({
      start: window.start,
      end: window.end,
      minutes: window.minutes,
      usefulness:
        window.minutes >= FOCUS_OPEN_MINUTES
          ? ("focus" as const)
          : window.minutes >= MEANINGFUL_OPEN_MINUTES
            ? ("meaningful" as const)
            : ("small" as const),
    }))
    .sort((left, right) => right.minutes - left.minutes || left.start.localeCompare(right.start));
  const hasMeaningful = ranked.some((block) => block.usefulness !== "small");
  return ranked.filter((block) => block.usefulness !== "small" || !hasMeaningful);
}

function usableOpenMinutes(windows: Array<{ minutes: number }>): number {
  return windows
    .filter((window) => window.minutes >= SMALL_OPEN_MINUTES)
    .reduce((sum, window) => sum + window.minutes, 0);
}

function meaningfulOpenMinutesFrom(windows: Array<{ minutes: number }>): number {
  return windows
    .filter((window) => window.minutes >= MEANINGFUL_OPEN_MINUTES)
    .reduce((sum, window) => sum + window.minutes, 0);
}

function toBriefEvent(
  event: CalendarEvent,
  now: Date,
  timezone: string,
  workouts: Workout[],
  meetings: Meeting[],
  selfName: string,
): BriefEvent {
  const workout = linkedWorkout(event, workouts);
  const meeting = linkedMeeting(event, meetings);
  const row = presentEventRow({ event, timezone, workout, meeting, selfName });
  const location = event.location && !/^https?:\/\//i.test(event.location) ? event.location : undefined;
  return {
    eventId: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    minutes: eventDurationMinutes(event.start, event.end),
    allDay: Boolean(event.allDay),
    blocksTime: eventBlocksTime(event),
    category: event.category,
    kind: resolveEventKind({
      category: event.category,
      title: event.title,
      description: event.description,
      workoutId: event.workoutId,
      sport: workout?.sport,
    }),
    training: isTrainingEvent(event, workouts),
    location,
    calendarId: event.calendarId,
    source: event.source,
    phase: dayEventPhase(event, now),
    preparationRequired: event.preparationRequired,
    preparationMinutes: event.preparationMinutes,
    meta: row.meta,
    detail: row.detail,
  };
}

function briefEventLine(input: {
  event: CalendarEvent;
  workout?: Workout;
  meeting?: Meeting;
  timezone: string;
  selfName: string;
  now: Date;
}): BriefLine {
  const { event, workout, meeting, timezone, selfName, now } = input;
  const row = presentEventRow({ event, timezone, workout, meeting, selfName });
  const lines: string[] = [];
  if (event.category === "training") {
    if (row.detail) lines.push(row.detail);
    if (workout?.weatherDependent) {
      lines.push("Indoor alternative available if weather changes.");
    }
  } else if (event.category === "meeting" && event.preparationRequired) {
    lines.push(`${event.preparationMinutes} minutes of preparation recommended.`);
  } else if (row.detail) {
    lines.push(row.detail);
  }

  const people = participantSummary(event, selfName);
  const minutes = eventDurationMinutes(event.start, event.end);
  let meta = row.meta;
  if (!event.allDay && event.category === "meeting" && people) {
    meta = `${formatHoursMinutes(minutes)} · ${people}`;
  }

  return {
    kind: "event",
    eventId: event.id,
    start: event.start,
    timeLabel: event.allDay ? formatAllDayLabel(event.start, event.end, timezone) : formatClock(event.start, timezone),
    heading: event.title.toUpperCase(),
    meta,
    lines,
    action: event.category === "meeting" && event.preparationRequired && isUpcomingMeeting(event, now) ? "prepare" : undefined,
  };
}

function detectIssues(
  events: CalendarEvent[],
  workouts: Workout[],
  timezone: string,
  bufferMinutes: number,
): BriefNote[] {
  const timed = events
    .filter((event) => !event.allDay && event.status !== "cancelled" && eventBlocksTime(event))
    .sort((left, right) => left.start.localeCompare(right.start));
  const notes: BriefNote[] = [];

  for (let index = 0; index < timed.length; index += 1) {
    const current = timed[index]!;
    for (const other of timed.slice(index + 1)) {
      if (new Date(other.start).getTime() >= new Date(current.end).getTime()) break;
      if (new Date(other.end).getTime() <= new Date(current.start).getTime()) continue;
      notes.push({
        id: `overlap:${current.id}:${other.id}`,
        kind: "overlap",
        text: `${current.title} overlaps ${other.title}.`,
        start: current.start,
        end: other.end,
      });
    }
  }

  for (let index = 0; index < timed.length - 1; index += 1) {
    const current = timed[index]!;
    const next = timed[index + 1]!;
    const gap = Math.round((new Date(next.start).getTime() - new Date(current.end).getTime()) / 60_000);
    if (gap < 0) continue;
    if (isRecognizedWorkout(current, workouts) && bufferMinutes > 0 && gap < bufferMinutes) {
      notes.push({
        id: `buffer:${current.id}:${next.id}`,
        kind: "workout_buffer",
        text: `${current.title} ends at ${formatClockNatural(current.end, timezone)} and ${next.title} starts at ${formatClockNatural(next.start, timezone)}, leaving only ${formatHoursMinutes(gap)}.`,
        start: current.end,
        end: next.start,
      });
      continue;
    }
    if (gap <= TIGHT_GAP_MINUTES) {
      notes.push({
        id: `tight:${current.id}:${next.id}`,
        kind: "tight_transition",
        text: `${current.title} ends at ${formatClockNatural(current.end, timezone)} and your next commitment starts at ${formatClockNatural(next.start, timezone)}, leaving only ${formatHoursMinutes(gap)}.`,
        start: current.end,
        end: next.start,
      });
    }
  }

  return notes.slice(0, 3);
}

function buildObservations(input: {
  events: BriefEvent[];
  workouts: BriefEvent[];
  openBlocks: BriefOpenBlock[];
  generatedAt: Date;
  timezone: string;
}): BriefNote[] {
  const notes: BriefNote[] = [];
  const timed = input.events.filter((event) => !event.allDay);
  if (input.workouts.length > 0) {
    notes.push({
      id: "workouts",
      kind: "observation",
      text:
        input.workouts.length === 1
          ? "You have one workout today."
          : `You have ${input.workouts.length} workouts today.`,
    });
  }
  const longest = input.openBlocks[0];
  if (longest && longest.minutes >= MEANINGFUL_OPEN_MINUTES) {
    notes.push({
      id: "longest",
      kind: "observation",
      text: `Your longest open block is ${formatHoursMinutes(longest.minutes)}.`,
      start: longest.start,
      end: longest.end,
    });
  }
  const hour = zonedParts(input.timezone, input.generatedAt).hour;
  const morningMeetings = timed.filter(
    (event) => event.category === "meeting" && zonedParts(input.timezone, new Date(event.start)).hour < 12,
  );
  if (hour < 12 && timed.some((event) => event.category === "meeting") && morningMeetings.length === 0) {
    notes.push({
      id: "no-morning-meetings",
      kind: "observation",
      text: "You have no meetings this morning.",
    });
  }
  const afternoonEvents = timed.filter((event) => zonedParts(input.timezone, new Date(event.start)).hour >= 12);
  const afternoonOpen = input.openBlocks
    .filter((block) => zonedParts(input.timezone, new Date(block.start)).hour >= 12)
    .reduce((sum, block) => sum + block.minutes, 0);
  if (afternoonOpen >= 180 && afternoonEvents.length <= 1 && timed.length >= 2) {
    notes.push({
      id: "afternoon-open",
      kind: "observation",
      text: "Your afternoon is mostly open.",
    });
  }
  const lateEvents = timed.filter((event) => zonedParts(input.timezone, new Date(event.start)).hour >= 17);
  if (lateEvents.length >= 2 && timed.length - lateEvents.length <= 2) {
    notes.push({
      id: "busy-evening",
      kind: "observation",
      text: "Your schedule becomes busy after 5 PM.",
    });
  }
  if (timed.length >= 3 && notes.length < 4) {
    notes.push({
      id: "event-count",
      kind: "observation",
      text: `You have ${timed.length} events today.`,
    });
  }
  return notes.slice(0, 4);
}

function eventBefore(events: CalendarEvent[], startIso: string): CalendarEvent | undefined {
  return [...events]
    .filter((event) => !event.allDay && eventBlocksTime(event) && event.end <= startIso)
    .sort((left, right) => right.end.localeCompare(left.end))[0];
}

function eventAfter(events: CalendarEvent[], endIso: string): CalendarEvent | undefined {
  return events
    .filter((event) => !event.allDay && eventBlocksTime(event) && event.start >= endIso)
    .sort((left, right) => left.start.localeCompare(right.start))[0];
}

function buildRecommendations(input: {
  openBlocks: BriefOpenBlock[];
  events: CalendarEvent[];
  workouts: BriefEvent[];
  issues: BriefNote[];
  timezone: string;
}): BriefNote[] {
  const notes: BriefNote[] = [];
  const longest = input.openBlocks[0];
  if (longest && longest.minutes >= MEANINGFUL_OPEN_MINUTES) {
    const before = eventBefore(input.events, longest.start);
    const after = eventAfter(input.events, longest.end);
    const between =
      before && after && longest.minutes >= FOCUS_OPEN_MINUTES
        ? `You have enough room for focused work between ${before.title} and ${after.title}.`
        : longest.usefulness === "focus"
          ? `You have a ${formatHoursMinutes(longest.minutes)} focus window from ${formatRange(longest.start, longest.end, input.timezone)}.`
          : `Your largest uninterrupted block is ${formatRange(longest.start, longest.end, input.timezone)}.`;
    notes.push({
      id: "use-longest",
      kind: "recommendation",
      text: between,
      start: longest.start,
      end: longest.end,
    });
  }
  const tight = input.issues.find((issue) => issue.kind === "workout_buffer" || issue.kind === "tight_transition");
  if (tight) {
    const sourceId = tight.id.split(":")[1];
    const workout =
      input.workouts.find((item) => item.eventId === sourceId) ??
      input.workouts.find((item) => item.phase !== "completed");
    if (workout && workout.phase !== "completed") {
      notes.push({
        id: "tight-after-training",
        kind: "recommendation",
        text: `Your evening is tightly scheduled after ${workout.title}.`,
        start: workout.end,
      });
    }
  }
  return notes.slice(0, 3);
}

function currentBlockingEvents(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const stamp = now.getTime();
  return events
    .filter((event) => !event.allDay && event.status !== "cancelled" && eventBlocksTime(event))
    .filter((event) => stamp >= new Date(event.start).getTime() && stamp < new Date(event.end).getTime())
    .sort((left, right) => left.start.localeCompare(right.start));
}

function nextEventCard(event: CalendarEvent, now: Date, timezone: string): BriefNextEvent {
  const current = now.getTime() >= new Date(event.start).getTime() && now.getTime() < new Date(event.end).getTime();
  return {
    eventId: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    status: current ? "now" : "next",
    timeLabel: current
      ? `Now: ${event.title} until ${formatClock(event.end, timezone)}`
      : `Next: ${event.title} at ${formatClock(event.start, timezone)}`,
    concurrentCount: current ? 1 : undefined,
  };
}

function overlappingNowCard(events: CalendarEvent[]): BriefNextEvent {
  const last = events[events.length - 1]!;
  const titles = events.map((event) => event.title);
  return {
    eventId: events[0]!.id,
    title: `${events.length} events in progress`,
    start: events[0]!.start,
    end: last.end,
    status: "now",
    timeLabel: `Now: ${titles.join(" · ")}`,
    concurrentCount: events.length,
  };
}

export function generateBrief(input: {
  now: Date;
  profile: UserProfile;
  events: CalendarEvent[];
  tasks: Task[];
  workouts: Workout[];
  meetings?: Meeting[];
}): MorningBrief {
  const { profile } = input;
  const meetings = input.meetings ?? [];
  const timezone = profile.timezone;
  const dayStart = startOfZonedDay(timezone, input.now);
  const dayEnd = nextZonedDay(timezone, dayStart);
  const todaysEvents = dedupeBriefEvents(dayEventsFor(input.events, input.now, timezone));
  const planning = planningFreeTimeOptions(profile, input.workouts);
  const windows = findFreeTime({
    start: availabilitySearchStart(input.now, timezone),
    end: dayEnd,
    durationMinutes: SMALL_OPEN_MINUTES,
    events: todaysEvents,
    timezone,
    workingHours: resolveScheduleHours(profile, "focus"),
    useWorkingHours: true,
    ...planning,
  });
  const openBlocks = classifyOpenBlocks(windows);
  const bestFocus = suggestFocusWindow(windows, timezone, input.now);
  const important = input.tasks.filter((task) => task.important && !task.completed);
  const events = todaysEvents.map((event) =>
    toBriefEvent(event, input.now, timezone, input.workouts, meetings, profile.displayName),
  );
  const workouts = events.filter((event) => event.training);
  const allDayEvents = events.filter((event) => event.allDay);
  const timed = todaysEvents.filter((event) => !event.allDay);
  const overlappingNow = currentBlockingEvents(timed, input.now);
  const nextSource = nextActiveEvent(timed, input.now);
  const nextEvent =
    overlappingNow.length >= 2
      ? overlappingNowCard(overlappingNow)
      : nextSource
        ? nextEventCard(nextSource, input.now, timezone)
        : undefined;
  const issues = detectIssues(todaysEvents, input.workouts, timezone, resolveAfterWorkoutBufferMinutes(profile));
  const observations = buildObservations({
    events,
    workouts,
    openBlocks,
    generatedAt: input.now,
    timezone,
  });
  const recommendations = buildRecommendations({
    openBlocks,
    events: todaysEvents,
    workouts,
    issues,
    timezone,
  });
  const busyMinutes = timed.filter((event) => eventBlocksTime(event)).reduce((sum, event) => sum + eventDurationMinutes(event.start, event.end), 0);
  const remainingOpen = usableOpenMinutes(windows);
  const meaningfulOpenMinutes = meaningfulOpenMinutesFrom(windows);

  const items: BriefItem[] = todaysEvents.map((event) => {
    const workout = linkedWorkout(event, input.workouts);
    const meeting = linkedMeeting(event, meetings);
    const row = presentEventRow({
      event,
      timezone,
      workout,
      meeting,
      selfName: profile.displayName,
    });
    return {
      eventId: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      minutes: eventDurationMinutes(event.start, event.end),
      preparationRequired: event.preparationRequired,
      preparationMinutes: event.preparationMinutes,
      category: event.category,
      meta: row.meta,
      detail: row.detail,
    };
  });

  const timeline: BriefLine[] = todaysEvents.map((event) =>
    briefEventLine({
      event,
      workout: linkedWorkout(event, input.workouts),
      meeting: linkedMeeting(event, meetings),
      timezone,
      selfName: profile.displayName,
      now: input.now,
    }),
  );

  if (bestFocus) {
    timeline.push({
      kind: "focus",
      start: bestFocus.start,
      timeLabel: remainingOpenLabel(bestFocus.start, bestFocus.end, timezone),
      heading: "BEST FOCUS WINDOW",
      lines: [`${formatUninterruptedSpan(bestFocus.minutes)}.`],
    });
    timeline.sort((left, right) => left.start.localeCompare(right.start));
  }

  const greeting = greetingEditorial(input.now.toISOString(), timezone, profile.displayName);
  const lead =
    todaysEvents.length === 0
      ? "Your calendar is clear today."
      : `${greeting} Here's your day.`;

  return {
    date: dayStart.toISOString(),
    timezone,
    generatedAt: input.now.toISOString(),
    greeting: greetingOnly(input.now.toISOString(), timezone),
    lead,
    eventCount: todaysEvents.length,
    openMinutes: remainingOpen,
    summary: `${todaysEvents.length} ${todaysEvents.length === 1 ? "event" : "events"} today · ${formatExactDuration(remainingOpen)} open`,
    glance: {
      eventCount: todaysEvents.length,
      workoutCount: workouts.length,
      busyMinutes,
      openMinutes: remainingOpen,
      meaningfulOpenMinutes,
    },
    nextEvent,
    events,
    workouts,
    allDayEvents,
    openBlocks,
    observations,
    issues,
    recommendations,
    timeline,
    items,
    bestFocus,
    important,
    prepItems: todaysEvents
      .filter(
        (event) =>
          event.preparationRequired &&
          event.preparationMinutes > 0 &&
          (event.category === "meeting"
            ? isUpcomingMeeting(event, input.now)
            : event.category === "work"),
      )
      .map((event) => ({
        eventId: event.id,
        title: event.title,
        minutes: event.preparationMinutes,
      })),
  };
}

