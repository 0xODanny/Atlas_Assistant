import assert from "node:assert/strict";
import { test } from "node:test";
import { isBusyBlock, projectEventForViewer } from "../lib/calendar/privacy";
import { createSeedState } from "../lib/data/seed";

const NOW = new Date("2026-09-17T16:00:00.000Z");

test("owner sees the full private or shared event", () => {
  const state = createSeedState(NOW);
  const meeting = state.events.find((event) => event.id === "evt_pepinho");
  const bike = state.events.find((event) => event.id === "evt_bike");
  assert.ok(meeting && bike);
  assert.equal(projectEventForViewer(meeting, { isOwner: true }), meeting);
  assert.equal(projectEventForViewer(bike, { isOwner: true }), bike);
});

test("collaborators see busy-only blocks and shared titles, never private events", () => {
  const state = createSeedState(NOW);
  const meeting = state.events.find((event) => event.id === "evt_pepinho");
  const bike = { ...state.events[0], privacy: "busy-only" as const };
  const privateEvent = { ...state.events[0], privacy: "private" as const, title: "Doctor appointment" };
  assert.ok(meeting);

  const shared = projectEventForViewer(meeting, { isOwner: false });
  const busy = projectEventForViewer(bike, { isOwner: false });
  const hidden = projectEventForViewer(privateEvent, { isOwner: false });

  assert.ok(shared && !isBusyBlock(shared));
  assert.equal("title" in shared ? shared.title : "", "Pepinho Meeting");
  assert.ok(busy && isBusyBlock(busy));
  assert.equal(hidden, null);
});
