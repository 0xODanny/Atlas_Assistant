import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "../lib/assistant/classify";
import { resolveChoiceFromText } from "../lib/assistant/followUp";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { sourceHasSecrets } from "../lib/assistant/log";
import { runAssistant } from "../lib/assistant/pipeline";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { parseModelIntent } from "../lib/assistant/schema";
import { canSubmitAssistant } from "../lib/assistant/submit";
import { keepActiveWithError, replaceActiveResponse, emptyWorkspace } from "../lib/assistant/workspace";
import { createSeedState } from "../lib/data/seed";
import type { AssistantContext } from "../lib/types/assistant";

const NOW = new Date("2026-09-17T16:00:00.000Z");
const KEYED = { OPENAI_API_KEY: "sk-test-not-a-real-key" } as unknown as NodeJS.ProcessEnv;

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

const request = {
  messages: [{ role: "user" as const, content: "What's my day looking like?" }],
  context: context(),
};

test("configured OpenAI path is selected when a key is present", async () => {
  const result = await runAssistant(request, "auto", KEYED, {
    complete: async () => ({ type: "answer", topic: "day" }),
  });
  assert.equal(result.source, "openai");
  assert.equal(result.intentType, "answer");
  assert.match(result.message, /Bike/);
  assert.equal(sourceHasSecrets(result), false);
});

test("no-key local path is selected", async () => {
  const result = await runAssistant(request, "auto", {} as NodeJS.ProcessEnv);
  assert.equal(result.source, "local");
  assert.match(result.message, /Bike/);
});

test("OpenAI failure does not silently fall back to the classifier", async () => {
  const result = await runAssistant(request, "auto", KEYED, {
    complete: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(result.source, "error");
  assert.equal(result.errorCategory, "openai_timeout");
  assert.doesNotMatch(result.message, /Bike/);
  assert.equal(result.actions.length, 0);
});

test("malformed structured response is an error", async () => {
  const result = await runAssistant(request, "auto", KEYED, {
    complete: async () => "not-json-object",
  });
  assert.equal(result.source, "error");
  assert.equal(result.errorCategory, "invalid_intent");
  assert.doesNotMatch(result.message, /Bike/);
});

test("unsupported intent is rejected", () => {
  const parsed = parseModelIntent({ type: "search_web" });
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.error, /Invalid intent type/);
});

test("a new full request does not stay attached to a pending clarification", () => {
  const pending = classifyIntent("Move it later.");
  const next = classifyIntent("Schedule training tomorrow.", pending);
  assert.equal(next.type, "clarify");
  assert.match(next.question ?? "", /training/i);
});

test("Atlas completes a pending training clarify even if the model asks again", async () => {
  const pending = classifyIntent("Schedule training tomorrow.");
  const result = await runAssistant(
    { messages: [{ role: "user", content: "Swim." }], context: context(), pending },
    "auto",
    KEYED,
    { complete: async () => ({ type: "clarify", question: "What type of training?" }) },
  );
  assert.equal(result.source, "openai");
  assert.equal(result.intentType, "create_event");
  assert.equal(result.actions[0]?.kind, "propose");
});

test("Atlas does not let the model guess an event for move it later", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "move_event", eventId: "evt_swim", eventHint: "Swim" },
    "Move it later.",
    context(),
  );
  assert.equal(refined.type, "clarify");
});

test("duration follow-up updates a resumed find-time request", () => {
  const refined = refineModelIntent(
    { type: "find_time", durationMinutes: 120, when: { day: "tomorrow" } },
    { type: "clarify", question: "What type of event?" },
    "Actually make it three.",
    context(),
  );
  assert.equal(refined.type, "find_time");
  assert.equal(refined.durationMinutes, 180);
});

test("model-invented clocks are ignored unless the user stated a time", () => {
  const refined = refineModelIntent(
    undefined,
    {
      type: "create_event",
      sport: "swim",
      when: { day: "tomorrow", part: "morning", hour: 10, minute: 21 },
    },
    "Can you get me in the pool tomorrow before lunch?",
    context(),
  );
  assert.equal(refined.when?.hour, undefined);
  assert.equal(refined.when?.day, "tomorrow");
});

