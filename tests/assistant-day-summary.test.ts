import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "../lib/assistant/classify";
import { isAvailabilityRequest, isDayOverviewRequest } from "../lib/assistant/dayQuery";
import { buildDaySummaryMessage } from "../lib/assistant/daySummary";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { runAssistant } from "../lib/assistant/pipeline";
import { createSeedState } from "../lib/data/seed";
import { presentAppState } from "../lib/data/sample";
import { atZonedTime } from "../lib/time";
import type { AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const TZ = "America/New_York";
const NOON = new Date("2026-09-17T16:00:00.000Z");
const AFTERNOON = new Date("2026-09-17T18:22:00.000Z");

function context(events: CalendarEvent[], now = NOON, extra?: Partial<AssistantContext>): AssistantContext {
  const state = createSeedState(NOON);
  return {
    now: now.toISOString(),
    timezone: state.profile.timezone,
    profile: state.profile,
    events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    connections: state.connections,
    ...extra,
  };
}

function bikeAfternoon(): CalendarEvent {
  const start = atZonedTime(TZ, NOON, 14, 30);
  return {
    id: "gcal_bike_live",
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
    providerEventId: "bike1",
    calendarId: "copicatxyz@gmail.com",
    demo: false,
    createdAt: NOON.toISOString(),
    updatedAt: NOON.toISOString(),
  };
}

test("day-overview intent is distinct from find-time and open-time", () => {
  assert.equal(isDayOverviewRequest("What's my day looking like?"), true);
  assert.equal(isDayOverviewRequest("Find me 90 minutes to work."), false);
  assert.equal(isAvailabilityRequest("How open is today?"), true);
  assert.equal(isDayOverviewRequest("How open is today?"), false);
  assert.equal(classifyIntent("What's my day looking like?").type, "answer");
  assert.equal(classifyIntent("What's my day looking like?").topic, "day");
  assert.equal(classifyIntent("Find me 90 minutes to work.").type, "find_time");
  assert.equal(classifyIntent("How open is today?").topic, "open_time");
});

test("OpenAI open_time cannot steal a day-overview question", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "answer", topic: "open_time" },
    "What's my day looking like?",
    context([]),
  );
  assert.equal(refined.type, "answer");
  assert.equal(refined.topic, "day");
});

test("OpenAI open_time cannot steal a 90-minute find-time request", () => {
  const refined = refineModelIntent(
    undefined,
    { type: "answer", topic: "open_time" },
    "Find me 90 minutes to work.",
    context([]),
  );
  assert.equal(refined.type, "find_time");
  assert.equal(refined.durationMinutes, 90);
  assert.equal(refined.durationRequested, true);
});

test("day summary lists a newly created Google event with remaining time", () => {
  const event = bikeAfternoon();
  const result = fulfillIntent({ type: "answer", topic: "day" }, context([event], AFTERNOON));
  assert.match(result.message, /Bike workout/);
  assert.match(result.message, /2:30\s*PM/);
  assert.match(result.message, /4:00\s*PM/);
  assert.match(result.message, /90-minute/);
  assert.match(result.message, /4:00\s*PM/);
  assert.match(result.message, /4:30/);
  assert.match(result.message, /shower and get ready/);
  assert.doesNotMatch(result.message, /4:00\s*PM–6:00\s*PM/);
  assert.doesNotMatch(result.message, /about 2 hours of open working time/);
  assert.equal(result.windows, undefined);
});

test("explicit September 17 query uses the requested day", () => {
  const event = bikeAfternoon();
  const classified = classifyIntent("What's September 17, 2026 looking like?");
  assert.equal(classified.topic, "day");
  assert.equal(classified.when?.month, 9);
  assert.equal(classified.when?.dayOfMonth, 17);
  assert.equal(classified.when?.year, 2026);
  const result = fulfillIntent(classified, context([event], AFTERNOON));
  assert.match(result.message, /Bike/);
});

test("sample toggle does not hide a real Google event from the summary", () => {
  const state = createSeedState(NOON);
  state.profile.showSampleData = false;
  state.profile.sampleDataExplicit = true;
  state.connections.google = { status: "connected" };
  state.events.push(bikeAfternoon());
  const visible = presentAppState(state);
  assert.ok(visible.events.some((event) => event.id === "gcal_bike_live"));
  const result = fulfillIntent({ type: "answer", topic: "day" }, context(visible.events, AFTERNOON, {
    profile: visible.profile,
    connections: visible.connections,
  }));
  assert.match(result.message, /Bike/);
});

test("a failed calendar read is not reported as an empty day", () => {
  const result = fulfillIntent(
    { type: "answer", topic: "day" },
    context([], AFTERNOON, { connections: { google: { status: "error", syncError: "google_sync_failed" }, icloud: { status: "disconnected" }, telegram: { status: "disconnected" } } }),
  );
  assert.match(result.message, /could not read your calendar/i);
  assert.doesNotMatch(result.message, /Nothing is scheduled today/);
});

test("a genuinely empty day says nothing is scheduled", () => {
  const state = createSeedState(NOON);
  const result = fulfillIntent(
    { type: "answer", topic: "day" },
    context([], AFTERNOON, { connections: { google: { status: "connected" }, icloud: { status: "disconnected" }, telegram: { status: "disconnected" } }, profile: state.profile }),
  );
  assert.match(result.message, /Nothing is scheduled today/);
});

test("explicit availability questions still use open time", () => {
  const result = fulfillIntent({ type: "answer", topic: "open_time" }, context([bikeAfternoon()], AFTERNOON));
  assert.match(result.message, /open working time/);
  assert.ok(result.windows?.length);
});

test("find-time requests still search windows", async () => {
  const result = await runAssistant(
    {
      messages: [{ role: "user", content: "Find me 90 minutes to work." }],
      context: context(createSeedState(NOON).events),
    },
    "mock",
  );
  assert.equal(result.intentType, "find_time");
  assert.match(result.message, /How about|Suggested duration|90 minutes/);
});

test("seed day summary still names Bike and Pepinho", () => {
  const state = createSeedState(NOON);
  const result = fulfillIntent({ type: "answer", topic: "day" }, context(state.events));
  assert.match(result.message, /Bike/);
  assert.match(result.message, /Pepinho Meeting/);
  const copy = buildDaySummaryMessage({
    events: state.events,
    timezone: TZ,
    now: NOON,
    dayStart: atZonedTime(TZ, NOON, 0, 0),
    workingHours: state.profile.workingHours,
    workouts: state.workouts,
  });
  assert.match(copy, /Bike workout/);
});
