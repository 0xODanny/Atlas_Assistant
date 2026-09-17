import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeedState } from "../lib/data/seed";
import {
  actionLabelForCategory,
  buildPreparation,
  linkedMeeting,
  linkedWorkout,
  preparationCopy,
} from "../lib/prepare/content";

const NOW = new Date("2026-09-17T16:00:00.000Z");

test("meeting preparation uses linked Meeting agenda, not generic event copy", () => {
  const state = createSeedState(NOW);
  const event = state.events.find((item) => item.id === "evt_pepinho");
  assert.ok(event);
  const meeting = linkedMeeting(event, state.meetings);
  assert.ok(meeting);
  assert.equal(meeting.eventId, event.id);
  assert.equal(event.meetingId, meeting.id);
  assert.ok(meeting.agenda.includes("Review launch status"));

  const prep = buildPreparation({ event, meeting });
  assert.equal(prep.actionLabel, "Prepare Me");
  assert.equal(prep.schedulePrep, true);
  assert.equal(prep.prepMinutes, 15);
  assert.match(prep.headline, /15 minutes/);
  assert.ok(prep.sections.some((section) => section.items.includes("Review payment blockers")));
  assert.ok(prep.sections.some((section) => section.items.includes("Marcus")));
});

test("training preparation uses linked Workout data and never says meeting", () => {
  const state = createSeedState(NOW);
  const bike = state.events.find((item) => item.id === "evt_bike");
  const swim = state.events.find((item) => item.id === "evt_swim");
  assert.ok(bike && swim);

  const bikeWorkout = linkedWorkout(bike, state.workouts);
  const swimWorkout = linkedWorkout(swim, state.workouts);
  assert.ok(bikeWorkout);
  assert.ok(swimWorkout);
  assert.equal(bike.workoutId, bikeWorkout.id);
  assert.equal(bikeWorkout.eventId, bike.id);
  assert.equal(bikeWorkout.intensity, "zone2");
  assert.equal(bikeWorkout.description, "Outdoor endurance ride");
  assert.equal(swimWorkout.description, "Endurance + technique");

  const bikePrep = buildPreparation({ event: bike, workout: bikeWorkout });
  const swimPrep = buildPreparation({ event: swim, workout: swimWorkout });

  assert.equal(actionLabelForCategory("training"), "View Workout");
  assert.equal(bikePrep.schedulePrep, false);
  assert.equal(swimPrep.schedulePrep, false);
  assert.ok(bikePrep.sections.some((section) => section.items.includes("Outdoor endurance ride")));
  assert.ok(bikePrep.sections.some((section) => section.items.some((item) => item.includes("Zone 2"))));
  assert.ok(bikePrep.sections.some((section) => section.heading === "If weather changes"));
  assert.ok(bikePrep.sections.some((section) => section.heading === "Before you start"));
  assert.ok(swimPrep.sections.some((section) => section.items.includes("200s")));
  assert.ok(swimPrep.sections.some((section) => section.items.includes("Technique drills")));
  assert.ok(swimPrep.sections.some((section) => section.heading === "Focus"));

  const bikeCopy = preparationCopy(bikePrep).toLowerCase();
  const swimCopy = preparationCopy(swimPrep).toLowerCase();
  assert.equal(bikeCopy.includes("meeting"), false);
  assert.equal(swimCopy.includes("meeting"), false);
});
