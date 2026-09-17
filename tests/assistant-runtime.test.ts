import assert from "node:assert/strict";
import { test } from "node:test";
import { proposedEventTimes } from "../lib/assistant/describeAction";
import { MockAssistantRuntime } from "../lib/assistant/mockRuntime";
import { createSeedState } from "../lib/data/seed";
import { formatRange, eventDurationMinutes } from "../lib/format";

const NOW = new Date("2026-09-17T16:00:00.000Z");

function context() {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: state.profile.timezone,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  };
}

async function ask(text: string) {
  const runtime = new MockAssistantRuntime();
  return runtime.complete({
    messages: [{ role: "user", content: text }],
    context: context(),
  });
}

test("assistant reads the real seed day", async () => {
  const result = await ask("What's my day looking like?");
  assert.match(result.message, /Pepinho Meeting/);
  assert.match(result.message, /Bike/);
  assert.equal(result.actions[0]?.kind, "read");
});

test("assistant finds structured free time", async () => {
  const result = await ask("Find me 90 minutes to work.");
  assert.match(result.message, /How about|Suggested duration|open/);
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
});

test("assistant proposes a swim instead of silently creating it", async () => {
  const result = await ask("Schedule a swim tomorrow.");
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
});

test("assistant can propose moving the swim", async () => {
  const result = await ask("Move my swim to 6 PM");
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "updateEvent");
});

test("assistant prose matches proposed action time and duration", async () => {
  const result = await ask("Reorganize tomorrow.");
  const proposed = result.actions.find((item) => item.kind === "propose");
  assert.ok(proposed);
  const times = proposedEventTimes(proposed);
  assert.ok(times);
  const minutes = eventDurationMinutes(times.start, times.end);
  assert.equal(minutes, 90);
  assert.match(result.message, new RegExp(formatRange(times.start, times.end, "America/New_York").replace(/[–-]/g, "[–-]")));
  assert.match(result.message, /90 minutes/);
  assert.doesNotMatch(result.message, /9:00 AM–6:00 PM/);
  assert.doesNotMatch(result.message, /3 hours focus/);
  assert.doesNotMatch(result.message, /triathlon preparation/);
  assert.doesNotMatch(result.message, /Your current training goal/);
  assert.doesNotMatch(result.message, /I am training for a triathlon/);
});

test("irrelevant capability limitations are not appended", async () => {
  const result = await ask("Reorganize tomorrow.");
  assert.doesNotMatch(result.message, /Weather is not connected/);
  assert.doesNotMatch(result.message, /meeting memory/i);
  assert.doesNotMatch(result.message, /No meeting memory/);
});

test("weather limitation is mentioned only when weather is requested", async () => {
  const result = await ask("Adapt my bike workout for weather");
  assert.match(result.message, /weather connected/i);
});
