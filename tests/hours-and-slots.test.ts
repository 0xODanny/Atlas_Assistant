import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import {
  DEFAULT_FOCUS_HOURS,
  DEFAULT_MEETING_HOURS,
  hoursEndInstant,
  isMidnightEnd,
  migrateSchedulingHours,
  resolveSchedulingHours,
} from "../lib/calendar/hours";
import { mergeCalendarEvents } from "../lib/google/merge";
import { createSeedState } from "../lib/data/seed";
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

function bikeBlock(): CalendarEvent {
  const start = atZonedTime(TZ, NOW, 15, 45);
  return {
    id: "evt_bike_reg",
    title: "Bike",
    description: "",
    start: start.toISOString(),
    end: new Date(start.getTime() + 90 * 60_000).toISOString(),
    location: "",
    participants: [],
    privacy: "busy-only",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "training",
    status: "confirmed",
    providerEventId: "bike-reg",
    calendarId: "copicatxyz@gmail.com",
    demo: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

test("focus hours default to midnight without changing meeting or workout hours", () => {
  const state = createSeedState(NOW);
  const scheduling = resolveSchedulingHours(state.profile);
  assert.equal(scheduling.focus.end, "24:00");
  assert.equal(scheduling.focus.start, "09:00");
  assert.deepEqual(scheduling.focus.days, [1, 2, 3, 4, 5]);
  assert.equal(scheduling.meeting.end, "18:00");
  assert.equal(scheduling.workout.end, "20:00");
  assert.equal(scheduling.focus.source, "default");
  assert.equal(isMidnightEnd("00:00"), true);
  const end = hoursEndInstant(TZ, NOW, "24:00");
  assert.equal(end.toISOString(), "2026-09-18T04:00:00.000Z");
});

test("legacy 9–6 weekdays migrate to midnight focus; custom ends stay explicit", () => {
  const migrated = migrateSchedulingHours({ start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] });
  assert.equal(migrated.focus.end, DEFAULT_FOCUS_HOURS.end);
  assert.equal(migrated.meeting.end, DEFAULT_MEETING_HOURS.end);
  const custom = migrateSchedulingHours({ start: "08:00", end: "17:00", days: [1, 2, 3, 4] });
  assert.equal(custom.focus.start, "08:00");
  assert.equal(custom.focus.end, "17:00");
  assert.equal(custom.focus.source, "user");
  assert.equal(custom.meeting.end, "18:00");
});

test("90 minutes fits after bike plus buffer when focus hours end at midnight", () => {
  const result = fulfillIntent(
    { type: "find_time", durationMinutes: 90, durationRequested: true, when: { part: "working" } },
    ctx({ events: [bikeBlock()] }),
  );
  assert.ok(result.choices && result.choices.length >= 1);
  assert.match(result.choices[0]!.label, /5:45 PM–7:15 PM/);
  assert.doesNotMatch(result.message, /no remaining open time|zero free/i);
});

test("90 minutes reports hours limit instead of no free time when focus ends at 6 PM", () => {
  const base = ctx({ events: [bikeBlock()] });
  const profile = {
    ...base.profile,
    schedulingHours: {
      ...resolveSchedulingHours(base.profile),
      focus: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5], source: "user" as const },
    },
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  };
  const result = fulfillIntent(
    { type: "find_time", durationMinutes: 90, durationRequested: true, when: { part: "working" } },
    ctx({ ...base, profile }),
  );
  assert.equal(result.choices?.length ?? 0, 0);
  assert.match(result.message, /90 minutes will not fit before focus hours end at 6 PM/);
  assert.doesNotMatch(result.message, /no remaining open time|zero free|unavailable/i);
});

test("Marcus meeting suggestions are selectable duration slots, not full windows", () => {
  const intent = classifyIntent("When can Marcus and I meet?");
  assert.equal(intent.type, "find_time");
  assert.equal(intent.durationMinutes, 45);
  assert.equal(intent.durationRequested, false);
  const result = fulfillIntent(intent, ctx());
  assert.ok(result.choices && result.choices.length >= 1 && result.choices.length <= 3);
  assert.match(result.choices[0]!.label, /45 minutes/);
  assert.match(result.message, /Suggested duration: 45 minutes/);
  assert.match(result.message, /Your availability; Marcus's not checked/);
  assert.doesNotMatch(result.message, /mutual|confirmed available/i);
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  if (result.actions[0]?.payload?.type === "createEvent") {
    assert.equal(result.actions[0].payload.event.participants?.length ?? 0, 0);
    assert.equal(
      new Date(result.actions[0].payload.event.end).getTime() - new Date(result.actions[0].payload.event.start).getTime(),
      45 * 60_000,
    );
  }
  const more = fulfillIntent(classifyIntent("more times", result.pending), ctx());
  assert.equal(more.pending?.slotOffset, 3);
  assert.equal(more.pending?.eventHint, "marcus");
  assert.equal(more.pending?.durationMinutes, 45);
});

test("reorganize tomorrow adds a suggested focus block without claiming events moved", () => {
  const result = fulfillIntent(classifyIntent("Reorganize tomorrow."), ctx());
  assert.match(result.message, /Suggested duration: 90 minutes/);
  assert.match(result.message, /leave those in place|no events yet|add a focus block/i);
  assert.doesNotMatch(result.message, /triathlon preparation|reorganized|reshuffl/i);
  assert.equal(result.actions.find((item) => item.kind === "propose")?.payload?.type, "createEvent");
  const proposed = result.actions.find((item) => item.payload?.type === "createEvent");
  if (proposed?.payload?.type === "createEvent") {
    assert.equal(
      new Date(proposed.payload.event.end).getTime() - new Date(proposed.payload.event.start).getTime(),
      90 * 60_000,
    );
  }
});

test("reorganize does not duplicate an existing focus block", () => {
  const start = atZonedTime(TZ, new Date("2026-09-18T12:00:00.000Z"), 10, 0);
  const existing: CalendarEvent = {
    ...bikeBlock(),
    id: "evt_focus",
    title: "Focus block",
    category: "focus",
    start: start.toISOString(),
    end: new Date(start.getTime() + 90 * 60_000).toISOString(),
    demo: false,
  };
  const result = fulfillIntent(classifyIntent("Reorganize tomorrow."), ctx({ events: [existing] }));
  assert.match(result.message, /already has a focus block/);
  assert.equal(result.actions.filter((item) => item.kind === "propose").length, 0);
});

test("complete empty scoped sync can remove an in-range Google event; incomplete empty does not", () => {
  const bike = bikeBlock();
  const local = [bike];
  const kept = mergeCalendarEvents(local, []);
  assert.ok(kept.some((event) => event.id === bike.id));
  const cleared = mergeCalendarEvents(local, [], {
    complete: true,
    provider: "google",
    calendarIds: ["copicatxyz@gmail.com"],
    rangeStart: "2026-09-16T04:00:00.000Z",
    rangeEnd: "2026-09-30T04:00:00.000Z",
  });
  assert.equal(cleared.some((event) => event.id === bike.id), false);
  const stale = mergeCalendarEvents(local, [], { complete: false });
  assert.ok(stale.some((event) => event.id === bike.id));
});

test("workout recommendations put the recommended option first", () => {
  const result = fulfillIntent(classifyIntent("Schedule a swim tomorrow."), ctx());
  assert.ok(result.choices && result.choices.length >= 1);
  assert.match(result.choices[0]!.label, /Recommended/);
  assert.match(result.message, /planning time, not a calendar event/);
});
