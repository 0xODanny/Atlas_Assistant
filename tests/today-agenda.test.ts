import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDaySummaryMessage } from "../lib/assistant/daySummary";
import {
  calendarReadStatus,
  dayEventPhase,
  dayEventsFor,
  groupDayEvents,
  todayCountLabel,
} from "../lib/calendar/dayAgenda";
import { presentAppState } from "../lib/data/sample";
import { createSeedState } from "../lib/data/seed";
import { mergeCalendarEvents } from "../lib/google/merge";
import type { CalendarEvent } from "../lib/types/event";
import type { AppState } from "../lib/data/state";

const TZ = "America/New_York";
const DAY = new Date("2026-09-17T16:00:00.000Z");
const DURING_BIKE = new Date("2026-09-17T19:00:00.000Z");
const AFTER_BIKE = new Date("2026-09-17T21:00:00.000Z");

function liveBike(): CalendarEvent {
  return {
    id: "gcal_copicatxyz@gmail.com_meggmlcsiqheh79i74141jjfsc",
    title: "Bike",
    description: "",
    start: "2026-09-17T18:30:00.000Z",
    end: "2026-09-17T20:00:00.000Z",
    location: "",
    participants: [],
    privacy: "busy-only",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "training",
    status: "confirmed",
    providerEventId: "meggmlcsiqheh79i74141jjfsc",
    calendarId: "copicatxyz@gmail.com",
    demo: false,
    blocksTime: true,
    timezone: TZ,
    createdAt: DAY.toISOString(),
    updatedAt: DAY.toISOString(),
  };
}

function allDayNote(): CalendarEvent {
  return {
    id: "local_note",
    title: "Office closed",
    description: "",
    start: "2026-09-17T04:00:00.000Z",
    end: "2026-09-18T04:00:00.000Z",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "personal",
    status: "confirmed",
    allDay: true,
    demo: false,
    createdAt: DAY.toISOString(),
    updatedAt: DAY.toISOString(),
  };
}

function morningStandup(): CalendarEvent {
  return {
    id: "gcal_standup",
    title: "Standup",
    description: "",
    start: "2026-09-17T13:00:00.000Z",
    end: "2026-09-17T13:30:00.000Z",
    location: "",
    participants: [],
    privacy: "busy-only",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "meeting",
    status: "confirmed",
    providerEventId: "standup1",
    calendarId: "copicatxyz@gmail.com",
    demo: false,
    createdAt: DAY.toISOString(),
    updatedAt: DAY.toISOString(),
  };
}

function visibleToday(state: AppState, now = DAY) {
  const presented = presentAppState(state);
  const events = dayEventsFor(presented.events, now, presented.profile.timezone);
  const groups = groupDayEvents(events, now);
  const status = calendarReadStatus({
    ready: true,
    google: presented.connections.google,
    dayEventCount: events.length,
  });
  return { presented, events, groups, status, label: todayCountLabel(events.length, status) };
}

test("empty Google sync does not wipe a live Bike event", () => {
  const seed = createSeedState(DAY);
  const withBike = mergeCalendarEvents(seed.events, [liveBike()]);
  assert.ok(withBike.some((event) => event.providerEventId === "meggmlcsiqheh79i74141jjfsc"));
  const afterEmpty = mergeCalendarEvents(withBike, []);
  assert.ok(afterEmpty.some((event) => event.providerEventId === "meggmlcsiqheh79i74141jjfsc"));
  assert.equal(
    afterEmpty.filter((event) => event.source === "google").length,
    withBike.filter((event) => event.source === "google").length,
  );
});

test("Today count and agenda agree on the live Bike after sample data is off", () => {
  const state = createSeedState(DAY);
  state.profile.showSampleData = false;
  state.profile.sampleDataExplicit = true;
  state.connections.google = { status: "connected", lastSyncedAt: DAY.toISOString() };
  state.events = mergeCalendarEvents(state.events, [liveBike()]);

  const { events, groups, label } = visibleToday(state, DAY);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.providerEventId, "meggmlcsiqheh79i74141jjfsc");
  assert.equal(events[0]?.title, "Bike");
  assert.equal(label, "1 event");
  assert.equal(
    groups.allDay.length + groups.upcoming.length + groups.now.length + groups.completed.length,
    events.length,
  );
  assert.equal(groups.upcoming[0]?.title, "Bike");
  assert.equal(dayEventPhase(events[0]!, DAY), "upcoming");
});

test("completed events still count on Today", () => {
  const state = createSeedState(DAY);
  state.profile.showSampleData = false;
  state.profile.sampleDataExplicit = true;
  state.connections.google = { status: "connected", lastSyncedAt: DAY.toISOString() };
  state.events = [liveBike(), morningStandup()];

  const { events, groups, label } = visibleToday(state, AFTER_BIKE);
  assert.equal(events.length, 2);
  assert.equal(label, "2 events");
  assert.equal(groups.completed.length, 2);
  assert.equal(groups.upcoming.length, 0);
  assert.deepEqual(
    groups.completed.map((event) => event.title),
    ["Standup", "Bike"],
  );
});

test("all-day, now, and upcoming stay labeled without dropping Bike from the count", () => {
  const { events, groups, label } = visibleToday(
    {
      ...createSeedState(DAY),
      profile: { ...createSeedState(DAY).profile, showSampleData: false, sampleDataExplicit: true },
      connections: { ...createSeedState(DAY).connections, google: { status: "connected", lastSyncedAt: DAY.toISOString() } },
      events: [allDayNote(), liveBike()],
    },
    DURING_BIKE,
  );
  assert.equal(events.length, 2);
  assert.equal(label, "2 events");
  assert.equal(groups.allDay[0]?.title, "Office closed");
  assert.equal(groups.now[0]?.title, "Bike");
  assert.equal(groups.upcoming.length, 0);
});

test("loading and failed sync never confirm 0 events", () => {
  assert.equal(todayCountLabel(0, "loading"), "Loading calendar");
  assert.equal(todayCountLabel(0, "unavailable"), "Calendar unavailable");
  assert.equal(
    calendarReadStatus({
      ready: false,
      google: { status: "connected" },
      dayEventCount: 0,
    }),
    "loading",
  );
  assert.equal(
    calendarReadStatus({
      ready: true,
      syncing: true,
      google: { status: "connected", lastSyncedAt: DAY.toISOString() },
      dayEventCount: 0,
    }),
    "loading",
  );
  assert.equal(
    calendarReadStatus({
      ready: true,
      google: { status: "error", syncError: "google_sync_failed" },
      dayEventCount: 0,
    }),
    "unavailable",
  );
  assert.equal(
    calendarReadStatus({
      ready: true,
      google: { status: "connected", lastSyncedAt: DAY.toISOString() },
      dayEventCount: 0,
    }),
    "ready",
  );
  assert.equal(todayCountLabel(0, "ready"), "0 events");
});

test("Today, Calendar, and Assistant share the same Bike day set", () => {
  const bike = liveBike();
  const events = dayEventsFor([bike], DAY, TZ);
  assert.equal(events.length, 1);
  const summary = buildDaySummaryMessage({
    events: [bike],
    timezone: TZ,
    now: DAY,
    dayStart: DAY,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    workouts: [],
  });
  assert.match(summary, /Bike/);
  assert.match(summary, /2:30\s*PM/);
  assert.match(summary, /4:00\s*PM/);
});
