import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { titleFromRequest } from "../lib/assistant/title";
import { createSeedState } from "../lib/data/seed";
import { zonedLocalToUtc, zonedParts } from "../lib/time";
import type { AssistantContext, ModelIntent } from "../lib/types/assistant";

const LA = "America/Los_Angeles";
const NOW = zonedLocalToUtc(LA, 2026, 9, 21, 12, 0);
const EXPECTED_TITLE = "Preply Português lesson with Laura";

const PRODUCTION =
  "Add a meeting for tomorrow at 11:00 - Preply Português lesson with Laura 50 minutes long";

const VARIANTS = [
  PRODUCTION,
  "Add a meeting for tomorrow at 11:00 — Preply Português lesson with Laura, 50 minutes long",
  "Add a meeting tomorrow at 11 called Preply Português lesson with Laura for 50 minutes",
  "Tomorrow at 11, add Preply Português lesson with Laura for 50 minutes",
];

function ctx(): AssistantContext {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: LA,
    profile: { ...state.profile, timezone: LA },
    events: [],
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  };
}

function interpret(text: string): ModelIntent {
  return refineModelIntent(undefined, classifyIntent(text), text, ctx());
}

function createdEvent(text: string) {
  const intent = interpret(text);
  const result = fulfillIntent(intent, ctx());
  const action = result.actions.find((item) => item.payload?.type === "createEvent");
  assert.ok(action?.payload?.type === "createEvent", `expected createEvent for: ${text}`);
  if (action.payload.type !== "createEvent") throw new Error("unreachable");
  return { intent, event: action.payload.event };
}

test("production Preply sentence keeps the supplied title, not meeting", () => {
  assert.equal(titleFromRequest(PRODUCTION), EXPECTED_TITLE);
  const { intent, event } = createdEvent(PRODUCTION);
  assert.equal(intent.title, EXPECTED_TITLE);
  assert.notEqual(intent.title, "meeting");
  assert.notEqual(intent.title, "Meeting");
  assert.equal(intent.type, "create_event");
  assert.equal(intent.category, "meeting");
  assert.equal(intent.when?.day, "tomorrow");
  assert.equal(intent.when?.hour, 11);
  assert.equal(intent.when?.minute ?? 0, 0);
  assert.equal(intent.durationMinutes, 50);
  assert.equal(event.title, EXPECTED_TITLE);
  assert.equal(event.category, "meeting");
  const start = zonedParts(LA, new Date(event.start));
  const end = zonedParts(LA, new Date(event.end));
  assert.equal(start.day, 22);
  assert.equal(start.hour, 11);
  assert.equal(start.minute, 0);
  assert.equal((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000, 50);
  assert.equal(end.hour, 11);
  assert.equal(end.minute, 50);
});

test("Preply title survives punctuation and called/add variants", () => {
  for (const text of VARIANTS) {
    assert.equal(titleFromRequest(text), EXPECTED_TITLE, text);
    const { intent, event } = createdEvent(text);
    assert.equal(intent.title, EXPECTED_TITLE, text);
    assert.equal(event.title, EXPECTED_TITLE, text);
    assert.equal(intent.when?.day, "tomorrow", text);
    assert.equal(intent.when?.hour, 11, text);
    assert.equal(intent.durationMinutes, 50, text);
    assert.doesNotMatch(event.title, /^meeting$/i);
  }
});

test("classification does not overwrite an explicit semantic title with meeting", () => {
  const refined = refineModelIntent(
    undefined,
    {
      type: "create_event",
      title: "meeting",
      category: "meeting",
      when: { day: "tomorrow", hour: 11 },
      durationMinutes: 50,
    },
    PRODUCTION,
    ctx(),
  );
  assert.equal(refined.title, EXPECTED_TITLE);
  assert.equal(refined.category, "meeting");
});
