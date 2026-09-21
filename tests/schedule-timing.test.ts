import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent, durationFromText } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { parseScheduleFromText } from "../lib/assistant/parseSchedule";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { findPlanningConflict, planningConflicts, workoutBufferIntervals } from "../lib/calendar/transitionBuffer";
import { createSeedState } from "../lib/data/seed";
import { addMinutes, atZonedTime, zonedLocalToUtc, zonedParts } from "../lib/time";
import type { AssistantContext, ModelIntent } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const LA = "America/Los_Angeles";
const NY = "America/New_York";
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
  timezone = LA,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  const start = atZonedTime(timezone, NOW, hour, minute);
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
    category: extra.category ?? "meeting",
    status: "confirmed",
    calendarId: "local-primary",
    timezone,
    demo: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...extra,
  };
}

function proposedRange(result: ReturnType<typeof fulfillIntent>, timezone: string) {
  const action = result.actions[0];
  assert.equal(action?.payload?.type, "createEvent");
  if (action?.payload?.type !== "createEvent") throw new Error("expected createEvent");
  return {
    start: zonedParts(timezone, new Date(action.payload.event.start)),
    end: zonedParts(timezone, new Date(action.payload.event.end)),
    event: action.payload.event,
  };
}

test("add swim today at 18:00 for 45 minutes is a fixed 18:00–18:45 slot", () => {
  const intent = interpret("add swim today at 18:00 for 45 minutes");
  assert.equal(intent.type, "create_event");
  assert.equal(intent.timingMode, "fixed");
  assert.equal(intent.when?.day, "today");
  assert.equal(intent.when?.hour, 18);
  assert.equal(intent.when?.minute, 0);
  assert.equal(intent.durationMinutes, 45);
  const proposed = proposedRange(fulfillIntent(intent, ctx()), LA);
  assert.equal(proposed.start.hour, 18);
  assert.equal(proposed.start.minute, 0);
  assert.equal(proposed.end.hour, 18);
  assert.equal(proposed.end.minute, 45);
});

test("add swim today from 18h for 45 minutes is clock 18:00, not a 1080-minute duration", () => {
  const intent = interpret("add swim today from 18h for 45 minutes");
  assert.equal(intent.timingMode, "fixed");
  assert.equal(intent.when?.hour, 18);
  assert.equal(intent.when?.minute, 0);
  assert.equal(intent.durationMinutes, 45);
  assert.notEqual(intent.durationMinutes, 1080);
  const proposed = proposedRange(fulfillIntent(intent, ctx()), LA);
  assert.equal(proposed.start.hour, 18);
  assert.equal(proposed.end.minute, 45);
});

test("swim today 18:00 to 18:45 is a fixed range", () => {
  const parsed = parseScheduleFromText("swim today 18:00 to 18:45");
  assert.equal(parsed.timingMode, "fixed");
  assert.equal(parsed.when?.hour, 18);
  assert.equal(parsed.when?.minute, 0);
  assert.equal(parsed.when?.endHour, 18);
  assert.equal(parsed.when?.endMinute, 45);
  assert.equal(parsed.rangeMinutes, 45);
  const intent = interpret("swim today 18:00 to 18:45");
  assert.equal(intent.type, "create_event");
  assert.equal(intent.when?.endHour, 18);
  assert.equal(intent.when?.endMinute, 45);
  const proposed = proposedRange(fulfillIntent(intent, ctx()), LA);
  assert.equal(proposed.start.hour, 18);
  assert.equal(proposed.start.minute, 0);
  assert.equal(proposed.end.hour, 18);
  assert.equal(proposed.end.minute, 45);
});

test("add swim at 6 PM for 45 minutes is fixed 18:00–18:45", () => {
  const intent = interpret("add swim at 6 PM for 45 minutes");
  assert.equal(intent.timingMode, "fixed");
  assert.equal(intent.when?.hour, 18);
  assert.equal(intent.durationMinutes, 45);
  const proposed = proposedRange(fulfillIntent(intent, ctx()), LA);
  assert.equal(proposed.start.hour, 18);
  assert.equal(proposed.end.minute, 45);
});

test("find me 45 minutes to swim today is search mode with no fixed start", () => {
  const intent = interpret("find me 45 minutes to swim today");
  assert.equal(intent.type, "find_time");
  assert.equal(intent.timingMode, "search");
  assert.equal(intent.durationMinutes, 45);
  assert.equal(intent.when?.hour, undefined);
});

