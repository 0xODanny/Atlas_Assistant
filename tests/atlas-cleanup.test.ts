import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildModelContext } from "../lib/assistant/context";
import { classifyIntent } from "../lib/assistant/classify";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { allDayMoveControls, formatAllDayCurrent, moveAllDayEvent } from "../lib/calendar/allDayMove";
import { isUpcomingMeeting, nextEligibleMeeting } from "../lib/calendar/meetings";
import { presentAppState, sampleDataEnabled, stampSeedDemoFlags } from "../lib/data/sample";
import { createSeedState } from "../lib/data/seed";
import { deserializeState, serializeState } from "../lib/data/serialize";
import { CONTENT_BOTTOM_INSET_PX, contentBottomInsetPx, BOTTOM_NAV_GAP_PX, BOTTOM_NAV_HEIGHT_PX } from "../lib/layout/insets";
import { allDaySpanDays } from "../lib/format";
import type { AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";
import type { AppState } from "../lib/data/state";

const TZ = "America/New_York";
const AFTERNOON = new Date("2026-09-17T16:00:00.000Z");
const MORNING = new Date("2026-09-17T12:00:00.000Z");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function allDayStay(): CalendarEvent {
  const seed = createSeedState(AFTERNOON).events[0];
  return {
    ...seed,
    id: "evt_stay",
    title: "Stay at Rodeway Inn Meadowlands",
    category: "travel",
    allDay: true,
    demo: false,
    start: "2026-09-16T04:00:00.000Z",
    end: "2026-09-19T04:00:00.000Z",
  };
}

function contextFrom(state: AppState, now: Date, events = state.events): AssistantContext {
  return {
    now: now.toISOString(),
    timezone: state.profile.timezone,
    profile: state.profile,
    events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    connections: state.connections,
  };
}

function googleMeeting(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    ...createSeedState(AFTERNOON).events[1],
    id: "gcal_standup",
    title: "Standup",
    source: "google",
    demo: false,
    meetingId: undefined,
    start: "2026-09-17T16:30:00.000Z",
    end: "2026-09-17T17:00:00.000Z",
    ...overrides,
  };
}

test("all-day move UI does not show 12:00 AM", () => {
  const event = allDayStay();
  const controls = allDayMoveControls(event, TZ);
  assert.equal(controls.keepLabel, "All day");
  assert.equal(controls.mode, "range");
  assert.match(controls.currentLabel, /All day/);
  assert.doesNotMatch(controls.currentLabel, /12:00/);
  assert.doesNotMatch(formatAllDayCurrent(event.start, event.end, TZ), /AM|PM/);
});

test("all-day move preserves all-day status", () => {
  const event = allDayStay();
  const patch = moveAllDayEvent({ event, timezone: TZ, startDate: "2026-09-17" });
  assert.equal(patch.allDay, true);
  assert.ok(patch.start);
  assert.ok(patch.end);
});

test("multi-day all-day move preserves span", () => {
  const event = allDayStay();
  const span = allDaySpanDays(event.start, event.end, TZ);
  assert.equal(span, 3);
  const patch = moveAllDayEvent({ event, timezone: TZ, startDate: "2026-09-17" });
  assert.equal(allDaySpanDays(patch.start!, patch.end!, TZ), span);
  assert.equal(patch.allDay, true);
});

test("one-day all-day move uses a single date", () => {
  const event = { ...allDayStay(), start: "2026-09-18T04:00:00.000Z", end: "2026-09-19T04:00:00.000Z" };
  const controls = allDayMoveControls(event, TZ);
  assert.equal(controls.mode, "single");
  const patch = moveAllDayEvent({ event, timezone: TZ, startDate: "2026-09-19" });
  assert.equal(allDaySpanDays(patch.start!, patch.end!, TZ), 1);
  assert.equal(patch.allDay, true);
});

