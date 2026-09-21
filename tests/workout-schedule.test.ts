import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAssistantAction } from "../lib/assistant/apply";
import { classifyIntent } from "../lib/assistant/classify";
import { resolveChoiceFromText } from "../lib/assistant/followUp";
import { actionFromCreateChoice, fulfillIntent } from "../lib/assistant/fulfill";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { createEventAlreadyExists, historicalStartHour, resolveWorkoutDuration } from "../lib/calendar/workoutSchedule";
import { createMemoryStore } from "../lib/data/memory-store";
import { createSeedState } from "../lib/data/seed";
import { executeAssistantWrite } from "../lib/google/applyWrite";
import { atZonedTime } from "../lib/time";
import type { AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const TZ = "America/New_York";
const NOW = new Date("2026-09-17T19:24:00.000Z");

function ctx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: TZ,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    ...overrides,
  };
}

function realSwim(dayOffset: number, hour: number, minute = 30): CalendarEvent {
  const day = new Date(NOW);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  const start = atZonedTime(TZ, day, hour, minute);
  return {
    id: `gcal_swim_${dayOffset}`,
    title: "Swim",
    description: "",
    start: start.toISOString(),
    end: new Date(start.getTime() + 60 * 60_000).toISOString(),
    location: "",
    participants: [],
    privacy: "busy-only",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "training",
    status: "confirmed",
    providerEventId: `swim-${dayOffset}`,
    calendarId: "copicatxyz@gmail.com",
    demo: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

test("schedule a swim tomorrow is a working-hours fallback, not a learned habit", () => {
  const classified = classifyIntent("Schedule a swim tomorrow.");
  assert.equal(classified.type, "create_event");
  assert.equal(classified.durationMinutes, undefined);
  assert.equal(classified.durationRequested, false);
  const duration = resolveWorkoutDuration({
    requestedMinutes: classified.durationMinutes,
    durationRequested: classified.durationRequested,
    profile: ctx().profile,
    events: ctx().events,
    workouts: ctx().workouts,
    timezone: TZ,
    sport: "swim",
  });
  assert.equal(duration.source, "suggested");
  assert.equal(duration.minutes, 60);
  assert.equal(historicalStartHour(ctx().events, ctx().workouts, TZ, "swim"), undefined);
});

test("open-ended swim tomorrow offers dated alternatives and does not claim a usual time", () => {
  const result = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), ctx());
  assert.doesNotMatch(result.message, /proposed change|nothing has been added/i);
  assert.match(result.message, /Suggested duration: 60 minutes/);
  assert.match(result.message, /How about /);
  assert.ok(result.choices && result.choices.length >= 2);
  assert.ok(result.choices.length <= 3);
  assert.equal(result.choices[0]!.recommended, true);
  assert.doesNotMatch(result.choices[0]!.label, /Recommended/);
  for (const choice of result.choices) {
    assert.match(choice.label, /Tomorrow, Fri Sep 18/);
    assert.doesNotMatch(choice.reason ?? "", /pool|usual time|you always|30 minutes afterward/i);
  }
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.label, "Suggested swim");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  if (result.actions[0]?.payload?.type === "createEvent") {
    assert.equal(result.actions[0].payload.event.location ?? "", "");
    assert.equal(result.actions[0].payload.event.description ?? "", "");
  }
});

test("saved preference ranks that part of day without inventing history", () => {
  const base = ctx();
  const profile = {
    ...base.profile,
    trainingPreferences: {
      ...base.profile.trainingPreferences,
      schedule: { durationMinutes: 45, part: "evening" as const },
    },
  };
  const result = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), ctx({ profile }));
  assert.match(result.message, /Suggested duration: 45 minutes from your saved preference/);
  assert.ok(result.choices?.some((choice) => /PM/.test(choice.label) && /saved evening preference/.test(choice.reason ?? "")));
});

test("two real planned swims can ground a time; one cannot", () => {
  const one = ctx({ events: [...ctx().events, realSwim(-3, 7)] });
  assert.equal(historicalStartHour(one.events, one.workouts, TZ, "swim"), undefined);
  const many = ctx({ events: [...ctx().events, realSwim(-10, 7), realSwim(-3, 7)] });
  assert.equal(historicalStartHour(many.events, many.workouts, TZ, "swim"), 7);
  const result = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), many);
  assert.ok(result.choices?.some((choice) => /7:30 AM/.test(choice.label) && /scheduled this workout around/.test(choice.reason ?? "")));
  assert.doesNotMatch(result.message, /completed|usually swim/i);
});

