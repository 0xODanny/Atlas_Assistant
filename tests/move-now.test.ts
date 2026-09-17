import assert from "node:assert/strict";
import { test } from "node:test";
import { dayEventsFor, groupDayEvents } from "../lib/calendar/dayAgenda";
import { suggestFocusWindow, findFreeTime } from "../lib/calendar/freeTime";
import { suggestMoveWindows } from "../lib/calendar/moveSuggestions";
import { validateTimedMove } from "../lib/calendar/moveValidate";
import { createMemoryStore } from "../lib/data/memory-store";
import { createSeedState } from "../lib/data/seed";
import { eventDurationMinutes } from "../lib/format";
import { nextActiveEvent, nextUpcomingEvent } from "../lib/present/status";
import { createCalendarRepository } from "../lib/repositories/calendar";
import type { CalendarEvent } from "../lib/types/event";
import type { Workout } from "../lib/types/training";

const TZ = "America/New_York";
const CLOCK = new Date("2026-09-17T19:24:00.000Z");
const LATER = new Date("2026-09-17T20:10:00.000Z");
const PROVIDER_EVENT_ID = "meggmlcsiqheh79i74141jjfsc";

function liveBike(): CalendarEvent {
  return {
    id: `gcal_copicatxyz@gmail.com_${PROVIDER_EVENT_ID}`,
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
    providerEventId: PROVIDER_EVENT_ID,
    calendarId: "copicatxyz@gmail.com",
    demo: false,
    blocksTime: true,
    timezone: TZ,
    workoutId: "workout_live_bike",
    createdAt: CLOCK.toISOString(),
    updatedAt: CLOCK.toISOString(),
  };
}

function bikeWorkout(): Workout {
  return {
    id: "workout_live_bike",
    eventId: `gcal_copicatxyz@gmail.com_${PROVIDER_EVENT_ID}`,
    sport: "bike",
    duration: 90,
    intensity: "zone2",
    description: "Endurance",
    scheduledTime: "2026-09-17T18:30:00.000Z",
    completed: false,
    weatherDependent: false,
    createdAt: CLOCK.toISOString(),
    updatedAt: CLOCK.toISOString(),
  };
}

function workingHours() {
  return { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };
}

function suggestionsAt(now: Date, extra: CalendarEvent[] = []) {
  const event = liveBike();
  return suggestMoveWindows({
    event,
    events: [event, ...extra],
    timezone: TZ,
    workingHours: workingHours(),
    after: now,
    workouts: [bikeWorkout()],
    afterWorkoutBufferMinutes: 30,
    limit: 3,
  });
}

test("3:24 PM Bike move suggestions stay in the future and always include a date", () => {
  const suggestions = suggestionsAt(CLOCK);
  assert.ok(suggestions.length >= 1);
  for (const suggestion of suggestions) {
    assert.ok(new Date(suggestion.start).getTime() >= CLOCK.getTime(), suggestion.start);
    assert.equal(eventDurationMinutes(suggestion.start, suggestion.end), 90);
    assert.match(suggestion.label, /Today, Thu Sep 17|Tomorrow, Fri Sep 18|[A-Za-z]{3} Sep \d+/);
    assert.match(suggestion.label, /\d{1,2}:\d{2} [AP]M–\d{1,2}:\d{2} [AP]M/);
    assert.doesNotMatch(suggestion.label, /^7:00 AM/);
    assert.doesNotMatch(suggestion.label, /^9:00 AM/);
  }
  assert.equal(
    suggestions.some((item) => item.start === "2026-09-17T11:00:00.000Z" || item.start === "2026-09-17T13:00:00.000Z"),
    false,
  );
});

