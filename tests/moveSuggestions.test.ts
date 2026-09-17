import assert from "node:assert/strict";
import { test } from "node:test";
import { eventsConflict, suggestMoveWindows } from "../lib/calendar/moveSuggestions";
import { createSeedState } from "../lib/data/seed";
import { atZonedTime } from "../lib/time";
import type { CalendarEvent } from "../lib/types/event";

const NOW = new Date("2026-09-17T16:00:00.000Z");
const TZ = "America/New_York";

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "start" | "end">): CalendarEvent {
  return {
    title: "Block",
    description: "",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category: "focus",
    status: "confirmed",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...partial,
  };
}

test("move suggestions contain no duplicates and at most three windows", () => {
  const state = createSeedState(NOW);
  const bike = state.events.find((item) => item.id === "evt_bike");
  assert.ok(bike);
  const suggestions = suggestMoveWindows({
    event: bike,
    events: state.events,
    timezone: TZ,
    workingHours: state.profile.workingHours,
    after: NOW,
  });
  const starts = suggestions.map((item) => item.start);
  assert.equal(new Set(starts).size, starts.length);
  assert.ok(suggestions.length <= 3);
  assert.ok(suggestions.length >= 2);
  const labels = suggestions.map((item) => `${item.dateLabel ?? "same"}:${item.start}`);
  assert.equal(new Set(labels).size, labels.length);
});

test("moving an event ignores itself for free-time calculation", () => {
  const moving = event({
    id: "evt_move",
    title: "Deep work",
    start: atZonedTime(TZ, NOW, 9, 30).toISOString(),
    end: atZonedTime(TZ, NOW, 10, 30).toISOString(),
  });
  const later = event({
    id: "evt_later",
    start: atZonedTime(TZ, NOW, 11, 0).toISOString(),
    end: atZonedTime(TZ, NOW, 18, 0).toISOString(),
  });
  const workingHours = { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };
  const suggestions = suggestMoveWindows({
    event: moving,
    events: [moving, later],
    timezone: TZ,
    workingHours,
    after: atZonedTime(TZ, NOW, 7, 0),
  });
  const nine = atZonedTime(TZ, NOW, 9, 0).toISOString();
  assert.ok(suggestions.some((item) => item.start === nine));
  assert.equal(
    eventsConflict(nine, atZonedTime(TZ, NOW, 10, 0).toISOString(), [later]),
    false,
  );
});

test("move suggestions do not conflict with other events", () => {
  const state = createSeedState(NOW);
  const bike = state.events.find((item) => item.id === "evt_bike");
  assert.ok(bike);
  const others = state.events.filter((item) => item.id !== bike.id);
  const suggestions = suggestMoveWindows({
    event: bike,
    events: state.events,
    timezone: TZ,
    workingHours: state.profile.workingHours,
    after: NOW,
  });
  for (const suggestion of suggestions) {
    assert.equal(eventsConflict(suggestion.start, suggestion.end, others), false);
    assert.match(suggestion.dateLabel, /Today,|Tomorrow,/);
    assert.match(suggestion.dateLabel, /Sep \d+/);
  }
});