test("next meeting excludes past meetings", () => {
  const pepinho = createSeedState(AFTERNOON).events.find((event) => event.id === "evt_pepinho");
  assert.ok(pepinho);
  assert.equal(isUpcomingMeeting(pepinho, AFTERNOON), false);
  assert.equal(nextEligibleMeeting([pepinho], AFTERNOON), undefined);
});

test("active and future meetings are eligible", () => {
  const active = googleMeeting({
    start: "2026-09-17T15:30:00.000Z",
    end: "2026-09-17T16:30:00.000Z",
  });
  const future = googleMeeting({
    id: "gcal_later",
    start: "2026-09-17T18:00:00.000Z",
    end: "2026-09-17T18:30:00.000Z",
  });
  const cancelled = googleMeeting({
    id: "gcal_cancel",
    status: "cancelled",
    start: "2026-09-17T18:00:00.000Z",
    end: "2026-09-17T18:30:00.000Z",
  });
  assert.equal(isUpcomingMeeting(active, AFTERNOON), true);
  assert.equal(isUpcomingMeeting(future, AFTERNOON), true);
  assert.equal(isUpcomingMeeting(cancelled, AFTERNOON), false);
  assert.equal(nextEligibleMeeting([future, active, cancelled], AFTERNOON)?.id, "gcal_standup");
});

test("no-upcoming-meeting response does not fall back to a past seed meeting", () => {
  const state = createSeedState(AFTERNOON);
  const result = fulfillIntent({ type: "prepare_meeting" }, contextFrom(state, AFTERNOON));
  assert.equal(result.intentType, "prepare_meeting");
  assert.match(result.message, /upcoming meeting/);
  assert.doesNotMatch(result.message, /Pepinho Meeting/);
  const asked = fulfillIntent({ type: "answer", topic: "next_meeting" }, contextFrom(state, AFTERNOON));
  assert.match(asked.message, /no upcoming meeting/i);
  assert.doesNotMatch(asked.message, /Pepinho Meeting/);
});

