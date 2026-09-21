import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { parseScheduleFromText } from "../lib/assistant/parseSchedule";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { titleFromRequest } from "../lib/assistant/title";
import { createSeedState } from "../lib/data/seed";
import { addMinutes, atZonedTime, sameZonedDay, startOfZonedDay, zonedLocalToUtc, zonedParts } from "../lib/time";
import type { AssistantContext, ModelIntent } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";
import { DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES } from "../lib/calendar/transitionBuffer";
import { DEFAULT_WORKOUT_HOURS, resolveScheduleHours } from "../lib/calendar/hours";

const LA = "America/Los_Angeles";
const NOW = zonedLocalToUtc(LA, 2026, 9, 21, 12, 0);

function interpret(text: string, context: AssistantContext = ctx()): ModelIntent {
  return refineModelIntent(undefined, classifyIntent(text), text, context);
}

function ctx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: LA,
    profile: { ...state.profile, timezone: LA },
    events: [],
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    ...overrides,
  };
}

function timedEvent(
  id: string,
  title: string,
  hour: number,
  minute: number,
  durationMinutes: number,
): CalendarEvent {
  const start = atZonedTime(LA, NOW, hour, minute);
  return {
    id,
    title,
    description: "",
    start: start.toISOString(),
    end: addMinutes(start, durationMinutes).toISOString(),
    location: "",
    participants: [],
    privacy: "busy-only",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "meeting",
    status: "confirmed",
    calendarId: "local-primary",
    timezone: LA,
    demo: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function proposedStart(result: ReturnType<typeof fulfillIntent>) {
  const action = result.actions.find((item) => item.payload?.type === "createEvent");
  if (action?.payload?.type !== "createEvent") return undefined;
  return new Date(action.payload.event.start);
}

function assertSameLocalDay(date: Date, day: Date) {
  assert.equal(sameZonedDay(date, day, LA), true);
}

test("tonight is a hard today+evening bound, never an implicit tomorrow", () => {
  const parsed = parseScheduleFromText("Add a 15 minute yoga session for tonight. Recommend me a good time.");
  assert.equal(parsed.when?.day, "today");
  assert.equal(parsed.when?.part, "evening");
  assert.equal(parsed.when?.bound, "tonight");
  assert.equal(parsed.when?.hour, undefined);
  assert.equal(parsed.timingMode, "search");
  assert.equal(parsed.durationMinutes, 15);
});

test("production yoga tonight phrase stays tonight or returns no-slot", () => {
  const text = "Add a 15 minute yoga session for tonight. Recommend me a good time.";
  const intent = interpret(text);
  assert.equal(intent.when?.bound, "tonight");
  assert.equal(intent.when?.day, "today");
  assert.notEqual(intent.when?.day, "tomorrow");
  assert.equal(intent.title, "Yoga");
  const result = fulfillIntent(intent, ctx());
  const start = proposedStart(result);
  if (start) {
    assertSameLocalDay(start, NOW);
    assert.notEqual(zonedParts(LA, start).day, 22);
    assert.ok(zonedParts(LA, start).hour >= 17);
  } else {
    assert.match(result.message, /tonight|workout hours/i);
    assert.ok((result.followUps?.length ?? 0) >= 1);
  }
  assert.doesNotMatch(result.message, /for at/);
  assert.doesNotMatch(intent.title ?? "", /for$/i);
});

test("schedule a workout tonight searches tonight only", () => {
  const result = fulfillIntent(interpret("Schedule a workout tonight."), ctx());
  const start = proposedStart(result);
  if (start) {
    assertSameLocalDay(start, NOW);
    assert.ok(zonedParts(LA, start).hour >= 17);
  } else {
    assert.match(result.message, /tonight/i);
  }
  assert.equal(result.actions.some((item) => {
    if (item.payload?.type !== "createEvent") return false;
    return !sameZonedDay(new Date(item.payload.event.start), NOW, LA);
  }), false);
});

test("find 30 minutes today stays on today", () => {
  const intent = interpret("Find me 30 minutes today.");
  assert.equal(intent.when?.bound, "today");
  assert.equal(intent.when?.day, "today");
  const result = fulfillIntent(intent, ctx());
  const start = proposedStart(result);
  if (start) assertSameLocalDay(start, NOW);
  else assert.match(result.message, /today/i);
});

test("schedule a swim tomorrow stays on tomorrow", () => {
  const intent = interpret("Schedule a swim tomorrow.");
  assert.equal(intent.when?.bound, "tomorrow");
  const result = fulfillIntent(intent, ctx());
  const start = proposedStart(result);
  assert.ok(start);
  assertSameLocalDay(start, addMinutes(startOfZonedDay(LA, NOW), 24 * 60));
});

test("find a workout Monday stays on that Monday", () => {
  const intent = interpret("Find me a workout Monday.");
  assert.equal(intent.when?.bound, "weekday");
  assert.equal(intent.when?.weekday, 1);
  const result = fulfillIntent(intent, ctx());
  const start = proposedStart(result);
  if (start) {
    assert.equal(zonedParts(LA, start).weekday, 1);
  } else {
    assert.ok((result.followUps?.length ?? 0) >= 1);
  }
});

test("this evening keeps an evening boundary", () => {
  const parsed = parseScheduleFromText("Find me time this evening.");
  assert.equal(parsed.when?.part, "evening");
  assert.equal(parsed.when?.bound, "evening");
  const result = fulfillIntent(interpret("Find me time this evening."), ctx());
  const start = proposedStart(result);
  if (start) {
    assertSameLocalDay(start, NOW);
    assert.ok(zonedParts(LA, start).hour >= 17);
  }
});

test("unconstrained work search has no hard day bound", () => {
  const intent = interpret("Find me 30 minutes to work.");
  assert.equal(intent.when?.bound, undefined);
  assert.equal(intent.type, "find_time");
});

test("add yoga tonight at 8:30 is a fixed 20:30 tonight", () => {
  const intent = interpret("Add yoga tonight at 8:30.");
  assert.equal(intent.timingMode, "fixed");
  assert.equal(intent.when?.bound, "tonight");
  assert.equal(intent.when?.hour, 20);
  assert.equal(intent.when?.minute, 30);
  const result = fulfillIntent(intent, ctx());
  const start = proposedStart(result);
  assert.ok(start);
  assertSameLocalDay(start, NOW);
  const parts = zonedParts(LA, start);
  assert.equal(parts.hour, 20);
  assert.equal(parts.minute, 30);
});

test("no-slot from workout hours does not fall back to tomorrow", () => {
  const late = zonedLocalToUtc(LA, 2026, 9, 21, 20, 30);
  const intent = interpret("Find me 15 minutes for yoga tonight.");
  assert.equal(intent.when?.bound, "tonight");
  const result = fulfillIntent(intent, ctx({ now: late.toISOString() }));
  assert.equal(proposedStart(result), undefined);
  assert.match(result.message, /tonight|workout hours|8:00 PM|8 PM/i);
  assert.doesNotMatch(result.message, /9:00 AM/);
  assert.ok(result.followUps?.some((item) => /outside my workout hours/i.test(item.label)));
  assert.ok(result.followUps?.some((item) => /try tomorrow/i.test(item.label)));
});

test("no-slot from calendar conflicts does not fall back to tomorrow", () => {
  const intent = interpret("Schedule a workout tonight.");
  const result = fulfillIntent(
    intent,
    ctx({
      events: [
        timedEvent("busy1", "Dinner", 17, 0, 180),
        timedEvent("busy2", "Notes", 20, 0, 240),
      ],
    }),
  );
  assert.equal(proposedStart(result), undefined);
  assert.match(result.message, /tonight|busy|opening/i);
  assert.equal(
    result.actions.some((item) => item.payload?.type === "createEvent"),
    false,
  );
});

test("no-slot from current time does not fall back to tomorrow", () => {
  const night = zonedLocalToUtc(LA, 2026, 9, 21, 23, 15);
  const result = fulfillIntent(interpret("Add a 15 minute yoga session for tonight."), ctx({ now: night.toISOString() }));
  assert.equal(proposedStart(result), undefined);
  assert.match(result.message, /tonight|hours|opening/i);
  assert.ok(!result.actions.some((item) => item.payload?.type === "createEvent"));
});

test("2:49 PM LA production calendar keeps yoga tonight on Sep 21", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 14, 49);
  const text = "Add a 15 minute yoga session for tonight. Recommend me a good time.";
  const parsed = parseScheduleFromText(text);
  assert.deepEqual(parsed.when, { day: "today", part: "evening", bound: "tonight" });
  assert.equal(parsed.timingMode, "search");

  const context = productionAfternoonContext(now);
  assert.equal(context.profile.afterWorkoutBufferMinutes, DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES);
  const workoutHours = resolveScheduleHours(context.profile, "workout");
  assert.equal(workoutHours.start, DEFAULT_WORKOUT_HOURS.start);
  assert.equal(workoutHours.end, DEFAULT_WORKOUT_HOURS.end);

  const intent = refineModelIntent(undefined, classifyIntent(text), text, context);
  assert.equal(intent.type, "create_event");
  assert.equal(intent.category, "training");
  assert.equal(intent.title, "Yoga");
  assert.doesNotMatch(intent.title ?? "", /\bfor$/i);
  assert.equal(intent.when?.bound, "tonight");
  assert.equal(intent.when?.day, "today");
  assert.equal(intent.when?.part, "evening");
  assert.equal(intent.when?.hour, undefined);

  const result = fulfillIntent(intent, context);
  const start = proposedStart(result);
  assert.ok(start);
  const parts = zonedParts(LA, start);
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 9);
  assert.equal(parts.day, 21);
  assert.equal(parts.hour, 17);
  assert.equal(parts.minute, 0);
  assert.equal(sameZonedDay(start, now, LA), true);
  assert.doesNotMatch(result.message, /tomorrow|9:00 AM|for at/i);
  assert.equal(
    result.actions.some((item) => {
      if (item.payload?.type !== "createEvent") return false;
      return zonedParts(LA, new Date(item.payload.event.start)).day !== 21;
    }),
    false,
  );
  assert.equal(result.actions[0]?.payload?.type === "createEvent" ? result.actions[0].payload.event.title : "", "Yoga");
  for (const choice of result.choices ?? []) {
    assert.equal(zonedParts(LA, new Date(choice.start)).day, 21);
  }
});

