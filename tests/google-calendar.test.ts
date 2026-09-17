import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBrief } from "../lib/brief/generateBrief";
import { eventsConflict, suggestMoveWindows } from "../lib/calendar/moveSuggestions";
import { findFreeTime } from "../lib/calendar/freeTime";
import { buildModelContext } from "../lib/assistant/context";
import { fulfillIntent } from "../lib/assistant/fulfill";
import { createMemoryStore } from "../lib/data/memory-store";
import { createSeedState } from "../lib/data/seed";
import { applyAssistantAction } from "../lib/assistant/apply";
import {
  createMemoryCredentialStore,
  type CalendarCredential,
} from "../lib/google/credentials";
import { googleWriteRequestForPayload, shouldWriteGoogle } from "../lib/google/applyWrite";
import { mergeCalendarEvents, removeProviderEvents } from "../lib/google/merge";
import {
  atlasEventId,
  defaultIncludedCalendars,
  eventKey,
  googleAllDayRange,
  googleDateToUtc,
  mapGoogleEvent,
} from "../lib/google/mapEvent";
import { buildGoogleAuthUrl, createOAuthState, hashOAuthState, refreshGoogleAccessToken, scopesForMode } from "../lib/google/oauth";
import { GoogleCalendarProvider } from "../lib/google/provider";
import { isGoogleSyncStale } from "../lib/google/stale";
import { syncGoogleCalendar } from "../lib/google/sync";
import { assertGoogleWriteAllowed, writeGoogleEvent } from "../lib/google/write";
import { publicGoogleStatus } from "../lib/google/status";
import { createCalendarRepository } from "../lib/repositories/calendar";
import type { AssistantContext } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const TZ = "America/New_York";
const NOW = new Date("2026-09-17T16:00:00.000Z");

function googleEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "gcal_primary_meet1",
    title: "Design review",
    description: "Do not leak this",
    start: "2026-09-17T18:00:00.000Z",
    end: "2026-09-17T19:00:00.000Z",
    location: "Meet",
    participants: [{ id: "a@x.com", name: "Alex", role: "attendee" }],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "meeting",
    status: "confirmed",
    providerEventId: "meet1",
    calendarId: "primary",
    blocksTime: true,
    timezone: TZ,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function contextWith(events: CalendarEvent[]): AssistantContext {
  const state = createSeedState(NOW);
  return {
    now: NOW.toISOString(),
    timezone: state.profile.timezone,
    profile: state.profile,
    events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
    connections: { ...state.connections, google: { status: "connected", calendars: [{ id: "primary", summary: "Personal", primary: true, included: true }] } },
  };
}

test("OAuth state is random and scopes stay minimal", () => {
  const left = createOAuthState();
  const right = createOAuthState();
  assert.notEqual(left, right);
  assert.notEqual(hashOAuthState(left), left);
  assert.equal(scopesForMode("readonly"), "https://www.googleapis.com/auth/calendar.readonly");
  assert.match(scopesForMode("write"), /calendar.events/);
  const url = buildGoogleAuthUrl({
    state: "abc",
    env: {
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3002/api/google/callback",
    } as unknown as NodeJS.ProcessEnv,
  });
  assert.match(url, /accounts.google.com/);
  assert.match(url, /calendar.readonly/);
  assert.doesNotMatch(url, /client_secret/);
});

test("memory credential store isolates tokens from client state", async () => {
  const store = createMemoryCredentialStore();
  assert.equal(await store.get(), null);
  await store.set({
    provider: "google",
    accessToken: "tok",
    refreshToken: "ref",
    expiresAt: Date.now() + 60_000,
    email: "dan@example.com",
  });
  const saved = await store.get();
  assert.equal(saved?.accessToken, "tok");
  await store.clear();
  assert.equal(await store.get(), null);
});

