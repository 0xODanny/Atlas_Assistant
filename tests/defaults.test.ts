import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultEventTimes, roundUpToNextHalfHour } from "../lib/events/defaults";

const TZ = "America/New_York";

test("new event start rounds up to the next half hour and lasts 60 minutes", () => {
  const now = new Date("2026-09-17T04:32:00.000Z");
  const times = defaultEventTimes(now, TZ);
  assert.equal(times.start.toISOString(), "2026-09-17T05:00:00.000Z");
  assert.equal(times.end.toISOString(), "2026-09-17T06:00:00.000Z");
});

test("times already on a half-hour boundary stay put", () => {
  const noon = new Date("2026-09-17T16:00:00.000Z");
  const rounded = roundUpToNextHalfHour(noon, TZ);
  assert.equal(rounded.toISOString(), "2026-09-17T16:00:00.000Z");
});

test("selected calendar slot is used as-is", () => {
  const now = new Date("2026-09-17T04:32:00.000Z");
  const selected = new Date("2026-09-17T15:00:00.000Z");
  const times = defaultEventTimes(now, TZ, selected);
  assert.equal(times.start.toISOString(), selected.toISOString());
  assert.equal(times.end.toISOString(), "2026-09-17T16:00:00.000Z");
});