test("old Bike window and its buffer do not block a later replacement slot", () => {
  const event = liveBike();
  const four = new Date("2026-09-17T20:00:00.000Z");
  const valid = validateTimedMove({
    event,
    start: four,
    now: CLOCK,
    events: [event],
    workouts: [bikeWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.durationMinutes, 90);
    assert.equal(valid.end, "2026-09-17T21:30:00.000Z");
  }
  const suggestions = suggestionsAt(CLOCK);
  assert.ok(suggestions.some((item) => new Date(item.start).getTime() < Date.parse("2026-09-17T20:30:00.000Z")));
});

test("moving in-progress Bike keeps 90 minutes and the same provider event id", () => {
  const event = liveBike();
  const seed = createSeedState(CLOCK);
  seed.profile.showSampleData = false;
  seed.profile.sampleDataExplicit = true;
  seed.events = [event];
  seed.workouts = [bikeWorkout()];
  const store = createMemoryStore(seed);
  const calendar = createCalendarRepository(store);
  const proposed = new Date("2026-09-18T13:00:00.000Z");
  const valid = validateTimedMove({
    event,
    start: proposed,
    now: CLOCK,
    events: store.getState().events,
    workouts: [bikeWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  const updated = calendar.updateEvent(event.id, { start: valid.start, end: valid.end });
  assert.equal(updated.id, event.id);
  assert.equal(updated.providerEventId, PROVIDER_EVENT_ID);
  assert.equal(updated.calendarId, "copicatxyz@gmail.com");
  assert.equal(eventDurationMinutes(updated.start, updated.end), 90);
  assert.equal(store.getState().events.filter((item) => item.providerEventId === PROVIDER_EVENT_ID).length, 1);
});

test("past manual times are rejected unless explicitly allowed", () => {
  const event = liveBike();
  const morning = new Date("2026-09-17T13:00:00.000Z");
  const blocked = validateTimedMove({
    event,
    start: morning,
    now: CLOCK,
    events: [event],
    workouts: [bikeWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  assert.deepEqual(blocked, { ok: false, reason: "past" });
  const allowed = validateTimedMove({
    event,
    start: morning,
    now: CLOCK,
    events: [event],
    workouts: [bikeWorkout()],
    afterWorkoutBufferMinutes: 30,
    allowPast: true,
  });
  assert.equal(allowed.ok, true);
  if (allowed.ok) assert.equal(allowed.durationMinutes, 90);
});

test("suggestions refresh when the clock advances past an earlier slot", () => {
  const first = suggestionsAt(CLOCK);
  const second = suggestionsAt(LATER);
  assert.ok(first.every((item) => new Date(item.start).getTime() >= CLOCK.getTime()));
  assert.ok(second.every((item) => new Date(item.start).getTime() >= LATER.getTime()));
  const stale = first.filter((item) => new Date(item.start).getTime() < LATER.getTime());
  for (const slot of stale) {
    assert.equal(second.some((item) => item.start === slot.start), false);
  }
});

test("Now holds the in-progress Bike and Next does not", () => {
  const event = liveBike();
  const todays = dayEventsFor([event], CLOCK, TZ);
  const groups = groupDayEvents(todays, CLOCK);
  assert.equal(groups.now[0]?.title, "Bike");
  assert.equal(groups.upcoming.length, 0);
  assert.equal(nextActiveEvent(todays, CLOCK)?.title, "Bike");
  assert.equal(nextUpcomingEvent(todays, CLOCK), undefined);

  const laterMeeting: CalendarEvent = {
    ...event,
    id: "evt_later_meeting",
    title: "Standup",
    start: "2026-09-17T21:00:00.000Z",
    end: "2026-09-17T21:30:00.000Z",
    category: "meeting",
    providerEventId: "standup-later",
    workoutId: undefined,
  };
  const withNext = dayEventsFor([event, laterMeeting], CLOCK, TZ);
  assert.equal(nextUpcomingEvent(withNext, CLOCK)?.title, "Standup");
  assert.equal(groupDayEvents(withNext, CLOCK).upcoming[0]?.title, "Standup");
});

test("Today focus at 3:24 PM excludes the elapsed morning window", () => {
  const event = liveBike();
  const windows = findFreeTime({
    start: CLOCK,
    end: new Date("2026-09-18T04:00:00.000Z"),
    durationMinutes: 30,
    events: [event],
    timezone: TZ,
    workingHours: workingHours(),
    useWorkingHours: true,
    workouts: [bikeWorkout()],
    afterWorkoutBufferMinutes: 30,
  });
  const focus = suggestFocusWindow(windows, TZ, CLOCK);
  assert.ok(!focus || new Date(focus.start).getTime() >= CLOCK.getTime());
  assert.ok(!windows.some((window) => new Date(window.start).getTime() < CLOCK.getTime() && new Date(window.end).getTime() <= CLOCK.getTime()));
});