test("token refresh replaces the access token and keeps the refresh token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ access_token: "new-token", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.readonly" }),
      { status: 200 },
    )) as typeof fetch;
  try {
    const next = await refreshGoogleAccessToken({
      credential: {
        provider: "google",
        accessToken: "old",
        refreshToken: "refresh-keep",
        expiresAt: 0,
      },
      env: {
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3002/api/google/callback",
      } as unknown as NodeJS.ProcessEnv,
    });
    assert.equal(next.accessToken, "new-token");
    assert.equal(next.refreshToken, "refresh-keep");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps timed Google events into Atlas events without losing provider ids", () => {
  const mapped = mapGoogleEvent({
    event: {
      id: "evt123",
      status: "confirmed",
      summary: "Investor call",
      description: "Private notes",
      location: "Zoom",
      start: { dateTime: "2026-09-17T15:00:00-04:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-09-17T16:00:00-04:00", timeZone: "America/New_York" },
      attendees: [{ email: "marcus@example.com", displayName: "Marcus" }],
    },
    calendarId: "primary",
    userTimezone: TZ,
  });
  assert.ok(mapped);
  assert.equal(mapped.source, "google");
  assert.equal(mapped.providerEventId, "evt123");
  assert.equal(mapped.calendarId, "primary");
  assert.equal(mapped.id, atlasEventId("primary", "evt123"));
  assert.equal(mapped.start, "2026-09-17T19:00:00.000Z");
  assert.equal(mapped.allDay, false);
  assert.equal(mapped.participants[0]?.name, "Marcus");
});

test("all-day Google dates stay all-day and do not become midnight clocks", () => {
  const range = googleAllDayRange(
    { date: "2026-09-17", timeZone: "America/Los_Angeles" },
    { date: "2026-09-18", timeZone: "America/Los_Angeles" },
    "America/Los_Angeles",
  );
  assert.equal(range.start.toISOString(), googleDateToUtc({ date: "2026-09-17", timeZone: "America/Los_Angeles" }, "America/Los_Angeles").toISOString());
  const mapped = mapGoogleEvent({
    event: {
      id: "all1",
      summary: "Out of office",
      start: { date: "2026-09-17" },
      end: { date: "2026-09-18" },
    },
    calendarId: "primary",
    userTimezone: "America/Los_Angeles",
  });
  assert.ok(mapped);
  assert.equal(mapped.allDay, true);
  assert.equal(mapped.timezone, "America/Los_Angeles");
});

test("timezone conversion does not assume America/New_York", () => {
  const utc = googleDateToUtc(
    { dateTime: "2026-09-17T09:00:00-07:00", timeZone: "America/Los_Angeles" },
    "America/Los_Angeles",
  );
  assert.equal(utc.toISOString(), "2026-09-17T16:00:00.000Z");
});

test("cancelled Google events are mapped cancelled and ignored by free time", () => {
  const mapped = mapGoogleEvent({
    event: {
      id: "cxl",
      status: "cancelled",
      summary: "Old standup",
      start: { dateTime: "2026-09-17T14:00:00.000Z" },
      end: { dateTime: "2026-09-17T14:30:00.000Z" },
    },
    calendarId: "primary",
    userTimezone: TZ,
  });
  assert.ok(mapped);
  assert.equal(mapped.status, "cancelled");
  assert.equal(mapped.blocksTime, false);
});

test("multiple calendars default to primary plus owned visible calendars", () => {
  const calendars = defaultIncludedCalendars([
    { id: "primary", summary: "Personal", primary: true, selected: true, accessRole: "owner" },
    { id: "work", summary: "Work", selected: true, accessRole: "owner" },
    { id: "bday", summary: "Birthdays", selected: true, accessRole: "reader" },
  ]);
  assert.equal(calendars.find((item) => item.id === "primary")?.included, true);
  assert.equal(calendars.find((item) => item.id === "work")?.included, true);
  assert.equal(calendars.find((item) => item.id === "bday")?.included, false);
});

test("merge keeps local events and prevents Google duplicates", () => {
  const seed = createSeedState(NOW).events;
  const first = googleEvent();
  const duplicate = googleEvent({ id: "other-id", title: "Design review updated" });
  const merged = mergeCalendarEvents(seed, [first]);
  const again = mergeCalendarEvents(merged, [duplicate]);
  assert.equal(again.filter((event) => event.source === "google").length, 1);
  assert.equal(again.filter((event) => event.source === "local").length, seed.length);
  assert.equal(again.find((event) => event.source === "google")?.title, "Design review updated");
  assert.equal(eventKey(first), eventKey(duplicate));
});

