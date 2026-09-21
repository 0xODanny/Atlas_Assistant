import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDuration,
  formatDurationAdjective,
  formatDurationMinutes,
  formatEventTiming,
  formatFreeSpan,
  formatHoursMinutes,
  formatMinutesShort,
  formatRange,
  formatRangeCompact,
  formatRelativeDay,
  formatRelativeDayDate,
  formatScheduledEventWhen,
  formatSuggestionSlot,
  formatTimezoneLabel,
  indefiniteDurationAdjective,
} from "../lib/format";
import { formatWeekRange } from "../lib/calendar/weekOverview";

const TZ = "America/New_York";

test("compact rows use min, details use minutes, ranges use an en dash", () => {
  assert.equal(formatMinutesShort(60), "60 min");
  assert.equal(formatMinutesShort(45), "45 min");
  assert.equal(formatHoursMinutes(30), "30 min");
  assert.equal(formatHoursMinutes(60), "1 hr");
  assert.equal(formatHoursMinutes(150), "2 hr 30 min");
  assert.equal(formatHoursMinutes(255), "4 hr 15 min");
  assert.equal(formatHoursMinutes(345), "5 hr 45 min");
  assert.equal(formatFreeSpan(150), "2 hr 30 min free");
  assert.equal(formatDurationMinutes(60), "60 minutes");
  assert.equal(formatDuration(60), "1 hour");
  assert.equal(formatDuration(45), "45 minutes");
  assert.equal(
    formatRange("2026-09-17T11:30:00.000Z", "2026-09-17T12:30:00.000Z", TZ),
    "7:30 AM–8:30 AM",
  );
  assert.equal(
    formatRangeCompact("2026-09-21T17:45:00.000Z", "2026-09-21T19:15:00.000Z", TZ),
    "1:45–3:15 PM",
  );
});

test("duration adjectives are hyphenated and singular", () => {
  assert.equal(formatDurationAdjective(180), "3-hour");
  assert.equal(formatDurationAdjective(60), "1-hour");
  assert.equal(formatDurationAdjective(120), "2-hour");
  assert.equal(formatDurationAdjective(30), "30-minute");
  assert.equal(formatDurationAdjective(45), "45-minute");
  assert.equal(indefiniteDurationAdjective(180), "a 3-hour");
  assert.equal(indefiniteDurationAdjective(45), "a 45-minute");
});

test("suggestion and event labels include relative day, date, and in-progress", () => {
  const now = new Date("2026-09-17T19:24:00.000Z");
  assert.equal(formatRelativeDayDate("2026-09-17T18:30:00.000Z", TZ, now), "Today, Thu Sep 17");
  assert.equal(formatRelativeDayDate("2026-09-18T13:00:00.000Z", TZ, now), "Tomorrow, Fri Sep 18");
  assert.equal(
    formatSuggestionSlot("2026-09-18T13:00:00.000Z", "2026-09-18T14:30:00.000Z", TZ, now),
    "Tomorrow, Fri Sep 18 · 9:00 AM–10:30 AM",
  );
  assert.equal(
    formatScheduledEventWhen(
      { allDay: false, start: "2026-09-17T18:30:00.000Z", end: "2026-09-17T20:00:00.000Z" },
      TZ,
      now,
    ),
    "Today, Thu Sep 17 · 2:30 PM–4:00 PM · In progress",
  );
  assert.match(formatTimezoneLabel(TZ, now), /America\/New_York/);
  assert.equal(formatRelativeDay("2026-09-17T18:30:00.000Z", TZ, now), "Today");
  assert.equal(formatRelativeDay("2026-09-18T13:00:00.000Z", TZ, now), "Tomorrow");
  assert.equal(formatWeekRange(new Date("2026-09-21T16:00:00.000Z"), TZ), "Sep 20–26");
  assert.equal(formatWeekRange(new Date("2026-10-01T16:00:00.000Z"), TZ), "Sep 27–Oct 3");
  assert.equal(formatWeekRange(new Date("2027-01-01T16:00:00.000Z"), TZ), "Dec 27, 2026–Jan 2, 2027");
});

test("event timing switches from countdown to remaining, then clears", () => {
  const start = "2026-09-17T16:00:00.000Z";
  const end = "2026-09-17T17:00:00.000Z";
  assert.equal(formatEventTiming(new Date("2026-09-17T15:00:00.000Z"), start, end, TZ), "Starts in 1 hour");
  assert.match(formatEventTiming(new Date("2026-09-17T16:18:00.000Z"), start, end, TZ) ?? "", /In progress · 42 min remaining/);
  assert.equal(formatEventTiming(new Date("2026-09-17T17:00:00.000Z"), start, end, TZ), null);
});
