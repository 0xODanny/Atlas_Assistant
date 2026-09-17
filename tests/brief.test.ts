import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBrief } from "../lib/brief/generateBrief";
import { createSeedState } from "../lib/data/seed";

const NOW = new Date("2026-09-17T16:00:00.000Z");

test("morning brief is generated from seed calendar data", () => {
  const state = createSeedState(NOW);
  const brief = generateBrief({
    now: NOW,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  });

  assert.equal(brief.eventCount, 3);
  assert.ok(brief.items.some((item) => item.title === "Bike" && item.detail === "Outdoor endurance ride"));
  assert.ok(brief.items.some((item) => item.title === "Pepinho Meeting" && item.preparationMinutes === 15));
  assert.ok(brief.items.some((item) => item.title === "Swim"));
  assert.ok(brief.bestFocus);
  assert.equal(brief.bestFocus?.minutes, 180);
  assert.match(brief.summary, /3 events today/);
  assert.ok(brief.timeline.some((item) => item.heading === "BIKE"));
  assert.ok(brief.openMinutes > 0);
});
