import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  CALENDAR_LOCATION_KEY,
  calendarCanonicalHref,
  calendarDurableLocation,
  calendarHref,
  calendarSessionLocation,
  calendarTabHref,
  eventReturnPath,
  rememberCalendarLocation,
  resolveCalendarLocation,
  routeBackFallback,
} from "../lib/navigation/back";

const ROOT = join(process.cwd());

class MemoryStorage {
  #map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
  clear(): void {
    this.#map.clear();
  }
}

function installMemoryStorage(): { session: MemoryStorage; local: MemoryStorage } {
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  const window = { sessionStorage: session, localStorage: local };
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "window", { configurable: true, value: window });
  return { session, local };
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("A. fresh browser with no storage uses today and a canonical dated URL", () => {
  const resolved = resolveCalendarLocation({ hook: {}, browser: {}, today: "2026-09-23" });
  assert.deepEqual(resolved, { view: "day", date: "2026-09-23", source: "today" });
  assert.equal(calendarCanonicalHref("/calendar", resolved), "/calendar?view=day&date=2026-09-23");
});

test("B. future Day survives a bare /calendar pop from durable memory", () => {
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  const resolved = resolveCalendarLocation({ hook: { view: null, date: null }, browser: { view: null, date: null } });
  assert.deepEqual(resolved, { view: "day", date: "2026-09-29", source: "session" });
  assert.equal(calendarCanonicalHref("/calendar", resolved), "/calendar?view=day&date=2026-09-29");
  assert.equal(
    calendarCanonicalHref("/events/evt_bike?from=calendar&view=day&date=2026-09-29", resolved),
    null,
  );
});

test("C. future Week survives a bare /calendar pop", () => {
  rememberCalendarLocation({ view: "week", date: "2026-10-05" });
  const resolved = resolveCalendarLocation({ hook: {}, browser: {} });
  assert.deepEqual(resolved, { view: "week", date: "2026-10-05", source: "session" });
  assert.equal(calendarCanonicalHref("/calendar", resolved), "/calendar?view=week&date=2026-10-05");
});

test("D. future Month survives a bare /calendar pop", () => {
  rememberCalendarLocation({ view: "month", date: "2026-11-12" });
  const resolved = resolveCalendarLocation({ hook: {}, browser: {} });
  assert.deepEqual(resolved, { view: "month", date: "2026-11-12", source: "session" });
  assert.equal(calendarCanonicalHref("/calendar", resolved), "/calendar?view=month&date=2026-11-12");
});

test("E. sessionStorage cleared still restores from localStorage", () => {
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  sessionStorage.removeItem(CALENDAR_LOCATION_KEY);
  assert.equal(calendarSessionLocation(), null);
  assert.deepEqual(calendarDurableLocation(), { view: "day", date: "2026-09-29" });
  const resolved = resolveCalendarLocation({ hook: {}, browser: {} });
  assert.deepEqual(resolved, { view: "day", date: "2026-09-29", source: "durable" });
});

test("F. both storage layers cleared fall back to today only", () => {
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  sessionStorage.clear();
  localStorage.clear();
  const resolved = resolveCalendarLocation({ hook: {}, browser: {}, today: "2026-09-23" });
  assert.deepEqual(resolved, { view: "day", date: "2026-09-23", source: "today" });
});

test("G. malformed localStorage is ignored safely", () => {
  localStorage.setItem(CALENDAR_LOCATION_KEY, "{not-json");
  sessionStorage.setItem(CALENDAR_LOCATION_KEY, JSON.stringify({ v: 2, view: "day", date: "2026-09-29" }));
  assert.equal(calendarSessionLocation(), null);
  assert.equal(calendarDurableLocation(), null);
  const resolved = resolveCalendarLocation({ hook: {}, today: "2026-09-23" });
  assert.deepEqual(resolved, { view: "day", date: "2026-09-23", source: "today" });
  localStorage.setItem(CALENDAR_LOCATION_KEY, JSON.stringify({ v: 1, view: "day", date: "2026-09-31" }));
  assert.equal(calendarDurableLocation(), null);
  localStorage.setItem(CALENDAR_LOCATION_KEY, JSON.stringify({ view: "agenda", date: "nope" }));
  assert.equal(calendarDurableLocation(), null);
});

test("H. Calendar tab uses remembered Sep 29, not today", () => {
  assert.equal(calendarTabHref(), "/calendar");
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  assert.equal(calendarTabHref(), "/calendar?view=day&date=2026-09-29");
  const nav = readFileSync(join(ROOT, "components/shell/AppNav.tsx"), "utf8");
  assert.match(nav, /calendarTabHref/);
  assert.match(nav, /subscribeCalendarLocation/);
  assert.doesNotMatch(nav, /path: "\/calendar"[\s\S]*href: "\/calendar"/);
});

