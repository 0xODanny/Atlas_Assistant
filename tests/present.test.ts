import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBrief } from "../lib/brief/generateBrief";
import { createSeedState } from "../lib/data/seed";
import { presentEventRow } from "../lib/present/event";
import { presentNextStatus } from "../lib/present/status";
import { trainingGoalCopy } from "../lib/present/training";
import { linkedMeeting, linkedWorkout } from "../lib/prepare/content";

const NOW = new Date("2026-09-17T16:00:00.000Z");
const TZ = "America/New_York";

test("workout row derives Zone 2 and description from linked Workout", () => {
  const state = createSeedState(NOW);
  const bike = state.events.find((item) => item.id === "evt_bike");
  assert.ok(bike);
  const workout = linkedWorkout(bike, state.workouts);
  assert.ok(workout);
  const row = presentEventRow({ event: bike, timezone: TZ, workout });
  assert.equal(row.title, "Bike");
  assert.equal(row.meta, "60 min · Zone 2");
  assert.equal(row.detail, "Outdoor endurance ride");
  assert.equal(row.meta.toLowerCase().includes("bike"), false);
});

test("meeting row derives Marcus and preparation from linked Meeting", () => {
  const state = createSeedState(NOW);
  const meetingEvent = state.events.find((item) => item.id === "evt_pepinho");
  assert.ok(meetingEvent);
  const meeting = linkedMeeting(meetingEvent, state.meetings);
  assert.ok(meeting);
  const row = presentEventRow({
    event: meetingEvent,
    timezone: TZ,
    meeting,
    selfName: state.profile.displayName,
  });
  assert.equal(row.title, "Pepinho Meeting");
  assert.equal(row.meta, "45 min · With Marcus");
  assert.equal(row.detail, "Preparation recommended · 15 min");
});

test("brief derives workout, meeting, and task information from domain objects", () => {
  const morning = new Date("2026-09-17T12:00:00.000Z");
  const state = createSeedState(morning);
  const brief = generateBrief({
    now: morning,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  });
  const bike = brief.timeline.find((item) => item.eventId === "evt_bike");
  const meeting = brief.timeline.find((item) => item.eventId === "evt_pepinho");
  const swim = brief.timeline.find((item) => item.eventId === "evt_swim");
  const focus = brief.timeline.find((item) => item.kind === "focus");
  assert.ok(bike);
  assert.match(bike.meta ?? "", /Zone 2/);
  assert.ok(bike.lines.includes("Outdoor endurance ride"));
  assert.ok(bike.lines.some((line) => /weather changes/i.test(line)));
  assert.ok(meeting);
  assert.match(meeting.meta ?? "", /Marcus/);
  assert.ok(meeting.lines.some((line) => /15 minutes of preparation/.test(line)));
  assert.equal(meeting.action, "prepare");
  assert.ok(swim);
  assert.match(swim.meta ?? "", /Moderate/);
  assert.ok(swim.lines.includes("Endurance + technique"));
  assert.ok(focus);
  assert.match(focus.heading, /FOCUS/);
  assert.ok(brief.important.some((task) => task.title.includes("Pepinho agenda")));
  assert.ok(brief.important.some((task) => task.title.includes("weekend long ride")));
});

test("next status does not repeat duration", () => {
  const morning = new Date("2026-09-17T05:10:00.000Z");
  const state = createSeedState(morning);
  const bike = state.events.find((item) => item.id === "evt_bike");
  assert.ok(bike);
  const status = presentNextStatus({
    event: bike,
    now: morning,
    timezone: TZ,
    workout: linkedWorkout(bike, state.workouts),
  });
  assert.equal(status.title, "Bike");
  assert.match(status.lead, /7:30 AM/);
  assert.match(status.lead, /starts in/i);
  assert.equal(status.summary, "60 min · Zone 2 · Outdoor endurance ride");
  assert.equal((status.lead.match(/60 min/g) ?? []).length, 0);
});

test("training goal copy is natural language from UserProfile", () => {
  const state = createSeedState(NOW);
  assert.equal(trainingGoalCopy(state.profile), "Triathlon training is a planning priority.");
});
