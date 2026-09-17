import assert from "node:assert/strict";
import { test } from "node:test";
import { fulfillIntent } from "../lib/assistant/fulfill";
import {
  destinationsMatch,
  googleWriteConfigurationError,
  mergeGoogleConnection,
  resolveCreateDestination,
  resolveCreateDestinationFromState,
} from "../lib/calendar/destination";
import { createMemoryStore } from "../lib/data/memory-store";
import { isDemoEvent, presentAppState } from "../lib/data/sample";
import { createSeedState } from "../lib/data/seed";
import {
  actionWriteError,
  executeAssistantWrite,
  googleWriteRequestForDestination,
} from "../lib/google/applyWrite";
import { mergeCalendarEvents } from "../lib/google/merge";
import type { AssistantAction, AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";
import type { ConnectionState } from "../lib/types/profile";

const NOW = new Date("2026-09-17T16:00:00.000Z");
const EMAIL = "copicatxyz@gmail.com";

function googleConnection(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: "connected",
    writeEnabled: true,
    email: EMAIL,
    calendars: [{ id: EMAIL, summary: EMAIL, primary: true, included: true, accessRole: "owner" }],
    ...overrides,
  };
}

function context(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: state.profile.timezone,
    profile: state.profile,
    events: [],
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    connections: { ...state.connections, google: googleConnection() },
    googleWriteEnabled: true,
    ...overrides,
  };
}

function createAction(destination = resolveCreateDestinationFromState({ connections: { google: googleConnection(), icloud: { status: "disconnected" }, telegram: { status: "disconnected" } } })): AssistantAction {
  return {
    id: "act_write",
    kind: "propose",
    tool: "createEvent",
    label: "Schedule Atlas Write Test",
    summary: "Atlas Write Test",
    status: "proposed",
    destination,
    destinationLabel: destination.label,
    payload: {
      type: "createEvent",
      event: {
        title: "Atlas Write Test",
        start: "2026-09-18T19:00:00.000Z",
        end: "2026-09-18T19:30:00.000Z",
        source: destination.provider === "google" ? "google" : "local",
        calendarId: destination.provider === "google" ? destination.calendarId : undefined,
      },
    },
  };
}

test("Google writes enabled selects Google destination", () => {
  const destination = resolveCreateDestination({
    googleConnected: true,
    googleWritesEnabled: true,
    includedCalendars: [{ id: EMAIL, summary: EMAIL, primary: true, included: true }],
  });
  assert.equal(destination.provider, "google");
  assert.equal(destination.calendarId, EMAIL);
  assert.match(destination.label, /copicatxyz@gmail.com/);
  assert.match(destination.label, /Google Calendar/);
});

test("included calendar is not automatically local", () => {
  const destination = resolveCreateDestinationFromState({
    connections: {
      google: googleConnection(),
      icloud: { status: "disconnected" },
      telegram: { status: "disconnected" },
    },
  });
  assert.notEqual(destination.provider, "local");
  assert.notEqual(destination.label, "Atlas · Local");
});

test("proposal destination matches Apply destination", () => {
  const result = fulfillIntent(
    { type: "create_event", title: "Atlas Write Test", when: { day: "tomorrow", hour: 15 }, durationMinutes: 30 },
    context(),
  );
  const action = result.actions[0];
  assert.ok(action?.destination);
  assert.equal(action.destination?.provider, "google");
  if (action.payload?.type !== "createEvent" || action.destination?.provider !== "google") return;
  assert.equal(action.payload.event.calendarId, action.destination.calendarId);
  assert.equal(action.payload.event.source, "google");
  const request = googleWriteRequestForDestination(
    action.payload,
    { ...createSeedState(NOW), connections: { ...createSeedState(NOW).connections, google: googleConnection() } },
    action.destination,
  );
  assert.ok(request);
  assert.equal(request.kind, "create");
  if (request.kind !== "create") return;
  assert.equal(request.calendarId, action.destination.calendarId);
  assert.equal(destinationsMatch(action.destination, {
    provider: "google",
    calendarId: request.calendarId,
    label: action.destination.label,
  }), true);
});

test("Google failure cannot show APPLIED or create a local fallback", async () => {
  const state = createSeedState(NOW);
  state.connections.google = googleConnection();
  const store = createMemoryStore(state);
  const before = store.getState().events.length;
  const action = createAction();
  const result = await executeAssistantWrite(store, action, async () => ({
    ok: false,
    error: "Could not create this event in Google Calendar.",
  }));
  assert.equal(result.status, "proposed");
  assert.notEqual(result.status, "applied");
  assert.match(result.error ?? "", /Could not create this event in Google Calendar/);
  assert.equal(store.getState().events.length, before);
  assert.equal(store.getState().events.some((event) => event.title === "Atlas Write Test"), false);
});