test("I. explicit Today is remembered and restored after a bare remount", () => {
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  rememberCalendarLocation({ view: "day", date: "2026-09-23" });
  const resolved = resolveCalendarLocation({ hook: {}, browser: {}, today: "2026-09-23" });
  assert.deepEqual(resolved, { view: "day", date: "2026-09-23", source: "session" });
  assert.equal(calendarCanonicalHref("/calendar", resolved), "/calendar?view=day&date=2026-09-23");
});

test("J. direct event URL with no source uses a sensible Calendar fallback", () => {
  assert.equal(eventReturnPath(null), "/calendar");
  rememberCalendarLocation({ view: "week", date: "2026-09-29" });
  assert.equal(eventReturnPath(null), "/calendar?view=week&date=2026-09-29");
  assert.equal(eventReturnPath("calendar"), "/calendar?view=week&date=2026-09-29");
});

test("K. Today → event → Back stays on Today", () => {
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  assert.equal(eventReturnPath("today"), "/today");
  assert.equal(eventReturnPath("today", { view: "day", date: "2026-09-29" }), "/today");
  assert.equal(routeBackFallback("/events/evt_bike", "today"), "/today");
});

test("URL wins over storage, then session, then durable, then today", () => {
  rememberCalendarLocation({ view: "month", date: "2026-11-01" });
  assert.deepEqual(
    resolveCalendarLocation({
      hook: { view: "day", date: "2026-09-29" },
      today: "2026-09-23",
    }),
    { view: "day", date: "2026-09-29", source: "url" },
  );
  assert.deepEqual(
    resolveCalendarLocation({
      hook: { view: null, date: null },
      browser: { view: "week", date: "2026-10-02" },
      today: "2026-09-23",
    }),
    { view: "week", date: "2026-10-02", source: "url" },
  );
  sessionStorage.removeItem(CALENDAR_LOCATION_KEY);
  assert.equal(resolveCalendarLocation({ hook: {}, today: "2026-09-23" }).source, "durable");
});

test("legacy unversioned session memory is still accepted", () => {
  sessionStorage.setItem(CALENDAR_LOCATION_KEY, JSON.stringify({ view: "day", date: "2026-09-28" }));
  assert.deepEqual(calendarSessionLocation(), { view: "day", date: "2026-09-28" });
});

test("remember writes a versioned payload to both layers and ignores bare input", () => {
  rememberCalendarLocation({ view: "day", date: null });
  rememberCalendarLocation({ view: "week" });
  assert.equal(sessionStorage.getItem(CALENDAR_LOCATION_KEY), null);
  rememberCalendarLocation({ view: "day", date: "2026-09-29" });
  assert.deepEqual(JSON.parse(sessionStorage.getItem(CALENDAR_LOCATION_KEY) ?? ""), {
    v: 1,
    view: "day",
    date: "2026-09-29",
  });
  assert.deepEqual(JSON.parse(localStorage.getItem(CALENDAR_LOCATION_KEY) ?? ""), {
    v: 1,
    view: "day",
    date: "2026-09-29",
  });
});

test("event fallback keeps dated Calendar params and does not collapse to bare /calendar", () => {
  assert.equal(
    routeBackFallback("/events/evt_1", "calendar", { view: "day", date: "2026-09-29" }),
    "/calendar?view=day&date=2026-09-29",
  );
  rememberCalendarLocation({ view: "month", date: "2026-10-01" });
  assert.equal(routeBackFallback("/events/evt_1", "calendar"), "/calendar?view=month&date=2026-10-01");
});

test("CalendarView no longer treats missing URL date as today when memory exists", () => {
  const calendar = readFileSync(join(ROOT, "components/calendar/CalendarView.tsx"), "utf8");
  const details = readFileSync(join(ROOT, "components/events/EventDetails.tsx"), "utf8");
  const nav = readFileSync(join(ROOT, "lib/navigation/back.ts"), "utf8");
  assert.match(calendar, /resolveCalendarLocation/);
  assert.match(calendar, /rememberCalendarLocation\(location\)/);
  assert.match(calendar, /stampCalendarHistory\(location\)/);
  assert.match(details, /rememberCalendarLocation\(\{ view: calendarView, date: calendarDate \}\)/);
  assert.match(nav, /localStorage/);
  assert.match(nav, /sessionStorage/);
  assert.match(nav, /source: "today"/);
  assert.doesNotMatch(nav, /__PRIVATE_NEXTJS_INTERNALS_TREE/);
});

test("dated Calendar URLs are not replaced by memory", () => {
  assert.equal(
    calendarCanonicalHref("/calendar?view=day&date=2026-09-29", { view: "week", date: "2026-10-05" }),
    null,
  );
  assert.equal(calendarHref({ view: "day", date: "2026-09-29" }), "/calendar?view=day&date=2026-09-29");
});