test("explicit 45-minute 10 AM swim is honored without extra options", () => {
  const intent = classifyIntent("Schedule a 45-minute swim tomorrow at 10 AM.");
  assert.equal(intent.durationMinutes, 45);
  assert.equal(intent.durationRequested, true);
  assert.equal(intent.when?.hour, 10);
  const result = fulfillIntent(intent, ctx());
  assert.match(result.message, /45 minutes|10:00 AM/);
  assert.equal(result.choices?.length ?? 0, 0);
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  if (result.actions[0]?.payload?.type === "createEvent") {
    assert.equal(
      new Date(result.actions[0].payload.event.end).getTime() - new Date(result.actions[0].payload.event.start).getTime(),
      45 * 60_000,
    );
  }
});

test("make it 45 minutes updates the pending swim instead of creating another", () => {
  const first = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), ctx());
  const follow = classifyIntent("make it 45 minutes", first.pending);
  assert.equal(follow.durationMinutes, 45);
  assert.equal(follow.durationRequested, true);
  const second = fulfillIntent(follow, ctx());
  assert.equal(second.pending?.durationMinutes, 45);
  assert.ok(second.actions[0]?.payload?.type === "createEvent");
  if (second.actions[0]?.payload?.type === "createEvent") {
    assert.equal(
      new Date(second.actions[0].payload.event.end).getTime() - new Date(second.actions[0].payload.event.start).getTime(),
      45 * 60_000,
    );
  }
});

test("later and the second one keep a single pending recommendation", () => {
  const first = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), ctx());
  assert.ok(first.choices && first.choices.length >= 2);
  const later = fulfillIntent(classifyIntent("later", first.pending), ctx());
  assert.ok(later.choices?.every((choice) => new Date(choice.start).getUTCHours() >= 16));
  const picked = resolveChoiceFromText("the second one", first.choices);
  assert.ok(picked);
  assert.equal(picked.start, first.choices[1]?.start);
  const action = actionFromCreateChoice(ctx(), first.pending, picked);
  assert.equal(action?.kind, "propose");
  assert.equal(action?.payload?.type, "createEvent");
});

test("buffer conflicts and a full day produce usable recovery copy", () => {
  const busy: CalendarEvent[] = [];
  for (let hour = 7; hour < 20; hour += 1) {
    const start = atZonedTime(TZ, new Date("2026-09-18T12:00:00.000Z"), hour, 0);
    busy.push({
      ...realSwim(1, hour, 0),
      id: `block-${hour}`,
      title: "Busy",
      category: "work",
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60_000).toISOString(),
      demo: false,
    });
  }
  const none = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), ctx({ events: [...ctx().events, ...busy] }));
  assert.match(none.message, /could not find a free 1 hour window|different day or a shorter/i);
  assert.equal(none.actions.length, 0);

  const blocked = fulfillIntent(classifyIntent("Schedule a 60-minute swim tomorrow at 9 AM."), ctx({ events: [...ctx().events, ...busy] }));
  assert.match(blocked.message, /will not book over/i);
});

test("add to calendar writes once and rejects a duplicate", async () => {
  const store = createMemoryStore(createSeedState(NOW));
  const result = fulfillIntent(classifyIntent("Schedule a 45-minute swim tomorrow at 10 AM."), ctx());
  const action = result.actions[0];
  assert.ok(action);
  const written = applyAssistantAction(store, action);
  assert.equal(written.status, "applied");
  assert.equal(store.getState().events.filter((event) => event.title === "Swim" && event.demo !== true).length, 1);
  const again = await executeAssistantWrite(store, action);
  assert.equal(again.status, "proposed");
  assert.match(again.error ?? "", /already on the calendar/);
  assert.ok(createEventAlreadyExists(store.getState().events, "Swim", action.payload && action.payload.type === "createEvent" ? action.payload.event.start : ""));
});

test("refine still treats an OpenAI-invented duration as suggested when the user did not ask", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "create_event", sport: "swim", title: "Swim", durationMinutes: 60, when: { day: "tomorrow" } },
    "Schedule a swim tomorrow.",
    ctx(),
  );
  assert.equal(refined.durationRequested, false);
});
