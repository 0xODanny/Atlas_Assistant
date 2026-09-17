import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDaySummaryMessage } from "../lib/assistant/daySummary";
import { classifyIntent } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { dayEventsFor } from "../lib/calendar/dayAgenda";
import { findFreeTime } from "../lib/calendar/freeTime";
import {
  DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES,
  describeWorkoutBufferAvailability,
  isRecognizedWorkout,
  planningConflicts,
  resolveAfterWorkoutBufferMinutes,
  tightTransitions,
  workoutBufferIntervals,
} from "../lib/calendar/transitionBuffer";
import { deserializeState, serializeState } from "../lib/data/serialize";
import { createSeedState } from "../lib/data/seed";
import { formatClockNatural, formatRangeNatural } from "../lib/format";
import type { AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";
import type { Workout } from "../lib/types/training";

const TZ = "America/New_York";
const NOON = new Date("2026-09-17T16:00:00.000Z");
const AFTERNOON = new Date("2026-09-17T18:22:00.000Z");
const WORK_START = new Date("2026-09-17T13:00:00.000Z");
const WORK_END = new Date("2026-09-17T22:00:00.000Z");

function workoutEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt_structured_ride",
    title: "Zone 2 ride",
    description: "",
    start: "2026-09-17T18:30:00.000Z",
    end: "2026-09-17T20:00:00.000Z",
    location: "",
    participants: [],
    privacy: "busy-only",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "training",
    status: "confirmed",
    workoutId: "workout_structured",
    demo: false,
    createdAt: NOON.toISOString(),
    updatedAt: NOON.toISOString(),
    ...overrides,
  };
}

function structuredWorkout(): Workout {
  return {
    id: "workout_structured",
    eventId: "evt_structured_ride",
    sport: "bike",
    duration: 90,
    intensity: "zone2",
    description: "Endurance",
    scheduledTime: "2026-09-17T18:30:00.000Z",
    completed: false,
    weatherDependent: false,
    createdAt: NOON.toISOString(),
    updatedAt: NOON.toISOString(),
  };
}

function recoveryBlock(): CalendarEvent {
  return {
    id: "evt_recovery",
    title: "Recovery stretch",
    description: "Cool-down and shower",
    start: "2026-09-17T20:00:00.000Z",
    end: "2026-09-17T20:30:00.000Z",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "personal",
    status: "confirmed",
    demo: false,
    createdAt: NOON.toISOString(),
    updatedAt: NOON.toISOString(),
  };
}

function tightMeeting(): CalendarEvent {
  return {
    id: "evt_tight_meet",
    title: "Standup",
    description: "",
    start: "2026-09-17T20:00:00.000Z",
    end: "2026-09-17T20:30:00.000Z",
    location: "",
    participants: [{ id: "marcus", name: "Marcus", role: "attendee" }],
    privacy: "shared",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "meeting",
    status: "confirmed",
    demo: false,
    createdAt: NOON.toISOString(),
    updatedAt: NOON.toISOString(),
  };
}

function contextWith(events: CalendarEvent[], extra?: Partial<AssistantContext>): AssistantContext {
  const state = createSeedState(NOON);
  return {
    now: AFTERNOON.toISOString(),
    timezone: TZ,
    profile: state.profile,
    events,
    tasks: [],
    workouts: [structuredWorkout()],
    meetings: [],
    connections: { google: { status: "connected" }, icloud: { status: "disconnected" }, telegram: { status: "disconnected" } },
    ...extra,
  };
}

test("default after-workout buffer is 30 minutes", () => {
  assert.equal(DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES, 30);
  assert.equal(resolveAfterWorkoutBufferMinutes({}), 30);
  assert.equal(createSeedState(NOON).profile.afterWorkoutBufferMinutes, 30);
});

test("workout 2:30–4 PM plus 30-minute buffer makes the earliest meeting 4:30 PM", () => {
  const event = workoutEvent();
  const workouts = [structuredWorkout()];
  assert.equal(isRecognizedWorkout(event, workouts), true);
  const windows = findFreeTime({
    start: WORK_START,
    end: WORK_END,
    durationMinutes: 30,
    events: [event],
    timezone: TZ,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    useWorkingHours: true,
    workouts,
    afterWorkoutBufferMinutes: 30,
  });
  const afterRide = windows.find((window) => new Date(window.start).getTime() >= new Date(event.end).getTime());
  assert.ok(afterRide);
  assert.equal(afterRide.start, "2026-09-17T20:30:00.000Z");
  assert.equal(afterRide.end, "2026-09-17T22:00:00.000Z");
  assert.equal(afterRide.minutes, 90);
  assert.equal(planningConflicts("2026-09-17T20:00:00.000Z", "2026-09-17T21:00:00.000Z", [event], {
    workouts,
    afterWorkoutBufferMinutes: 30,
  }), true);
  assert.equal(planningConflicts("2026-09-17T20:30:00.000Z", "2026-09-17T21:15:00.000Z", [event], {
    workouts,
    afterWorkoutBufferMinutes: 30,
  }), false);
});

