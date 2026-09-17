import assert from "node:assert/strict";
import { test } from "node:test";
import { findFreeTime, suggestFocusWindow, totalOpenMinutes } from "../lib/calendar/freeTime";
import { createSeedState } from "../lib/data/seed";

const NOW = new Date("2026-09-17T16:00:00.000Z");

test("findFreeTime returns working-hours gaps from seed events", () => {
  const state = createSeedState(NOW);
  const start = new Date("2026-09-17T04:00:00.000Z");
  const end = new Date("2026-09-18T04:00:00.000Z");
  const windows = findFreeTime({
    start,
    end,
    durationMinutes: 30,
    events: state.events,
    timezone: state.profile.timezone,
    workingHours: state.profile.workingHours,
    useWorkingHours: true,
  });

  assert.ok(windows.length >= 2);
  assert.equal(windows[0]?.minutes, 120);
  assert.ok(totalOpenMinutes(windows) >= 400);
});

test("suggestFocusWindow at 3:24 PM does not recommend elapsed morning time", () => {
  const now = new Date("2026-09-17T19:24:00.000Z");
  const windows = findFreeTime({
    start: now,
    end: new Date("2026-09-18T04:00:00.000Z"),
    durationMinutes: 30,
    events: [
      {
        ...createSeedState(now).events[0]!,
        id: "evt_live_bike",
        title: "Bike",
        start: "2026-09-17T18:30:00.000Z",
        end: "2026-09-17T20:00:00.000Z",
        category: "training",
        demo: false,
      },
    ],
    timezone: "America/New_York",
    workingHours: createSeedState(now).profile.workingHours,
    useWorkingHours: true,
    afterWorkoutBufferMinutes: 30,
  });
  const focus = suggestFocusWindow(windows, "America/New_York", now);
  assert.ok(focus);
  assert.ok(new Date(focus.start).getTime() >= now.getTime());
  assert.ok(new Date(focus.start).getTime() >= Date.parse("2026-09-17T19:24:00.000Z"));
});

test("suggestFocusWindow prefers the 1–4 PM block when it is free", () => {
  const state = createSeedState(NOW);
  const windows = findFreeTime({
    start: new Date("2026-09-17T04:00:00.000Z"),
    end: new Date("2026-09-18T04:00:00.000Z"),
    durationMinutes: 30,
    events: state.events,
    timezone: state.profile.timezone,
    workingHours: state.profile.workingHours,
    useWorkingHours: true,
  });
  const focus = suggestFocusWindow(windows, state.profile.timezone);
  assert.ok(focus);
  assert.equal(focus.minutes, 180);
  assert.match(focus.start, /T17:00:00.000Z/);
  assert.match(focus.end, /T20:00:00.000Z/);
});
