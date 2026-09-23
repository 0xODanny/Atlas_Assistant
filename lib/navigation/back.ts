import { pad, zonedLocalToUtc, zonedParts } from "../time";

export const ATLAS_ROOTS = ["/today", "/calendar", "/assistant", "/settings"] as const;

export type EventReturnFrom = "today" | "calendar";
export type CalendarViewMode = "day" | "week" | "month";

const CALENDAR_MEMORY_KEY = "atlas.calendar.location";

export type CalendarLocationInput = {
  view?: string | null;
  date?: string | null;
};

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function eventFromPath(pathname: string): EventReturnFrom | null {
  if (pathname === "/today" || pathname.startsWith("/today/")) return "today";
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) return "calendar";
  return null;
}

export function parseCalendarView(value?: string | null): CalendarViewMode | null {
  return value === "day" || value === "week" || value === "month" ? value : null;
}

export function parseCalendarDate(value?: string | null): string | null {
  if (!value) return null;
  const match = CALENDAR_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  if (year < 1970 || year > 2100) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function formatCalendarDateParam(date: Date, timezone: string): string {
  const parts = zonedParts(timezone, date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function calendarCursorFromDateParam(date: string, timezone: string): Date | null {
  const key = parseCalendarDate(date);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  return zonedLocalToUtc(timezone, year, month, day, 12, 0);
}

export function calendarHref(input: CalendarLocationInput = {}): string {
  const view = parseCalendarView(input.view);
  const date = parseCalendarDate(input.date);
  if (!view && !date) return "/calendar";
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (date) params.set("date", date);
  const query = params.toString();
  return query ? `/calendar?${query}` : "/calendar";
}

export function readCalendarLocation(
  hook: CalendarLocationInput,
  browser?: CalendarLocationInput | null,
  memory?: CalendarLocationInput | null,
): { view: CalendarViewMode; date: string | null } {
  const hookDate = parseCalendarDate(hook.date);
  const hookView = parseCalendarView(hook.view);
  if (hookDate) return { view: hookView ?? "week", date: hookDate };
  const browserDate = parseCalendarDate(browser?.date);
  const browserView = parseCalendarView(browser?.view);
  if (browserDate) return { view: browserView ?? hookView ?? "week", date: browserDate };
  const memoryDate = parseCalendarDate(memory?.date);
  const memoryView = parseCalendarView(memory?.view);
  if (memoryDate) return { view: memoryView ?? hookView ?? browserView ?? "week", date: memoryDate };
  return { view: hookView ?? browserView ?? memoryView ?? "week", date: null };
}

export function calendarLocationMemory(): CalendarLocationInput | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CALENDAR_MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalendarLocationInput;
    const date = parseCalendarDate(parsed.date);
    if (!date) return null;
    return { view: parseCalendarView(parsed.view), date };
  } catch {
    return null;
  }
}

export function rememberCalendarLocation(input: CalendarLocationInput): void {
  const date = parseCalendarDate(input.date);
  if (!date || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(
    CALENDAR_MEMORY_KEY,
    JSON.stringify({ view: parseCalendarView(input.view) ?? "week", date }),
  );
}

export function stampCalendarHistory(input: CalendarLocationInput): void {
  if (typeof window === "undefined") return;
  const date = parseCalendarDate(input.date);
  const view = parseCalendarView(input.view) ?? "week";
  if (!date) return;
  const href = calendarHref({ view, date });
  const current = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/calendar" && current !== href) {
    window.history.replaceState(window.history.state, "", href);
  }
}

export function calendarAutoReplaceHref(currentHref: string): string | null {
  try {
    const url = new URL(currentHref, "https://atlas.local");
    if (url.pathname !== "/calendar") return null;
    if (parseCalendarDate(url.searchParams.get("date"))) return null;
    return null;
  } catch {
    return null;
  }
}

export function calendarRestoreHref(currentHref: string, memory?: CalendarLocationInput | null): string | null {
  try {
    const url = new URL(currentHref, "https://atlas.local");
    if (url.pathname !== "/calendar") return null;
    if (parseCalendarDate(url.searchParams.get("date"))) return null;
    const date = parseCalendarDate(memory?.date);
    if (!date) return null;
    return calendarHref({
      view: parseCalendarView(memory?.view) ?? parseCalendarView(url.searchParams.get("view")) ?? "week",
      date,
    });
  } catch {
    return null;
  }
}

export function isEventPrepareParam(value?: string | null): boolean {
  return value === "1";
}

export function eventPrepareHref(
  eventId: string,
  from?: string | null,
  calendar?: CalendarLocationInput,
): string {
  const href = eventDetailHref(eventId, from, calendar);
  const params = new URLSearchParams(href.split("?")[1] ?? "");
  params.set("prepare", "1");
  return `${href.split("?")[0]}?${params.toString()}`;
}

export function eventReturnPath(from?: string | null, calendar?: CalendarLocationInput): string {
  if (from === "today" || from === "/today") return "/today";
  if (from === "calendar" || from === "/calendar") return calendarHref(calendar);
  return "/calendar";
}

export function eventDetailHref(
  eventId: string,
  from?: string | null,
  calendar?: CalendarLocationInput,
): string {
  const path = `/events/${encodeURIComponent(eventId)}`;
  const params = new URLSearchParams();
  if (from === "today" || from === "/today") {
    params.set("from", "today");
    return `${path}?${params.toString()}`;
  }
  if (from === "calendar" || from === "/calendar" || eventFromPath(from ?? "") === "calendar") {
    params.set("from", "calendar");
    const view = parseCalendarView(calendar?.view);
    const date = parseCalendarDate(calendar?.date);
    if (view) params.set("view", view);
    if (date) params.set("date", date);
    return `${path}?${params.toString()}`;
  }
  return path;
}

export function routeBackFallback(
  pathname: string,
  from?: string | null,
  calendar?: CalendarLocationInput,
): string | null {
  if (pathname === "/brief") return "/today";
  if (pathname.startsWith("/events/")) return eventReturnPath(from, calendar);
  if (pathname.startsWith("/settings/") && pathname !== "/settings") return "/settings";
  return null;
}

export function hasAtlasHistory(): boolean {
  if (typeof window === "undefined") return false;
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === "number" && idx > 0) return true;
  const referrer = document.referrer;
  return Boolean(referrer && referrer.startsWith(window.location.origin) && window.history.length > 1);
}

export function atlasBack(
  router: { back: () => void; push: (href: string) => void },
  fallback: string,
): void {
  if (hasAtlasHistory()) {
    router.back();
    return;
  }
  router.push(fallback);
}