test("ride later updates the existing bike instead of creating another", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "create_event", sport: "bike", when: { part: "later" } },
    "I really don't want to ride that early. What can you do later?",
    context(),
  );
  assert.equal(refined.type, "move_event");
  assert.equal(refined.eventHint, "bike");
});

test("focus-block language is not rewritten into a meeting move", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "move_event", eventHint: "meeting", when: { hour: 10 } },
    "Schedule a three-hour focus block starting at 10.",
    context(),
  );
  assert.equal(refined.type, "create_focus_block");
  assert.equal(refined.when?.hour, 10);
});

test("clarification continuation completes the original request", () => {
  const first = classifyIntent("Schedule training tomorrow.");
  assert.equal(first.type, "clarify");
  const second = classifyIntent("Swim.", first);
  assert.equal(second.type, "create_event");
  assert.equal(second.sport, "swim");
  const fulfilled = fulfillIntent(second, context());
  assert.equal(fulfilled.intentType, "create_event");
  assert.equal(fulfilled.actions[0]?.kind, "propose");
});

test("ambiguous event reference asks which event", () => {
  const intent = classifyIntent("Move it later.");
  const result = fulfillIntent(intent, context());
  assert.equal(result.intentType, "clarify");
  assert.match(result.message, /Which event/);
  assert.ok(result.pending);
});

test("Atlas rejects a model-proposed conflict and offers alternatives", () => {
  const result = fulfillIntent(
    { type: "create_event", sport: "swim", title: "Swim", when: { hour: 11 }, durationMinutes: 60 },
    context(),
  );
  assert.match(result.message, /will not book over/i);
  assert.equal(result.actions.filter((item) => item.kind === "propose").length, 0);
  assert.ok(result.choices && result.choices.length >= 1);
});

test("explicit overlap booking is rejected without stacking", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "reorganize_day" },
    "Book two things at the same time.",
    context(),
  );
  assert.equal(refined.type, "move_event");
  assert.equal(refined.eventHint, "everything");
  const result = fulfillIntent(refined, context());
  assert.match(result.message, /one event per slot|cannot move every event/i);
  assert.equal(result.actions.filter((item) => item.kind === "propose").length, 0);
});

test("stacked noon request does not move every event", () => {
  const result = fulfillIntent({ type: "reorganize_day", eventHint: "everything", when: { hour: 12 } }, context());
  assert.match(result.message, /cannot move every event/i);
  assert.equal(result.actions.filter((item) => item.payload?.type === "updateEvent").length, 0);
});

test("evening follow-up selects an active option without mutating", () => {
  const move = fulfillIntent({ type: "move_event", eventHint: "bike", when: { part: "later" } }, context());
  assert.ok(move.choices && move.choices.length >= 1);
  const evening = resolveChoiceFromText("The evening one.", move.choices);
  assert.ok(evening);
  assert.match(evening.label, /PM/i);
  assert.doesNotMatch(evening.label, /7:00 AM/);
});

test("duplicate submit is blocked while pending", () => {
  assert.equal(canSubmitAssistant(true, "Hello"), false);
  assert.equal(canSubmitAssistant(false, "   "), false);
  assert.equal(canSubmitAssistant(false, "Hello"), true);
});

test("source metadata never contains secrets", async () => {
  const result = await runAssistant(request, "auto", KEYED, {
    complete: async () => ({ type: "answer", topic: "day" }),
  });
  assert.equal(result.source, "openai");
  assert.equal(sourceHasSecrets(result), false);
  assert.equal(sourceHasSecrets({ source: result.source, errorCategory: result.errorCategory }), false);
});

test("assistant failure keeps the previous workspace result", () => {
  const workspace = replaceActiveResponse(emptyWorkspace(), {
    id: "t1",
    prompt: "Day",
    content: "Today you have 3 events.",
    actions: [],
    source: "openai",
  });
  const failed = keepActiveWithError(workspace, "I could not reach OpenAI. Nothing was changed.");
  assert.equal(failed.active?.content, "Today you have 3 events.");
  assert.match(failed.lastError ?? "", /Nothing was changed/);
});
