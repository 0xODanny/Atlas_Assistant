import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAssistantAction } from "../lib/assistant/apply";
import { classifyIntent } from "../lib/assistant/classify";
import { actionFromCreateChoice, fulfillIntent } from "../lib/assistant/fulfill";
import { refineModelIntent } from "../lib/assistant/refineIntent";
import { titleFromRequest } from "../lib/assistant/title";
import { emptyWorkspace, replaceActiveResponse, selectActiveChoice, updateActiveAction } from "../lib/assistant/workspace";
import { generateBrief } from "../lib/brief/generateBrief";
import { eventBlocksTime, rematchPersistedEvent } from "../lib/calendar/busy";
import { findFreeTime, totalOpenMinutes } from "../lib/calendar/freeTime";
import { firstSnappedSlot, snapZonedDate } from "../lib/calendar/snap";
import { createMemoryStore } from "../lib/data/memory-store";
import { createSeedState } from "../lib/data/seed";
import { deserializeState, serializeState } from "../lib/data/serialize";
import { formatAllDayLabel, formatAllDayRange } from "../lib/format";
import { mapGoogleEvent } from "../lib/google/mapEvent";
import { presentEventRow } from "../lib/present/event";
import { sanitizeListCopy } from "../lib/present/description";
import { nextEligibleMeeting } from "../lib/present/status";
import { zonedParts } from "../lib/time";
import type { AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const TZ = "America/New_York";
const NOW = new Date("2026-09-17T16:00:00.000Z");

function baseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt_local",
    title: "Local",
    description: "",
    start: "2026-09-17T15:00:00.000Z",
    end: "2026-09-17T16:00:00.000Z",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "personal",
    status: "confirmed",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function contextWith(events: CalendarEvent[], extra?: Partial<AssistantContext>): AssistantContext {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: state.profile.timezone,
    profile: state.profile,
    events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    connections: {
      ...state.connections,
      google: {
        status: "connected",
        calendars: [{ id: "primary", summary: "Personal", primary: true, included: true }],
      },
    },
    ...extra,
  };
}

test("transparent all-day event does not block working day", () => {
  const mapped = mapGoogleEvent({
    event: {
      id: "stay",
      summary: "Stay at Rodeway Inn Meadowlands",
      start: { date: "2026-09-17" },
      end: { date: "2026-09-18" },
      transparency: "transparent",
    },
    calendarId: "primary",
    userTimezone: TZ,
  });
  assert.ok(mapped);
  assert.equal(mapped.allDay, true);
  assert.equal(mapped.blocksTime, false);
  assert.equal(eventBlocksTime(mapped), false);
  const windows = findFreeTime({
    start: new Date("2026-09-17T13:00:00.000Z"),
    end: new Date("2026-09-17T22:00:00.000Z"),
    durationMinutes: 30,
    events: [mapped],
    timezone: TZ,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    useWorkingHours: true,
  });
  assert.ok(totalOpenMinutes(windows) >= 480);
});

test("all-day without transparency does not infer 24-hour busy", () => {
  const mapped = mapGoogleEvent({
    event: {
      id: "summit",
      summary: "Avalanche Summit",
      start: { date: "2026-09-17" },
      end: { date: "2026-09-18" },
    },
    calendarId: "primary",
    userTimezone: TZ,
  });
  assert.ok(mapped);
  assert.equal(mapped.blocksTime, false);
  assert.equal(eventBlocksTime(mapped), false);
});

test("opaque all-day event blocks when intended", () => {
  const mapped = mapGoogleEvent({
    event: {
      id: "ooo",
      summary: "Out of office",
      start: { date: "2026-09-17" },
      end: { date: "2026-09-18" },
      transparency: "opaque",
    },
    calendarId: "primary",
    userTimezone: TZ,
  });
  assert.ok(mapped);
  assert.equal(mapped.blocksTime, true);
  assert.equal(eventBlocksTime(mapped), true);
  const windows = findFreeTime({
    start: new Date("2026-09-17T13:00:00.000Z"),
    end: new Date("2026-09-17T22:00:00.000Z"),
    durationMinutes: 30,
    events: [mapped],
    timezone: TZ,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    useWorkingHours: true,
  });
  assert.equal(totalOpenMinutes(windows), 0);
});

test("cached google all-day without transparency rematches as free", () => {
  const cached = rematchPersistedEvent(
    baseEvent({
      source: "google",
      allDay: true,
      blocksTime: true,
      start: "2026-09-17T04:00:00.000Z",
      end: "2026-09-18T04:00:00.000Z",
    }),
  );
  assert.equal(cached.blocksTime, false);
  assert.equal(eventBlocksTime(cached), false);
});

test("all-day duration never renders as minutes", () => {
  const event = baseEvent({
    title: "Stay",
    allDay: true,
    start: "2026-09-16T04:00:00.000Z",
    end: "2026-09-19T04:00:00.000Z",
    location: "Rodeway Inn Meadowlands",
  });
  const row = presentEventRow({ event, timezone: TZ });
  assert.equal(row.time, "3-day event");
  assert.match(row.meta, /Sep 16–18/);
  assert.doesNotMatch(row.time, /min/);
  assert.doesNotMatch(row.meta, /min/);
  assert.doesNotMatch(formatAllDayLabel(event.start, event.end, TZ), /min/);
  assert.doesNotMatch(formatAllDayRange(event.start, event.end, TZ), /min/);
});