test("find me 45 minutes after 18:00 searches from 18:00 instead of requiring that start", () => {
  const intent = interpret("find me 45 minutes after 18:00");
  assert.equal(intent.type, "find_time");
  assert.equal(intent.timingMode, "search");
  assert.equal(intent.when?.hour, 18);
  assert.equal(intent.when?.minute, 0);
  const busy = timedEvent("evt_six", "Wrap-up", 18, 0, 20);
  const result = fulfillIntent(intent, ctx({ events: [busy] }));
  assert.equal(result.intentType, "find_time");
  const action = result.actions[0];
  assert.equal(action?.payload?.type, "createEvent");
  if (action?.payload?.type !== "createEvent") throw new Error("expected createEvent");
  const start = zonedParts(LA, new Date(action.payload.event.start));
  assert.ok(start.hour * 60 + start.minute >= 18 * 60 + 20);
  assert.notEqual(start.hour * 60 + start.minute, 18 * 60);
});

test("Marcus at 16:30–17:00 does not reject a requested 18:00–18:45 swim", () => {
  const marcus = timedEvent("evt_marcus", "Marcus", 16, 30, 30);
  const intent = interpret("add a swim workout for today 18:00 at Stanford pool. duration is 45 minutes");
  assert.equal(intent.timingMode, "fixed");
  assert.equal(intent.when?.hour, 18);
  const result = fulfillIntent(intent, ctx({ events: [marcus] }));
  const proposed = proposedRange(result, LA);
  assert.equal(proposed.start.hour, 18);
  assert.equal(proposed.end.minute, 45);
  assert.doesNotMatch(result.message, /will not book over|conflicts with/i);
});

test("a 18:15 conflict keeps the requested 18:00 start instead of silently moving it", () => {
  const overlap = timedEvent("evt_overlap", "Team standup", 18, 15, 30);
  const intent = interpret("add swim today 18:00 to 18:45");
  const result = fulfillIntent(intent, ctx({ events: [overlap] }));
  assert.match(result.message, /conflicts with Team standup/i);
  assert.match(result.message, /will not change that start time/i);
  assert.equal(result.actions.length, 0);
  assert.equal(result.actions[0]?.payload?.type, undefined);
});

test("post-workout buffer blocks through 19:15 without shifting the 18:00–18:45 event", () => {
  const intent = interpret("add swim today at 18:00 for 45 minutes");
  const result = fulfillIntent(intent, ctx());
  const proposed = proposedRange(result, LA);
  assert.equal(proposed.start.hour, 18);
  assert.equal(proposed.end.hour, 18);
  assert.equal(proposed.end.minute, 45);
  const swim: CalendarEvent = {
    ...timedEvent("evt_swim", "Swim", 18, 0, 45, LA, { category: "training" }),
    start: proposed.event.start,
    end: proposed.event.end,
  };
  const buffers = workoutBufferIntervals([swim], [], 30);
  assert.equal(buffers.length, 1);
  assert.equal(zonedParts(LA, new Date(buffers[0]!.start)).hour, 18);
  assert.equal(zonedParts(LA, new Date(buffers[0]!.start)).minute, 45);
  assert.equal(zonedParts(LA, new Date(buffers[0]!.end)).hour, 19);
  assert.equal(zonedParts(LA, new Date(buffers[0]!.end)).minute, 15);
  const duringBuffer = atZonedTime(LA, NOW, 19, 0);
  assert.equal(
    planningConflicts(
      duringBuffer.toISOString(),
      addMinutes(duringBuffer, 10).toISOString(),
      [swim],
      { afterWorkoutBufferMinutes: 30 },
    ),
    true,
  );
  const afterBuffer = atZonedTime(LA, NOW, 19, 15);
  assert.equal(
    planningConflicts(
      afterBuffer.toISOString(),
      addMinutes(afterBuffer, 15).toISOString(),
      [swim],
      { afterWorkoutBufferMinutes: 30 },
    ),
    false,
  );
});

test("duration 18h still means 1080 minutes", () => {
  assert.equal(durationFromText("duration 18h"), 1080);
  assert.equal(parseScheduleFromText("duration 18h").when?.hour, undefined);
  assert.equal(parseScheduleFromText("from 18h today").durationMinutes, undefined);
});