test("working hours ending at 6 PM leave 90 usable minutes after the buffer", () => {
  const windows = findFreeTime({
    start: AFTERNOON,
    end: WORK_END,
    durationMinutes: 30,
    events: [workoutEvent()],
    timezone: TZ,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    useWorkingHours: true,
    workouts: [structuredWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.minutes, 90);
});

test("a 2-hour meeting is not offered in the 90-minute post-buffer window", () => {
  const result = fulfillIntent(
    { type: "find_time", durationMinutes: 120, eventHint: "marcus", when: { part: "working" } },
    contextWith([workoutEvent()]),
  );
  assert.equal(result.intentType, "find_time");
  assert.equal(result.choices?.length ?? 0, 0);
  assert.match(result.message, /2 hours will not fit before meeting hours end at 6 PM/);
  assert.doesNotMatch(result.message, /4:00 PM–6:00 PM/);
  assert.doesNotMatch(result.message, /no remaining open time/);
});

test("When can Marcus and I meet uses my availability and does not claim mutual confirmation", () => {
  const classified = classifyIntent("When can Marcus and I meet?");
  assert.equal(classified.type, "find_time");
  const refined = refineModelIntent(
    undefined,
    { type: "answer", topic: "open_time" },
    "When can Marcus and I meet?",
    contextWith([workoutEvent()]),
  );
  assert.equal(refined.type, "find_time");
  assert.equal(refined.eventHint, "marcus");
  const result = fulfillIntent(classified, contextWith([workoutEvent()]));
  assert.match(result.message, /Your availability; Marcus's not checked/);
  assert.doesNotMatch(result.message, /invitation has been sent|mutual/i);
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
});

test("settings buffer changes persist and update suggestions", () => {
  const state = createSeedState(NOON);
  assert.equal(state.profile.afterWorkoutBufferMinutes, 30);
  state.profile.afterWorkoutBufferMinutes = 45;
  const restored = deserializeState(serializeState(state));
  assert.ok(restored);
  assert.equal(restored.profile.afterWorkoutBufferMinutes, 45);
  assert.equal(resolveAfterWorkoutBufferMinutes(restored.profile), 45);

  const windows = findFreeTime({
    start: WORK_START,
    end: WORK_END,
    durationMinutes: 30,
    events: [workoutEvent()],
    timezone: TZ,
    workingHours: restored.profile.workingHours,
    useWorkingHours: true,
    workouts: [structuredWorkout()],
    afterWorkoutBufferMinutes: resolveAfterWorkoutBufferMinutes(restored.profile),
  });
  const afterRide = windows.find((window) => new Date(window.start).getTime() >= Date.parse("2026-09-17T20:00:00.000Z"));
  assert.equal(afterRide?.start, "2026-09-17T20:45:00.000Z");
});

test("calendar event times and counts stay unchanged when a buffer is applied", () => {
  const event = workoutEvent();
  const start = event.start;
  const end = event.end;
  const events = [event];
  findFreeTime({
    start: WORK_START,
    end: WORK_END,
    durationMinutes: 30,
    events,
    timezone: TZ,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    workouts: [structuredWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  assert.equal(event.start, start);
  assert.equal(event.end, end);
  assert.equal(dayEventsFor(events, NOON, TZ).length, 1);
  assert.equal(workoutBufferIntervals(events, [structuredWorkout()], 30).length, 1);
});

test("an explicit recovery block that covers the buffer is not double-counted", () => {
  const events = [workoutEvent(), recoveryBlock()];
  const leftovers = workoutBufferIntervals(events, [structuredWorkout()], 30);
  assert.equal(leftovers.length, 0);
  const windows = findFreeTime({
    start: WORK_START,
    end: WORK_END,
    durationMinutes: 30,
    events,
    timezone: TZ,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    useWorkingHours: true,
    workouts: [structuredWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  const afterRide = windows.find((window) => new Date(window.start).getTime() >= Date.parse("2026-09-17T20:00:00.000Z"));
  assert.equal(afterRide?.start, "2026-09-17T20:30:00.000Z");
});

test("a meeting that overlaps the buffer is flagged and not silently moved", () => {
  const events = [workoutEvent(), tightMeeting()];
  const flags = tightTransitions(events, [structuredWorkout()], 30);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]?.event.title, "Standup");
  const summary = buildDaySummaryMessage({
    events,
    timezone: TZ,
    now: AFTERNOON,
    dayStart: NOON,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    workouts: [structuredWorkout()],
    profile: { afterWorkoutBufferMinutes: 30 },
  });
  assert.match(summary, /tight transition/);
  assert.match(summary, /have not moved it/);
  const reorg = fulfillIntent({ type: "reorganize_day", when: { day: "today" } }, contextWith(events, { now: NOON.toISOString() }));
  const moved = reorg.actions.filter((action) => action.payload?.type === "updateEvent");
  assert.equal(moved.length, 0);
  assert.equal(events.find((event) => event.id === "evt_tight_meet")?.start, "2026-09-17T20:00:00.000Z");
});

test("day summary explains the buffer in natural language", () => {
  const event = workoutEvent({ title: "Bike" });
  const message = describeWorkoutBufferAvailability({
    workout: event,
    bufferMinutes: 30,
    windowStart: "2026-09-17T20:30:00.000Z",
    windowEnd: "2026-09-17T22:00:00.000Z",
    timezone: TZ,
  });
  assert.equal(formatClockNatural(event.end, TZ), "4 PM");
  assert.equal(formatRangeNatural("2026-09-17T20:30:00.000Z", "2026-09-17T22:00:00.000Z", TZ), "4:30–6 PM");
  assert.equal(
    message,
    "Bike ends at 4 PM. Allowing 30 minutes to shower and get ready, you're available from 4:30–6 PM.",
  );
  const result = fulfillIntent({ type: "answer", topic: "day" }, contextWith([event]));
  assert.match(result.message, /Bike ends at 4 PM/);
  assert.match(result.message, /4:30 PM–12 AM/);
  assert.match(result.actions[0]?.summary ?? "", /1 event/);
});