function productionAfternoonContext(now: Date): AssistantContext {
  const state = createSeedState(now);
  const bikeStart = atZonedTime(LA, now, 7, 30);
  const meetingStart = atZonedTime(LA, now, 11, 0);
  const swimStart = atZonedTime(LA, now, 17, 30);
  const events = state.events.map((event) => {
    if (event.id === "evt_bike") {
      return { ...event, start: bikeStart.toISOString(), end: addMinutes(bikeStart, 60).toISOString(), timezone: LA };
    }
    if (event.id === "evt_pepinho") {
      return { ...event, start: meetingStart.toISOString(), end: addMinutes(meetingStart, 45).toISOString(), timezone: LA };
    }
    if (event.id === "evt_swim") {
      return { ...event, start: swimStart.toISOString(), end: addMinutes(swimStart, 60).toISOString(), timezone: LA };
    }
    return event;
  });
  return {
    now: now.toISOString(),
    timezone: LA,
    profile: { ...state.profile, timezone: LA },
    events,
    tasks: state.tasks,
    workouts: state.workouts.map((workout) => {
      if (workout.eventId === "evt_bike") return { ...workout, scheduledTime: bikeStart.toISOString() };
      if (workout.eventId === "evt_swim") return { ...workout, scheduledTime: swimStart.toISOString() };
      return workout;
    }),
    meetings: state.meetings,
  };
}

test("title extraction drops dangling scheduling prepositions", () => {
  assert.equal(titleFromRequest("Add a 15 minute yoga session for tonight"), "Yoga");
  assert.doesNotMatch(titleFromRequest("15 minute yoga session for tonight") ?? "", /for$/);
  const intent = interpret("Add a 15 minute yoga session for tonight. Recommend me a good time.");
  assert.equal(intent.title, "Yoga");
  assert.doesNotMatch(intent.title ?? "", /\bfor$/i);
});