test("Google busy events participate in free-time and conflict validation", () => {
  const seed = createSeedState(NOW);
  const events = [...seed.events, googleEvent()];
  const windows = findFreeTime({
    start: new Date("2026-09-17T13:00:00.000Z"),
    end: new Date("2026-09-17T22:00:00.000Z"),
    durationMinutes: 90,
    events,
    timezone: TZ,
    workingHours: seed.profile.workingHours,
    useWorkingHours: true,
  });
  assert.equal(
    windows.some((window) => window.start < "2026-09-17T19:00:00.000Z" && window.end > "2026-09-17T18:00:00.000Z"),
    false,
  );
  assert.equal(eventsConflict("2026-09-17T18:00:00.000Z", "2026-09-17T18:30:00.000Z", events), true);
  const moves = suggestMoveWindows({
    event: seed.events[0],
    events,
    timezone: TZ,
    workingHours: seed.profile.workingHours,
    after: NOW,
  });
  assert.equal(
    moves.some((item) => item.start === "2026-09-17T18:00:00.000Z"),
    false,
  );
});

test("Brief and Assistant receive normalized Google events without provider tokens", () => {
  const seed = createSeedState(NOW);
  const events = [...seed.events, googleEvent()];
  const brief = generateBrief({
    now: NOW,
    profile: seed.profile,
    events,
    tasks: seed.tasks,
    workouts: seed.workouts,
    meetings: seed.meetings,
  });
  assert.ok(brief.items.some((item) => item.title === "Design review"));
  const model = buildModelContext(contextWith(events));
  assert.ok(JSON.stringify(model).includes("Design review"));
  assert.equal(JSON.stringify(model).includes("accessToken"), false);
  assert.equal(JSON.stringify(model).includes("refreshToken"), false);
  assert.equal(JSON.stringify(model).includes("Do not leak this"), false);
});

test("Assistant day overview uses merged Google events", () => {
  const result = fulfillIntent({ type: "answer", topic: "day" }, contextWith([...createSeedState(NOW).events, googleEvent()]));
  assert.match(result.message, /Design review/);
});

test("disconnect removes Google events and keeps local Atlas events", () => {
  const seed = createSeedState(NOW);
  const merged = mergeCalendarEvents(seed.events, [googleEvent()]);
  const localOnly = removeProviderEvents(merged);
  assert.equal(localOnly.every((event) => event.source === "local"), true);
  assert.equal(localOnly.length, seed.events.length);
});

test("calendar repository upserts Google events by provider id", () => {
  const store = createMemoryStore(createSeedState(NOW));
  const calendar = createCalendarRepository(store);
  const first = calendar.createEvent({
    title: "Sync",
    start: "2026-09-18T13:00:00.000Z",
    end: "2026-09-18T14:00:00.000Z",
    source: "google",
    providerEventId: "abc",
    calendarId: "primary",
  });
  const second = calendar.createEvent({
    title: "Sync updated",
    start: "2026-09-18T13:00:00.000Z",
    end: "2026-09-18T14:00:00.000Z",
    source: "google",
    providerEventId: "abc",
    calendarId: "primary",
  });
  assert.equal(first.id, second.id);
  assert.equal(store.getState().events.filter((event) => event.providerEventId === "abc").length, 1);
  assert.equal(second.title, "Sync updated");
});

test("public Google status never includes secrets", async () => {
  const store = createMemoryCredentialStore({
    provider: "google",
    accessToken: "sk-secret",
    refreshToken: "refresh-secret",
    expiresAt: Date.now() + 1000,
    email: "dan@example.com",
  });
  const status = await publicGoogleStatus(store);
  assert.equal(JSON.stringify(status).includes("sk-secret"), false);
  assert.equal(JSON.stringify(status).includes("refresh-secret"), false);
  assert.equal(status.connection.email, "dan@example.com");
});

test("sync uses the provider listEvents contract and reports stale state", async () => {
  const store = createMemoryCredentialStore({
    provider: "google",
    accessToken: "tok",
    expiresAt: Date.now() + 60_000,
  });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("calendarList")) {
      return new Response(JSON.stringify({ items: [{ id: "primary", summary: "Personal", primary: true, selected: true, accessRole: "owner" }] }), { status: 200 });
    }
    if (url.includes("/events")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "g1",
              summary: "Standup",
              start: { dateTime: "2026-09-17T13:00:00.000Z" },
              end: { dateTime: "2026-09-17T13:15:00.000Z" },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const result = await syncGoogleCalendar({
    store,
    timezone: TZ,
    fetchImpl,
    now: NOW,
  });
  assert.equal(result.connection.status, "connected");
  assert.equal(result.events[0]?.title, "Standup");
  assert.equal(isGoogleSyncStale(NOW.toISOString(), NOW.getTime() + 6 * 60_000), true);
  assert.equal(isGoogleSyncStale(NOW.toISOString(), NOW.getTime() + 60_000), false);
});

