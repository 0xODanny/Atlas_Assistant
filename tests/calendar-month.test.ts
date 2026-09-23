import assert from "node:assert/strict";
import { test } from "node:test";
import { monthGridDays, sameZonedMonth, startOfCalendarMonth } from "../lib/calendar/monthOverview";
import { formatCalendarDateParam } from "../lib/navigation/back";
import { addMonths, zonedParts } from "../lib/time";

const TZ = "America/New_York";

test("month grid starts on Sunday and covers the selected month", () => {
  const cursor = startOfCalendarMonth(new Date("2026-09-22T16:00:00.000Z"), TZ);
  const days = monthGridDays(cursor, TZ);
  assert.equal(days.length, 42);
  assert.equal(zonedParts(TZ, days[0]!).weekday, 0);
  assert.ok(days.some((day) => sameZonedMonth(day, cursor, TZ) && zonedParts(TZ, day).day === 22));
  assert.ok(days.some((day) => zonedParts(TZ, day).day === 1 && sameZonedMonth(day, cursor, TZ)));
});

test("month arrows move by one calendar month", () => {
  const september = startOfCalendarMonth(new Date("2026-09-22T16:00:00.000Z"), TZ);
  const october = addMonths(september, 1, TZ);
  const august = addMonths(september, -1, TZ);
  assert.equal(zonedParts(TZ, october).month, 10);
  assert.equal(zonedParts(TZ, august).month, 8);
  assert.equal(formatCalendarDateParam(october, TZ).startsWith("2026-10"), true);
});