test("list copy suppresses Google boilerplate and raw URLs", () => {
  const raw =
    "To see detailed information for automatically created events, visit https://g.co/calendar and also https://mail.google.com/mail?extsrc=sync";
  assert.equal(sanitizeListCopy(raw), undefined);
});

test("Brief open time ignores non-blocking all-day events", () => {
  const state = createSeedState(NOW);
  const stay = baseEvent({
    id: "gcal_stay",
    title: "Stay at Rodeway Inn Meadowlands",
    source: "google",
    allDay: true,
    blocksTime: false,
    start: "2026-09-17T04:00:00.000Z",
    end: "2026-09-18T04:00:00.000Z",
  });
  const withStay = generateBrief({
    now: NOW,
    profile: state.profile,
    events: [...state.events, stay],
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  });
  const withoutStay = generateBrief({
    now: NOW,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  });
  assert.equal(withStay.openMinutes, withoutStay.openMinutes);
  const row = withStay.timeline.find((item) => item.eventId === "gcal_stay");
  assert.ok(row);
  assert.doesNotMatch(row.timeLabel, /min/);
  assert.doesNotMatch(JSON.stringify(row), /https?:\/\//);
});

test("Assistant free time ignores non-blocking all-day events", () => {
  const state = createSeedState(NOW);
  const stay = baseEvent({
    id: "gcal_stay",
    title: "Stay",
    source: "google",
    allDay: true,
    blocksTime: false,
    start: "2026-09-17T04:00:00.000Z",
    end: "2026-09-18T04:00:00.000Z",
  });
  const result = fulfillIntent({ type: "answer", topic: "open_time" }, contextWith([...state.events, stay]));
  const baseline = fulfillIntent({ type: "answer", topic: "open_time" }, contextWith(state.events));
  assert.equal(result.message, baseline.message);
});

test("generated suggestions snap to 15-minute increments", () => {
  const snapped = snapZonedDate(new Date("2026-09-17T21:56:00.000Z"), TZ);
  const parts = zonedParts(TZ, snapped);
  assert.equal(parts.minute % 15, 0);
  assert.equal(parts.hour, 18);
  assert.equal(parts.minute, 0);
  const slot = firstSnappedSlot("2026-09-17T21:56:00.000Z", "2026-09-17T23:30:00.000Z", 30, TZ);
  assert.ok(slot);
  const startParts = zonedParts(TZ, new Date(slot.start));
  assert.equal(startParts.minute % 15, 0);
});

test("explicit 3:07 PM remains 3:07 PM", () => {
  const result = fulfillIntent(
    {
      type: "create_event",
      title: "Test Atlas Event",
      when: { day: "today", hour: 15, minute: 7 },
      durationMinutes: 30,
    },
    contextWith(createSeedState(NOW).events.filter((event) => event.category !== "meeting")),
  );
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  if (result.actions[0]?.payload?.type !== "createEvent") return;
  const start = zonedParts(TZ, new Date(result.actions[0].payload.event.start));
  assert.equal(start.hour, 15);
  assert.equal(start.minute, 7);
});

test("every suggestion option has a unique stable id", () => {
  const result = fulfillIntent(
    { type: "create_event", title: "Test Atlas Event", when: { hour: 11 }, durationMinutes: 30 },
    contextWith(createSeedState(NOW).events),
  );
  assert.ok(result.choices && result.choices.length >= 1);
  const ids = result.choices.map((choice) => choice.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const choice of result.choices) {
    assert.match(choice.id, /^slot:/);
    const parts = zonedParts(TZ, new Date(choice.start));
    assert.equal(parts.minute % 15, 0);
  }
});

test("selecting a suggestion creates a proposal and does not mutate", () => {
  const state = createSeedState(NOW);
  const store = createMemoryStore(state);
  const ctx = contextWith(state.events);
  const result = fulfillIntent(
    { type: "create_event", title: "Test Atlas Event", when: { hour: 11 }, durationMinutes: 30 },
    ctx,
  );
  assert.ok(result.choices?.[0]);
  const before = store.getState().events.length;
  const action = actionFromCreateChoice(ctx, { type: "create_event", title: "Test Atlas Event", durationMinutes: 30 }, result.choices[0]);
  assert.ok(action);
  assert.equal(action.status, "proposed");
  assert.equal(store.getState().events.length, before);
  const workspace = selectActiveChoice(
    replaceActiveResponse(emptyWorkspace(), {
      id: "t1",
      prompt: "Schedule Test Atlas Event",
      content: result.message,
      actions: [],
      choices: result.choices,
      pending: { type: "create_event", title: "Test Atlas Event", durationMinutes: 30 },
    }),
    result.choices[0].id,
    action,
  );
  assert.equal(workspace.active?.selectedChoiceId, result.choices[0].id);
  assert.equal(workspace.active?.actions[0]?.status, "proposed");
  assert.equal(store.getState().events.length, before);
});

test("Apply mutates and Dismiss does not", () => {
  const state = createSeedState(NOW);
  const store = createMemoryStore(state);
  const ctx = contextWith(state.events);
  const result = fulfillIntent(
    { type: "create_event", title: "Test Atlas Event", when: { day: "tomorrow", hour: 15 }, durationMinutes: 30 },
    ctx,
  );
  const proposed = result.actions[0];
  assert.ok(proposed);
  const before = store.getState().events.length;
  const workspace = replaceActiveResponse(emptyWorkspace(), {
    id: "t1",
    prompt: "Schedule Test Atlas Event tomorrow at 3 PM for 30 minutes.",
    content: result.message,
    actions: [proposed],
  });
  const dismissed = updateActiveAction(workspace, proposed.id, { ...proposed, status: "dismissed" });
  assert.equal(dismissed.active?.actions[0]?.status, "dismissed");
  assert.equal(store.getState().events.length, before);
  applyAssistantAction(store, proposed);
  assert.equal(store.getState().events.length, before + 1);
});

test("30-minute request remains 30 minutes end-to-end", () => {
  const text = "Schedule Test Atlas Event tomorrow at 3 PM for 30 minutes.";
  const classified = classifyIntent(text);
  const refined = refineModelIntent(undefined, classified, text, contextWith(createSeedState(NOW).events));
  assert.equal(refined.type, "create_event");
  assert.equal(refined.durationMinutes, 30);
  assert.equal(refined.title, "Test Atlas Event");
  const result = fulfillIntent(refined, contextWith(createSeedState(NOW).events));
  const payload = result.actions[0]?.payload;
  assert.equal(payload?.type, "createEvent");
  if (payload?.type !== "createEvent") return;
  const minutes = (new Date(payload.event.end).getTime() - new Date(payload.event.start).getTime()) / 60_000;
  assert.equal(minutes, 30);
});

test("natural-language request does not become event title", () => {
  const text = "Schedule Test Atlas Event tomorrow at 3 PM for 30 minutes.";
  assert.equal(titleFromRequest(text), "Test Atlas Event");
  const refined = refineModelIntent(
    undefined,
    { type: "create_event", title: text, when: { day: "tomorrow", hour: 15 }, durationMinutes: 30 },
    text,
    contextWith([]),
  );
  assert.equal(refined.title, "Test Atlas Event");
  const result = fulfillIntent(refined, contextWith([]));
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  if (result.actions[0]?.payload?.type !== "createEvent") return;
  assert.equal(result.actions[0].payload.event.title, "Test Atlas Event");
  assert.doesNotMatch(result.actions[0].payload.event.title, /Schedule Test Atlas Event tomorrow/);
});

test("Assistant create proposal does not invoke a manual Add form", () => {
  const result = fulfillIntent(
    { type: "create_event", title: "Test Atlas Event", when: { day: "tomorrow", hour: 15 }, durationMinutes: 30 },
    contextWith([]),
  );
  assert.equal(result.actions[0]?.kind, "propose");
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  assert.equal(result.intentType, "create_event");
});

test("Google destination is included in the proposal", () => {
  const result = fulfillIntent(
    { type: "create_event", title: "Test Atlas Event", when: { day: "tomorrow", hour: 15 }, durationMinutes: 30 },
    contextWith([], { googleWriteEnabled: true }),
  );
  assert.match(result.actions[0]?.destinationLabel ?? "", /Personal/);
  assert.equal(result.actions[0]?.payload?.type, "createEvent");
  if (result.actions[0]?.payload?.type !== "createEvent") return;
  assert.equal(result.actions[0].payload.event.source, "google");
  assert.equal(result.actions[0].payload.event.calendarId, "primary");
});

test("merged next-meeting selection is chronological regardless of source", () => {
  const pepinho = createSeedState(NOW).events.find((event) => event.id === "evt_pepinho");
  assert.ok(pepinho);
  const earlierGoogle = baseEvent({
    id: "gcal_standup",
    title: "Standup",
    source: "google",
    category: "meeting",
    start: "2026-09-17T16:30:00.000Z",
    end: "2026-09-17T17:00:00.000Z",
  });
  const next = nextEligibleMeeting([pepinho, earlierGoogle], NOW);
  assert.equal(next?.id, "gcal_standup");
  const prepared = fulfillIntent({ type: "prepare_meeting" }, contextWith([pepinho, earlierGoogle]));
  assert.match(prepared.message, /Standup/);
});

test("deserialize rematches cached all-day Google events", () => {
  const state = createSeedState(NOW);
  state.events.push(
    baseEvent({
      id: "gcal_hotel",
      title: "Stay",
      source: "google",
      allDay: true,
      blocksTime: true,
      start: "2026-09-17T04:00:00.000Z",
      end: "2026-09-18T04:00:00.000Z",
    }),
  );
  const restored = deserializeState(serializeState(state));
  const hotel = restored?.events.find((event) => event.id === "gcal_hotel");
  assert.equal(hotel?.blocksTime, false);
});
