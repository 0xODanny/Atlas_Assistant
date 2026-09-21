import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { dayEventsFor } from "../lib/calendar/dayAgenda";
import {
  COMPACT_WEEK_VISIBLE,
  compactMoreLabel,
  compactOverflowCount,
  dayDetailsLabel,
  formatWeekRange,
  visibleCompactEvents,
  weekDays,
} from "../lib/calendar/weekOverview";
import type { CalendarEvent } from "../lib/types/event";

const ROOT = join(process.cwd());
const TZ = "America/New_York";
const MONDAY = new Date("2026-09-21T16:00:00.000Z");

function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title" | "start" | "end">): CalendarEvent {
  return {
    description: "",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "work",
    status: "confirmed",
    createdAt: partial.start,
    updatedAt: partial.start,
    ...partial,
  };
}

const busy = [
  event({ id: "a", title: "Bike", start: "2026-09-21T11:30:00.000Z", end: "2026-09-21T12:30:00.000Z", category: "training" }),
  event({ id: "b", title: "Standup", start: "2026-09-21T15:00:00.000Z", end: "2026-09-21T15:30:00.000Z", category: "meeting" }),
  event({ id: "c", title: "Focus", start: "2026-09-21T16:00:00.000Z", end: "2026-09-21T17:30:00.000Z", category: "focus" }),
  event({
    id: "d",
    title: "A very long product planning session that must not wrap in the compact week panel",
    start: "2026-09-21T18:00:00.000Z",
    end: "2026-09-21T19:00:00.000Z",
  }),
  event({ id: "e", title: "Wrap", start: "2026-09-21T20:00:00.000Z", end: "2026-09-21T21:00:00.000Z" }),
];

test("week view does not render a full hourly grid for every day", () => {
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  assert.doesNotMatch(week, /TimeGrid/);
  assert.doesNotMatch(week, /HourRail/);
  assert.doesNotMatch(week, /visibleHourRange/);
  assert.match(week, /week-panel/);
  assert.match(week, /data-atlas-week-overview/);
});

test("seven compact day panels exist for the selected week", () => {
  const days = weekDays(MONDAY, TZ);
  assert.equal(days.length, 7);
  assert.equal(days[0]?.getUTCDay(), 0);
  assert.equal(formatWeekRange(MONDAY, TZ), "Sep 20–26");
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  const calendar = readFileSync(join(ROOT, "components/calendar/CalendarView.tsx"), "utf8");
  assert.match(week, /md:grid-cols-7/);
  assert.match(week, /days\.map/);
  assert.match(calendar, /formatWeekRange/);
  assert.match(calendar, /data-atlas-week-range/);
});

test("mobile week panels remain horizontally scrollable", () => {
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  assert.match(week, /overflow-x-auto/);
  assert.match(week, /snap-x/);
  assert.match(week, /hide-scrollbar/);
  assert.match(week, /w-\[43%\]/);
  assert.match(week, /data-atlas-week-scroller/);
  assert.match(week, /scrollTo/);
});

test("long event names use one-line truncation", () => {
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.match(week, /truncate/);
  assert.match(css, /\.week-event/);
  assert.match(css, /overflow:\s*hidden/);
});

test("busy panels keep a fixed height and show +N more", () => {
  assert.equal(COMPACT_WEEK_VISIBLE, 3);
  assert.deepEqual(
    visibleCompactEvents(busy).map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.equal(compactOverflowCount(busy), 2);
  assert.equal(compactMoreLabel(2), "+2 more");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.match(css, /\.week-panel/);
  assert.match(css, /max-height:\s*22rem/);
  assert.match(css, /max-height:\s*17\.5rem/);
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  assert.match(week, /compactMoreLabel/);
  assert.match(week, /data-atlas-week-more/);
});

test("information button opens the correct day and toggles closed", () => {
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  assert.equal(dayDetailsLabel(MONDAY, TZ), "Open Monday, September 21 details");
  assert.match(week, /aria-label=\{dayDetailsLabel/);
  assert.match(week, /aria-expanded/);
  assert.match(week, /sameZonedDay\(current, day/);
  assert.match(overlay, /role="dialog"/);
  assert.match(overlay, /aria-modal="true"/);
  assert.match(week, /covered=\{Boolean\(sheet\)\}/);
  assert.match(overlay, /is-covered/);
});

test("backdrop, close button, and Escape close the overlay; inside clicks do not", () => {
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  assert.match(overlay, /data-atlas-day-backdrop/);
  assert.match(overlay, /data-atlas-day-close/);
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(overlay, /window\.alert/);
});

test("focus returns to the originating information button", () => {
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  assert.match(overlay, /returnFocus\?\.focus\(\)/);
  assert.match(week, /returnFocus=\{infoRefs/);
});

test("expanded view contains all events for that day and scrolls internally", () => {
  const monday = dayEventsFor(busy, MONDAY, TZ);
  assert.equal(monday.length, 5);
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  const schedule = readFileSync(join(ROOT, "components/calendar/DaySchedule.tsx"), "utf8");
  assert.match(overlay, /DaySchedule events=\{events\}/);
  assert.match(overlay, /data-atlas-day-scroll/);
  assert.match(overlay, /day-overlay-scroll/);
  assert.match(overlay, /day-overlay-header/);
  assert.match(schedule, /event\.title/);
  assert.match(schedule, /data-atlas-event-source/);
});

test("event identity and source are preserved and the overlay does not mutate", () => {
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  assert.match(week, /data-atlas-week-event=\{event\.id\}/);
  assert.match(week, /data-atlas-event-source=\{event\.source\}/);
  assert.doesNotMatch(week, /applyAction|refreshGoogle|deleteEvent/);
  assert.doesNotMatch(overlay, /applyAction|refreshGoogle|deleteEvent/);
});
