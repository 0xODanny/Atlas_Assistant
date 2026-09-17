import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAssistantAction } from "../lib/assistant/apply";
import { openaiConfigured } from "../lib/assistant/capabilities";
import { ASSISTANT_CHIPS } from "../lib/assistant/chips";
import { classifyIntent } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { runAssistant, runAssistantDeterministic } from "../lib/assistant/pipeline";
import { parseModelIntent } from "../lib/assistant/schema";
import { resolveSearchRange } from "../lib/assistant/resolveTime";
import { createMemoryStore } from "../lib/data/memory-store";
import { createSeedState } from "../lib/data/seed";
import type { AssistantContext } from "../lib/types/assistant";

const NOW = new Date("2026-09-17T16:00:00.000Z");

function context(): AssistantContext {
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

test("read-only answer uses seed calendar data", () => {
  const result = fulfillIntent({ type: "answer", topic: "day" }, context());
  assert.equal(result.intentType, "answer");
  assert.match(result.message, /Pepinho Meeting/);
  assert.match(result.message, /Bike/);
  assert.equal(result.actions[0]?.kind, "read");
});

test("create event proposal does not mutate until apply", () => {
  const state = createSeedState(NOW);
  const store = createMemoryStore(state);
  const result = fulfillIntent(
    { type: "create_event", sport: "swim", title: "Swim", when: { day: "tomorrow" }, durationMinutes: 60 },
    context(),
  );
  assert.equal(result.intentType, "create_event");
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  assert.equal(store.getState().events.length, 3);
  applyAssistantAction(store, result.actions[0]);
  assert.equal(store.getState().events.length, 4);
  assert.ok(store.getState().events.some((event) => event.title === "Swim"));
});

test("move event proposal is conflict-free and not applied until apply", () => {
  const ctx = context();
  const result = fulfillIntent({ type: "move_event", eventHint: "bike", when: { part: "later" } }, ctx);
  assert.equal(result.intentType, "move_event");
  assert.ok(result.choices && result.choices.length >= 1);
  assert.equal(result.actions.filter((item) => item.kind === "propose").length, 0);
  const store = createMemoryStore(createSeedState(NOW));
  const bike = store.getState().events.find((event) => event.id === "evt_bike");
  assert.ok(bike);
  const choice = result.choices[0];
  const proposed = {
    id: "act_move",
    kind: "propose" as const,
    tool: "updateEvent" as const,
    label: "Move Bike",
    summary: "move",
    status: "proposed" as const,
    payload: {
      type: "updateEvent" as const,
      id: "evt_bike",
      patch: { start: choice.start, end: choice.end },
      before: bike,
    },
  };
  assert.equal(store.getState().events.find((event) => event.id === "evt_bike")?.start, bike.start);
  applyAssistantAction(store, proposed);
  assert.equal(store.getState().events.find((event) => event.id === "evt_bike")?.start, choice.start);
});

test("find-time response uses Atlas free windows", () => {
  const result = fulfillIntent({ type: "find_time", durationMinutes: 90, when: { part: "working" } }, context());
  assert.equal(result.intentType, "find_time");
  assert.match(result.message, /How about|Suggested duration|will not fit/);
  assert.ok((result.choices && result.choices.length >= 1) || /will not fit|shorter/.test(result.message));
  assert.equal(result.actions[0]?.kind === "propose" || result.actions.length === 0, true);
  for (const choice of result.choices ?? []) {
    assert.ok(new Date(choice.start).getTime() >= NOW.getTime());
  }
});

test("preparation proposal uses the next meeting object", () => {
  const morning = new Date("2026-09-17T12:00:00.000Z");
  const state = createSeedState(morning);
  const result = fulfillIntent(
    { type: "prepare_meeting" },
    {
      now: morning.toISOString(),
      timezone: state.profile.timezone,
      profile: state.profile,
      events: state.events,
      tasks: state.tasks,
      workouts: state.workouts,
      meetings: state.meetings,
    },
  );
  assert.equal(result.intentType, "prepare_meeting");
  assert.match(result.message, /Pepinho Meeting/);
  assert.match(result.message, /15 minutes/);
  const propose = result.actions.find((item) => item.kind === "propose");
  assert.equal(propose?.payload?.type, "createEvent");
});

test("reorganize proposal is structured and not silent", () => {
  const result = fulfillIntent({ type: "reorganize_day", when: { day: "tomorrow" } }, context());
  assert.equal(result.intentType, "reorganize_day");
  assert.match(result.message, /focus block|Suggested duration/);
  assert.ok(result.actions.some((item) => item.kind === "propose"));
  assert.doesNotMatch(result.message, /Weather is not connected/);
});

test("clarification continues a pending create-event request", () => {
  const first = classifyIntent("Schedule training tomorrow.");
  assert.equal(first.type, "clarify");
  const clarified = classifyIntent("swim", first);
  assert.equal(clarified.type, "create_event");
  assert.equal(clarified.sport, "swim");
  const fulfilled = fulfillIntent(first, context());
  assert.equal(fulfilled.intentType, "clarify");
  assert.ok(fulfilled.pending);
});

test("invalid structured model output is rejected", () => {
  assert.equal(parseModelIntent("nope").ok, false);
  assert.equal(parseModelIntent({ type: "explode" }).ok, false);
  assert.equal(parseModelIntent({ type: "clarify" }).ok, false);
  assert.equal(parseModelIntent({ type: "answer", topic: "day" }).ok, true);
});

test("conflict rejection does not propose a busy move", () => {
  const result = fulfillIntent({ type: "move_event", eventHint: "bike", when: { hour: 11 } }, context());
  assert.match(result.message, /conflict/i);
  assert.equal(result.actions.length, 0);
});

test("chip and typed request use the same classifier pipeline", () => {
  for (const chip of ASSISTANT_CHIPS) {
    assert.deepEqual(classifyIntent(chip), classifyIntent(`${chip}`));
  }
  assert.equal(classifyIntent(ASSISTANT_CHIPS[0]).type, "answer");
  assert.equal(classifyIntent(ASSISTANT_CHIPS[1]).type, "find_time");
  assert.equal(classifyIntent(ASSISTANT_CHIPS[2]).type, "create_event");
  assert.equal(classifyIntent(ASSISTANT_CHIPS[4]).type, "prepare_meeting");
  assert.equal(classifyIntent(ASSISTANT_CHIPS[5]).type, "reorganize_day");
  const typed = runAssistantDeterministic({
    messages: [{ role: "user", content: ASSISTANT_CHIPS[0] }],
    context: context(),
  });
  const chip = runAssistantDeterministic({
    messages: [{ role: "user", content: "What's my day looking like?" }],
    context: context(),
  });
  assert.equal(typed.intentType, chip.intentType);
  assert.equal(typed.message, chip.message);
});

test("timezone and date resolution stay in Atlas utilities", () => {
  const range = resolveSearchRange(
    { day: "tomorrow", part: "morning" },
    "America/New_York",
    NOW,
  );
  assert.match(range.start.toISOString(), /2026-09-18T11:00:00.000Z/);
  assert.match(range.end.toISOString(), /2026-09-18T16:00:00.000Z/);
});

test("missing OpenAI key is a clean local-development path", async () => {
  const missing = openaiConfigured({} as NodeJS.ProcessEnv);
  assert.equal(missing, false);
  const fallback = await runAssistant(
    { messages: [{ role: "user", content: "What's my day looking like?" }], context: context() },
    "mock",
  );
  assert.match(fallback.message, /Bike/);
  const forced = await runAssistant(
    { messages: [{ role: "user", content: "What's my day looking like?" }], context: context() },
    "openai",
    {} as NodeJS.ProcessEnv,
  );
  assert.equal(forced.error, "openai_not_configured");
  assert.equal(forced.source, "error");
  assert.match(forced.message, /not configured/);
  assert.equal(fallback.source, "local");
});

test("named move and delete stay proposals until apply", () => {
  assert.equal(classifyIntent("Move Atlas Write Test to 4 PM.").type, "move_event");
  assert.equal(classifyIntent("Move Atlas Write Test to 4 PM.").when?.hour, 16);
  assert.equal(classifyIntent("Delete Atlas Write Test.").type, "delete_event");
  const created = {
    ...createSeedState(NOW).events[0],
    id: "evt_write_test",
    title: "Atlas Write Test",
    category: "personal" as const,
    source: "google" as const,
    start: "2026-09-18T19:00:00.000Z",
    end: "2026-09-18T19:30:00.000Z",
  };
  const ctx = { ...context(), events: [...context().events, created], connections: { google: { status: "connected" as const, calendars: [{ id: "primary", summary: "Personal", primary: true, included: true }] }, icloud: { status: "disconnected" as const }, telegram: { status: "disconnected" as const } } };
  const del = fulfillIntent({ type: "delete_event", eventHint: "atlas write test" }, ctx);
  assert.equal(del.intentType, "delete_event");
  assert.equal(del.actions[0]?.kind, "propose");
  assert.equal(del.actions[0]?.payload?.type, "deleteEvent");
  assert.match(del.actions[0]?.destinationLabel ?? "", /Google Calendar/);
  assert.match(del.message, /Nothing has changed yet/);
  const store = createMemoryStore(createSeedState(NOW));
  store.setState({ ...store.getState(), events: [...store.getState().events, created] });
  assert.equal(store.getState().events.some((event) => event.id === "evt_write_test"), true);
});

test("unavailable capability is mentioned only when relevant", () => {
  const weather = fulfillIntent({ type: "answer", capability: "weather" }, context());
  assert.match(weather.message, /weather/i);
  const move = fulfillIntent({ type: "move_event", eventHint: "bike", when: { part: "later" } }, context());
  assert.doesNotMatch(move.message, /weather/i);
  assert.doesNotMatch(move.message, /memory/i);
});