test("successful Google create requires providerEventId", async () => {
  const state = createSeedState(NOW);
  state.connections.google = googleConnection();
  const store = createMemoryStore(state);
  const missingId = await executeAssistantWrite(store, createAction(), async () => ({
    ok: true,
    event: {
      id: "evt_fake",
      title: "Atlas Write Test",
      description: "",
      start: "2026-09-18T19:00:00.000Z",
      end: "2026-09-18T19:30:00.000Z",
      location: "",
      participants: [],
      privacy: "private",
      preparationRequired: false,
      preparationMinutes: 0,
      source: "google",
      category: "personal",
      status: "confirmed",
      calendarId: EMAIL,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    } as CalendarEvent,
  }));
  assert.equal(missingId.status, "proposed");
  assert.match(missingId.error ?? "", /Could not create this event in Google Calendar/);
  assert.equal(store.getState().events.some((event) => event.title === "Atlas Write Test"), false);

  const created = await executeAssistantWrite(store, createAction(), async () => ({
    ok: true,
    event: {
      id: "gcal_write",
      title: "Atlas Write Test",
      description: "",
      start: "2026-09-18T19:00:00.000Z",
      end: "2026-09-18T19:30:00.000Z",
      location: "",
      participants: [],
      privacy: "private",
      preparationRequired: false,
      preparationMinutes: 0,
      source: "google",
      category: "personal",
      status: "confirmed",
      providerEventId: "gcal_evt_1",
      calendarId: EMAIL,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    } as CalendarEvent,
  }));
  assert.equal(created.status, "applied");
  const stored = store.getState().events.filter((event) => event.title === "Atlas Write Test");
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.providerEventId, "gcal_evt_1");
  assert.equal(stored[0]?.source, "google");
});

test("user-created local event is not hidden by Sample toggle", () => {
  const state = createSeedState(NOW);
  state.profile.showSampleData = false;
  state.profile.sampleDataExplicit = true;
  state.events.push({
    id: "evt_real_local",
    title: "Real local note",
    description: "",
    start: "2026-09-18T19:00:00.000Z",
    end: "2026-09-18T19:30:00.000Z",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "personal",
    status: "confirmed",
    demo: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
  const visible = presentAppState(state);
  assert.equal(isDemoEvent({ id: "evt_real_local", demo: false }), false);
  assert.ok(visible.events.some((event) => event.id === "evt_real_local"));
});

test("demo seed event is hidden by Sample toggle", () => {
  const state = createSeedState(NOW);
  state.profile.showSampleData = false;
  state.profile.sampleDataExplicit = true;
  const visible = presentAppState(state);
  assert.equal(isDemoEvent(state.events.find((event) => event.id === "evt_bike")!), true);
  assert.equal(visible.events.some((event) => event.id === "evt_bike"), false);
  assert.equal(visible.events.some((event) => event.demo === true), false);
});

test("refresh after Google create preserves one event and does not duplicate", () => {
  const local = createSeedState(NOW).events.filter((event) => event.source === "local");
  const googleEvent: CalendarEvent = {
    id: "gcal_copicatxyz@gmail.com_gcal_evt_1",
    title: "Atlas Write Test",
    description: "",
    start: "2026-09-18T19:00:00.000Z",
    end: "2026-09-18T19:30:00.000Z",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "personal",
    status: "confirmed",
    providerEventId: "gcal_evt_1",
    calendarId: EMAIL,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  const afterCreate = mergeCalendarEvents(local, [googleEvent]);
  const afterSync = mergeCalendarEvents(afterCreate, [{ ...googleEvent, title: "Atlas Write Test" }]);
  const matches = afterSync.filter((event) => event.title === "Atlas Write Test");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.providerEventId, "gcal_evt_1");
});

test("status merge keeps calendars and write destination", () => {
  const current = googleConnection();
  const merged = mergeGoogleConnection(current, { status: "connected", email: EMAIL });
  assert.equal(merged.calendars?.[0]?.id, EMAIL);
  assert.equal(merged.writeEnabled, true);
  assert.equal(merged.defaultWriteCalendarId, EMAIL);
  const dest = resolveCreateDestinationFromState({
    connections: {
      google: merged,
      icloud: { status: "disconnected" },
      telegram: { status: "disconnected" },
    },
  });
  assert.equal(dest.provider, "google");
});

test("writes enabled without a writable calendar is a configuration error", () => {
  const error = googleWriteConfigurationError({
    status: "connected",
    writeEnabled: true,
    calendars: [{ id: "holidays", summary: "Holidays", included: true, accessRole: "reader" }],
  });
  assert.match(error ?? "", /no writable Google calendar/);
  const dest = resolveCreateDestination({
    googleConnected: true,
    googleWritesEnabled: true,
    includedCalendars: [{ id: "holidays", summary: "Holidays", included: true, accessRole: "reader" }],
  });
  assert.equal(dest.provider, "local");
});

test("actionWriteError keeps the proposal for retry", () => {
  const failed = actionWriteError(createAction(), "Could not create this event in Google Calendar.");
  assert.equal(failed.status, "proposed");
  assert.equal(failed.destination?.provider, "google");
});