test("GoogleCalendarProvider listCalendars and listEvents stay mocked", async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("calendarList")) {
      return new Response(JSON.stringify({ items: [{ id: "primary", summary: "Personal", primary: true, accessRole: "owner" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  }) as typeof fetch;
  const provider = new GoogleCalendarProvider({ accessToken: "tok", userTimezone: TZ, fetchImpl });
  const calendars = await provider.listCalendars();
  assert.equal(calendars[0]?.id, "primary");
  const events = await provider.listEvents({ start: NOW, end: new Date("2026-09-18T00:00:00.000Z"), calendarIds: ["primary"] });
  assert.deepEqual(events, []);
});

test("stale included calendar ids do not uncheck the current account primary", async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("calendarList")) {
      return new Response(
        JSON.stringify({
          items: [{ id: "copicatxyz@gmail.com", summary: "copicatxyz@gmail.com", primary: true, selected: true, accessRole: "owner" }],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  }) as typeof fetch;
  const provider = new GoogleCalendarProvider({
    accessToken: "tok",
    userTimezone: TZ,
    includedCalendarIds: ["1cmlxxx4@gmail.com"],
    fetchImpl,
  });
  const calendars = await provider.listCalendars();
  assert.equal(calendars[0]?.id, "copicatxyz@gmail.com");
  assert.equal(calendars[0]?.included, true);
});

test("write success returns a mapped provider event", async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        id: "new1",
        summary: "Swim",
        start: { dateTime: "2026-09-18T11:00:00.000Z" },
        end: { dateTime: "2026-09-18T12:00:00.000Z" },
      }),
      { status: 200 },
    )) as typeof fetch;
  const created = await writeGoogleEvent({
    credential: {
      provider: "google",
      accessToken: "tok",
      expiresAt: Date.now() + 1000,
      scope: "https://www.googleapis.com/auth/calendar.events",
    },
    request: {
      kind: "create",
      calendarId: "primary",
      userTimezone: TZ,
      event: {
        title: "Swim",
        start: "2026-09-18T11:00:00.000Z",
        end: "2026-09-18T12:00:00.000Z",
        source: "google",
      },
    },
    fetchImpl,
  });
  assert.ok(created);
  assert.equal(created.providerEventId, "new1");
  assert.equal(created.source, "google");
});

test("write failure does not create a local fallback event", () => {
  const state = createSeedState(NOW);
  state.connections.google = {
    status: "connected",
    writeEnabled: true,
    calendars: [{ id: "primary", summary: "Personal", primary: true, included: true }],
  };
  const payload = {
    type: "createEvent" as const,
    event: {
      title: "Swim",
      start: "2026-09-18T11:00:00.000Z",
      end: "2026-09-18T12:00:00.000Z",
      source: "google" as const,
      calendarId: "primary",
    },
  };
  assert.equal(shouldWriteGoogle(payload, state), true);
  const request = googleWriteRequestForPayload(payload, state);
  assert.ok(request);
  const store = createMemoryStore(state);
  const before = store.getState().events.length;
  assert.throws(() => assertGoogleWriteAllowed({ provider: "google", accessToken: "x", expiresAt: 1, scope: "https://www.googleapis.com/auth/calendar.readonly" }));
  assert.equal(store.getState().events.length, before);
});

test("local apply still works when Google is not the destination", () => {
  const store = createMemoryStore(createSeedState(NOW));
  const action = applyAssistantAction(store, {
    id: "act_1",
    kind: "propose",
    tool: "createEvent",
    label: "Local",
    summary: "Local",
    status: "proposed",
    payload: {
      type: "createEvent",
      event: {
        title: "Local note",
        start: "2026-09-18T15:00:00.000Z",
        end: "2026-09-18T16:00:00.000Z",
        source: "local",
      },
    },
  });
  assert.equal(action.status, "applied");
  assert.ok(store.getState().events.some((event) => event.title === "Local note" && event.source === "local"));
});

test("recurring instance edits are blocked", () => {
  const credential: CalendarCredential = {
    provider: "google",
    accessToken: "tok",
    expiresAt: Date.now() + 1000,
    scope: "https://www.googleapis.com/auth/calendar.events",
  };
  assert.throws(() =>
    assertGoogleWriteAllowed(credential, googleEvent({ recurringEventId: "series1" })),
  );
});
