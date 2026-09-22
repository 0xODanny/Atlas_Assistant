import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  atlasBack,
  calendarCursorFromDateParam,
  calendarHref,
  eventDetailHref,
  eventFromPath,
  eventReturnPath,
  formatCalendarDateParam,
  hasAtlasHistory,
  parseCalendarDate,
  parseCalendarView,
  routeBackFallback,
} from "../lib/navigation/back";

const ROOT = join(process.cwd());

test("child routes fall back to their parent roots", () => {
  assert.equal(routeBackFallback("/today"), null);
  assert.equal(routeBackFallback("/calendar"), null);
  assert.equal(routeBackFallback("/assistant"), null);
  assert.equal(routeBackFallback("/settings"), null);
  assert.equal(routeBackFallback("/brief"), "/today");
  assert.equal(routeBackFallback("/events/abc"), "/calendar");
  assert.equal(routeBackFallback("/events/abc", "today"), "/today");
  assert.equal(routeBackFallback("/events/abc", "calendar"), "/calendar");
  assert.equal(
    routeBackFallback("/events/abc", "calendar", { view: "day", date: "2026-09-22" }),
    "/calendar?view=day&date=2026-09-22",
  );
  assert.equal(routeBackFallback("/settings/google"), "/settings");
});

test("event detail preserves Today or Calendar context and never returns to Settings", () => {
  assert.equal(eventFromPath("/today"), "today");
  assert.equal(eventFromPath("/calendar"), "calendar");
  assert.equal(eventFromPath("/settings"), null);
  assert.equal(eventDetailHref("evt_1", "today"), "/events/evt_1?from=today");
  assert.equal(eventDetailHref("evt_1", "calendar"), "/events/evt_1?from=calendar");
  assert.equal(
    eventDetailHref("evt_1", "calendar", { view: "day", date: "2026-09-22" }),
    "/events/evt_1?from=calendar&view=day&date=2026-09-22",
  );
  assert.equal(
    eventDetailHref("evt_1", "calendar", { view: "week", date: "2026-09-28" }),
    "/events/evt_1?from=calendar&view=week&date=2026-09-28",
  );
  assert.equal(eventDetailHref("evt_1"), "/events/evt_1");
  assert.equal(eventReturnPath("today"), "/today");
  assert.equal(eventReturnPath("today", { view: "week", date: "2026-09-28" }), "/today");
  assert.equal(eventReturnPath("calendar"), "/calendar");
  assert.equal(
    eventReturnPath("calendar", { view: "day", date: "2026-09-22" }),
    "/calendar?view=day&date=2026-09-22",
  );
  assert.equal(
    eventReturnPath("calendar", { view: "week", date: "2026-09-28" }),
    "/calendar?view=week&date=2026-09-28",
  );
  assert.equal(eventReturnPath(null), "/calendar");
  assert.equal(eventReturnPath("/settings"), "/calendar");
  assert.equal(eventReturnPath("settings"), "/calendar");
  const details = readFileSync(join(ROOT, "components/events/EventDetails.tsx"), "utf8");
  const nav = readFileSync(join(ROOT, "components/shell/AppNav.tsx"), "utf8");
  const calendar = readFileSync(join(ROOT, "components/calendar/CalendarView.tsx"), "utf8");
  assert.match(details, /eventReturnPath/);
  assert.match(details, /useShellBack/);
  assert.match(details, /atlasBack\(router, returnTo\)/);
  assert.doesNotMatch(details, /router\.push\("\/settings"\)/);
  assert.match(nav, /replace/);
  assert.match(calendar, /eventDetailHref\(id, "calendar"/);
  assert.match(calendar, /router\.replace\(calendarHref/);
});

test("calendar return state only accepts validated view and date values", () => {
  assert.equal(parseCalendarView("day"), "day");
  assert.equal(parseCalendarView("week"), "week");
  assert.equal(parseCalendarView("agenda"), null);
  assert.equal(parseCalendarView("../week"), null);
  assert.equal(parseCalendarDate("2026-09-22"), "2026-09-22");
  assert.equal(parseCalendarDate("2026-09-31"), null);
  assert.equal(parseCalendarDate("09/22/2026"), null);
  assert.equal(parseCalendarDate("https://evil.example"), null);
  assert.equal(parseCalendarDate("../../etc/passwd"), null);
  assert.equal(calendarHref({ view: "list", date: "nope" }), "/calendar");
  assert.equal(calendarHref({ view: "week", date: "2026-13-01" }), "/calendar?view=week");
  assert.equal(eventReturnPath("calendar", { view: "agenda", date: "2026-09-22" }), "/calendar?date=2026-09-22");
  assert.equal(eventDetailHref("evt_1", "https://evil.example/calendar"), "/events/evt_1");
  assert.equal(eventDetailHref("evt_1", "today", { view: "week", date: "2026-09-28" }), "/events/evt_1?from=today");
  const cursor = calendarCursorFromDateParam("2026-09-22", "America/New_York");
  assert.ok(cursor);
  assert.equal(formatCalendarDateParam(cursor, "America/New_York"), "2026-09-22");
  assert.equal(calendarCursorFromDateParam("2026-02-30", "America/New_York"), null);
});

test("event detail actions are stacked button controls", () => {
  const details = readFileSync(join(ROOT, "components/events/EventDetails.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.match(details, /event-actions/);
  assert.match(details, /event-action is-primary/);
  assert.match(details, /event-action is-secondary/);
  assert.match(details, /event-action is-danger/);
  assert.doesNotMatch(details, /btn-quiet/);
  assert.match(css, /\.event-actions[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.event-action[\s\S]*min-height:\s*var\(--atlas-touch\)/);
  assert.match(css, /\.event-detail-copy[\s\S]*overflow-wrap:\s*anywhere/);
});

test("atlasBack uses history when available and otherwise pushes the fallback", () => {
  const calls: string[] = [];
  const router = {
    back: () => calls.push("back"),
    push: (href: string) => calls.push(`push:${href}`),
  };
  assert.equal(hasAtlasHistory(), false);
  atlasBack(router, "/assistant");
  assert.deepEqual(calls, ["push:/assistant"]);
});

test("shell, assistant result, sheets, and overlays expose Back", () => {
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  const chat = readFileSync(join(ROOT, "components/assistant/AssistantChat.tsx"), "utf8");
  const sheet = readFileSync(join(ROOT, "components/sheets/Sheet.tsx"), "utf8");
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  const nav = readFileSync(join(ROOT, "lib/navigation/back.ts"), "utf8");
  assert.match(shell, /BackControl/);
  assert.match(shell, /useShellChrome/);
  assert.match(chat, /useShellBack/);
  assert.match(chat, /clearToLanding/);
  assert.match(sheet, /data-atlas-back|BackControl/);
  assert.match(overlay, /BackControl/);
  assert.match(nav, /routeBackFallback/);
});

test("bottom navigation is an opaque fixed chrome surface", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  assert.match(css, /\.atlas-nav-chrome/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /--atlas-nav-stack/);
  assert.match(css, /--atlas-composer-height/);
  assert.match(shell, /atlas-nav-chrome/);
  assert.match(shell, /sheet \? null/);
});