test("18:00 local stays 18:00 in Pacific and Eastern instead of shifting to 17:00", () => {
  for (const timezone of [LA, NY]) {
    const now = zonedLocalToUtc(timezone, 2026, 9, 21, 12, 0);
    const intent = interpret("add a swim workout for today 18:00 at Stanford pool. duration is 45 minutes");
    const result = fulfillIntent(
      intent,
      ctx({
        now: now.toISOString(),
        timezone,
        profile: { ...ctx().profile, timezone },
      }),
    );
    const proposed = proposedRange(result, timezone);
    assert.equal(proposed.start.hour, 18);
    assert.equal(proposed.start.minute, 0);
    assert.equal(proposed.end.hour, 18);
    assert.equal(proposed.end.minute, 45);
    assert.equal(proposed.event.start, zonedLocalToUtc(timezone, 2026, 9, 21, 18, 0).toISOString());
  }
});

test("real failing phrases keep a fixed 18:00 swim instead of 16:30 or 17:00", () => {
  const phrases = [
    "Also Add a workout for today, Swim at Stanford pool for today, 18:00 to 18:45pm",
    "why ain't you add a swim workout then from 18h today?",
    "add a swim workout for today 18:00 at Stanford pool. duration is 45 minutes",
  ];
  const marcus = timedEvent("evt_marcus", "Marcus", 16, 30, 30);
  for (const phrase of phrases) {
    const intent = interpret(phrase);
    assert.equal(intent.timingMode, "fixed", phrase);
    assert.equal(intent.when?.hour, 18, phrase);
    assert.equal(intent.when?.minute, 0, phrase);
    assert.notEqual(intent.durationMinutes, 1080, phrase);
    if (phrase.includes("18:45") || phrase.includes("45 minutes")) {
      assert.equal(intent.durationMinutes ?? parseScheduleFromText(phrase).rangeMinutes, 45, phrase);
    }
    if (/stanford pool/i.test(phrase)) {
      assert.match(intent.location ?? "", /stanford pool/i);
    }
    const result = fulfillIntent(intent, ctx({ events: [marcus] }));
    const proposed = proposedRange(result, LA);
    assert.equal(proposed.start.hour, 18, phrase);
    assert.equal(proposed.start.minute, 0, phrase);
    if (phrase.includes("18:45") || phrase.includes("45 minutes")) {
      assert.equal(proposed.end.hour, 18, phrase);
      assert.equal(proposed.end.minute, 45, phrase);
    }
    assert.doesNotMatch(result.message, /existing event at 4:30|16:30|5:00 PM/i);
  }
});

test("a model-invented 16:30 is overwritten by the user's 18:00", () => {
  const refined = refineModelIntent(
    undefined,
    {
      type: "create_event",
      sport: "swim",
      when: { day: "today", hour: 16, minute: 30 },
      durationMinutes: 45,
    },
    "add a swim workout for today 18:00 at Stanford pool. duration is 45 minutes",
    ctx(),
  );
  assert.equal(refined.when?.hour, 18);
  assert.equal(refined.when?.minute, 0);
  assert.equal(refined.timingMode, "fixed");
  assert.equal(refined.durationMinutes, 45);
});

test("planning conflict names the overlapping 18:15 event, not the requested start", () => {
  const overlap = timedEvent("evt_overlap", "Team standup", 18, 15, 30);
  const start = atZonedTime(LA, NOW, 18, 0).toISOString();
  const end = atZonedTime(LA, NOW, 18, 45).toISOString();
  const conflict = findPlanningConflict(start, end, [overlap]);
  assert.equal(conflict?.kind, "event");
  if (conflict?.kind === "event") assert.equal(conflict.event.title, "Team standup");
});

test("clock-time aliases 18h, 18h00, at 18, and 6 tonight parse as 18:00", () => {
  for (const phrase of ["from 18h", "at 18h00", "at 18", "at 18:00", "at 6 tonight", "at 6:00 PM"]) {
    const parsed = parseScheduleFromText(`add swim today ${phrase} for 45 minutes`);
    assert.equal(parsed.when?.hour, 18, phrase);
    assert.equal(parsed.when?.minute, 0, phrase);
    assert.notEqual(parsed.durationMinutes, 1080, phrase);
  }
});
