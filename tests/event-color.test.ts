import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVENT_KIND_FILL,
  eventFill,
  eventKindFill,
  resolveEventKind,
} from "../lib/present/eventColor";

test("keyword examples resolve to the expected semantic kinds", () => {
  assert.equal(resolveEventKind({ title: "Call with Marcus" }), "call");
  assert.equal(resolveEventKind({ title: "Phone call with Isaac" }), "call");
  assert.equal(resolveEventKind({ title: "Team meeting" }), "meeting");
  assert.equal(resolveEventKind({ title: "Doctor appointment" }), "meeting");
  assert.equal(resolveEventKind({ title: "swim" }), "workout");
  assert.equal(resolveEventKind({ title: "Bike workout" }), "workout");
  assert.equal(resolveEventKind({ title: "Easy run" }), "workout");
  assert.equal(resolveEventKind({ title: "90 minute focus block" }), "focus");
  assert.equal(resolveEventKind({ title: "Grocery run" }), "personal");
  assert.equal(resolveEventKind({ title: "Flight to São Paulo" }), "travel");
  assert.equal(resolveEventKind({ title: "Recovery" }), "relax");
});

test("explicit metadata wins over conflicting title keywords", () => {
  assert.equal(resolveEventKind({ title: "Grocery run", category: "training" }), "workout");
  assert.equal(resolveEventKind({ title: "Office time", sport: "swim" }), "workout");
  assert.equal(resolveEventKind({ title: "Call with Marcus", category: "travel" }), "travel");
  assert.equal(resolveEventKind({ title: "Focus block", category: "meeting" }), "meeting");
  assert.equal(resolveEventKind({ title: "Call with Marcus", category: "meeting" }), "call");
});

test("category maps to the same fill used on every surface", () => {
  assert.equal(eventFill({ title: "Call with Marcus", category: "meeting" }), EVENT_KIND_FILL.call);
  assert.equal(eventFill({ title: "Swim", category: "training" }), EVENT_KIND_FILL.workout);
  assert.equal(eventFill({ title: "Team meeting", category: "meeting" }), EVENT_KIND_FILL.meeting);
  assert.equal(eventFill({ title: "Focus time", category: "focus" }), EVENT_KIND_FILL.focus);
});

test("user category overrides replace only the chosen kind", () => {
  const overrides = { workout: "var(--atlas-focus)" };
  assert.equal(eventKindFill("workout", overrides), "var(--atlas-focus)");
  assert.equal(eventFill({ title: "Swim", category: "training" }, overrides), "var(--atlas-focus)");
  assert.equal(eventFill({ title: "Call with Marcus", category: "meeting" }, overrides), EVENT_KIND_FILL.call);
});