test("mobile bottom inset does not cover final controls", () => {
  assert.equal(CONTENT_BOTTOM_INSET_PX, BOTTOM_NAV_HEIGHT_PX + BOTTOM_NAV_GAP_PX);
  assert.ok(contentBottomInsetPx(0) >= 112);
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const actions = readFileSync(join(ROOT, "components/assistant/ActionCard.tsx"), "utf8");
  assert.match(shell, /--atlas-bottom-inset/);
  assert.match(shell, /--atlas-bottom-nav-height/);
  assert.match(shell, /overflow-y-auto/);
  assert.doesNotMatch(shell, /z-\[9/);
  assert.match(css, /--atlas-bottom-nav-height:\s*5\.25rem/);
  assert.match(css, /--atlas-bottom-gap:\s*1\.75rem/);
  assert.match(actions, /scroll-mb-\[var\(--atlas-bottom-inset\)\]/);
});

test("sample data defaults on when no provider is connected", () => {
  const state = createSeedState(AFTERNOON);
  assert.equal(state.connections.google.status, "disconnected");
  assert.equal(sampleDataEnabled(state.profile, state.connections), true);
  const visible = presentAppState(state);
  assert.ok(visible.events.some((event) => event.id === "evt_bike"));
  assert.ok(visible.events.some((event) => event.id === "evt_pepinho"));
  assert.ok(visible.events.some((event) => event.id === "evt_swim"));
});

test("sample data defaults off after first Google connection", () => {
  const state = createSeedState(AFTERNOON);
  state.connections.google = { status: "connected", email: "user@gmail.com" };
  assert.equal(state.profile.sampleDataExplicit, undefined);
  assert.equal(sampleDataEnabled(state.profile, state.connections), false);
  const visible = presentAppState(state);
  assert.equal(visible.events.some((event) => event.id === "evt_bike"), false);
  assert.equal(visible.events.some((event) => event.title === "Pepinho Meeting"), false);
});

test("explicit sample-data preference persists across disconnect", () => {
  const state = createSeedState(AFTERNOON);
  state.profile.showSampleData = false;
  state.profile.sampleDataExplicit = true;
  state.connections.google = { status: "disconnected" };
  assert.equal(sampleDataEnabled(state.profile, state.connections), false);
  state.connections.google = { status: "connected" };
  assert.equal(sampleDataEnabled(state.profile, state.connections), false);
  state.profile.showSampleData = true;
  assert.equal(sampleDataEnabled(state.profile, state.connections), true);
});

test("demo events are excluded from the merged calendar when the toggle is off", () => {
  const state = createSeedState(AFTERNOON);
  state.connections.google = { status: "connected" };
  state.events.push(googleMeeting());
  const visible = presentAppState(state);
  assert.equal(visible.events.some((event) => event.demo), false);
  assert.ok(visible.events.some((event) => event.id === "gcal_standup"));
});

test("demo events are included when the toggle is on", () => {
  const state = createSeedState(AFTERNOON);
  state.connections.google = { status: "connected" };
  state.profile.showSampleData = true;
  state.profile.sampleDataExplicit = true;
  state.events.push(googleMeeting());
  const visible = presentAppState(state);
  assert.ok(visible.events.some((event) => event.id === "evt_bike" && event.demo));
  assert.ok(visible.events.some((event) => event.id === "gcal_standup" && !event.demo));
});

test("Assistant context includes the demo flag", () => {
  const state = createSeedState(MORNING);
  state.profile.showSampleData = true;
  state.profile.sampleDataExplicit = true;
  const visible = presentAppState(state);
  const model = buildModelContext(contextFrom(visible, MORNING));
  const pepinho = model.today.find((event) => event?.title === "Pepinho Meeting");
  assert.ok(pepinho);
  assert.equal(pepinho.demo, true);
});

test("Assistant prefers a chronological real meeting over an earlier demo meeting", () => {
  const state = createSeedState(MORNING);
  const pepinho = state.events.find((event) => event.id === "evt_pepinho");
  assert.ok(pepinho);
  const standup = googleMeeting();
  const events = [pepinho, standup];
  const next = nextEligibleMeeting(events, MORNING);
  assert.equal(next?.id, "gcal_standup");
  const result = fulfillIntent({ type: "answer", topic: "next_meeting" }, contextFrom(state, MORNING, events));
  assert.match(result.message, /Standup/);
  assert.doesNotMatch(result.message, /Pepinho Meeting/);
  assert.doesNotMatch(result.message, /sample Atlas data/);
});

test("Assistant labels demo meetings when only sample meetings exist", () => {
  const state = createSeedState(MORNING);
  const result = fulfillIntent({ type: "answer", topic: "next_meeting" }, contextFrom(state, MORNING));
  assert.match(result.message, /Pepinho Meeting/);
  assert.match(result.message, /sample Atlas data/);
});

test("hiding sample data does not delete seed objects", () => {
  const state = createSeedState(AFTERNOON);
  state.connections.google = { status: "connected" };
  const rawCount = state.events.length;
  const visible = presentAppState(state);
  assert.ok(visible.events.length < rawCount);
  assert.equal(state.events.length, rawCount);
  assert.ok(state.events.some((event) => event.id === "evt_bike"));
  assert.ok(state.tasks.some((task) => task.id === "task_agenda"));
  assert.ok(state.meetings.some((meeting) => meeting.id === "meet_pepinho"));
});

test("deserialize stamps demo flags without dropping seed events", () => {
  const state = createSeedState(AFTERNOON);
  const stripped = {
    ...state,
    events: state.events.map((event) => {
      const next = { ...event };
      delete next.demo;
      return next;
    }),
  };
  const restored = deserializeState(serializeState(stripped as AppState));
  assert.ok(restored);
  const stamped = stampSeedDemoFlags(restored);
  assert.ok(stamped.events.every((event) => event.demo));
  assert.equal(stamped.events.length, 3);
});

test("what's my next meeting classifies as next_meeting", () => {
  assert.equal(classifyIntent("What's my next meeting?").topic, "next_meeting");
  assert.equal(classifyIntent("Prepare me for my next meeting.").type, "prepare_meeting");
});
