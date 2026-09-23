import { pad, zonedLocalToUtc, zonedParts } from "../time";

export const ATLAS_ROOTS = ["/today", "/calendar", "/assistant", "/settings"] as const;

export type EventReturnFrom = "today" | "calendar";
export type CalendarViewMode = "day" | "week" | "month";
export type CalendarLocationSource = "url" | "session" | "durable" | "today" | "none";

export const CALENDAR_LOCATION_KEY = "atlas.calendar.location";
const CALENDAR_LOCATION_VERSION = 1;

export type CalendarLocationInput = {
  view?: string | null;
  date?: string | null;
};

export type CalendarLocation = {
  view: CalendarViewMode;
  date: string;
};

export type ResolvedCalendarLocation = {
  view: CalendarViewMode;
  date: string | null;
  source: CalendarLocationSource;
};

type StoredCalendarLocation = {
  v: typeof CALENDAR_LOCATION_VERSION;
  view: CalendarViewMode;
  date: string;
};

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const locationListeners = new Set<() => void>();

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

export function parseCalendarLocation(input?: CalendarLocationInput | null): CalendarLocation | null {
  const date = parseCalendarDate(input?.date);
  if (!date) return null;
  return { view: parseCalendarView(input?.view) ?? "week", date };
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

function browserStorage(name: "sessionStorage" | "localStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[name];
  } catch {
    return null;
  }
}

function parseStoredCalendarLocation(raw: string | null): CalendarLocation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCalendarLocation> & CalendarLocationInput;
    if (parsed && parsed.v != null && parsed.v !== CALENDAR_LOCATION_VERSION) return null;
    return parseCalendarLocation(parsed);
  } catch {
    return null;
  }
}

function readStorageLocation(name: "sessionStorage" | "localStorage"): CalendarLocation | null {
  const storage = browserStorage(name);
  if (!storage) return null;
  try {
    return parseStoredCalendarLocation(storage.getItem(CALENDAR_LOCATION_KEY));
  } catch {
    return null;
  }
}

export function calendarSessionLocation(): CalendarLocation | null {
  return readStorageLocation("sessionStorage");
}

export function calendarDurableLocation(): CalendarLocation | null {
  return readStorageLocation("localStorage");
}

export function readStoredCalendarLocation(): CalendarLocation | null {
  return calendarSessionLocation() ?? calendarDurableLocation();
}

export function calendarLocationMemory(): CalendarLocationInput | null {
  return readStoredCalendarLocation();
}

export function calendarTabHref(): string {
  const remembered = readStoredCalendarLocation();
  return remembered ? calendarHref(remembered) : "/calendar";
}

export function subscribeCalendarLocation(listener: () => void): () => void {
  locationListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    locationListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

function notifyCalendarLocation(): void {
  for (const listener of [...locationListeners]) listener();
}

export function rememberCalendarLocation(input: CalendarLocationInput): void {
  const location = parseCalendarLocation(input);
  if (!location) return;
  const payload = JSON.stringify({
    v: CALENDAR_LOCATION_VERSION,
    view: location.view,
    date: location.date,
  } satisfies StoredCalendarLocation);
  let wrote = false;
  for (const name of ["sessionStorage", "localStorage"] as const) {
    const storage = browserStorage(name);
    if (!storage) continue;
    try {
      storage.setItem(CALENDAR_LOCATION_KEY, payload);
      wrote = true;
    } catch {
      // Private mode or quota: the other layer may still succeed.
    }
  }
  if (wrote) notifyCalendarLocation();
}

/**
 * URL (hook, then window) → sessionStorage → localStorage → today (first-use only).
 * A bare /calendar URL is not treated as today when durable memory exists.
 */
export function resolveCalendarLocation(input: {
  hook?: CalendarLocationInput | null;
  browser?: CalendarLocationInput | null;
  session?: CalendarLocationInput | null;
  durable?: CalendarLocationInput | null;
  today?: string | null;
}): ResolvedCalendarLocation {
  const url = parseCalendarLocation(input.hook) ?? parseCalendarLocation(input.browser);
  if (url) return { ...url, source: "url" };

  const session =
    input.session !== undefined ? parseCalendarLocation(input.session) : calendarSessionLocation();
  if (session) return { ...session, source: "session" };

  const durable =
    input.durable !== undefined ? parseCalendarLocation(input.durable) : calendarDurableLocation();
  if (durable) return { ...durable, source: "durable" };

  const today = parseCalendarDate(input.today);
  if (today) return { view: "day", date: today, source: "today" };

  return { view: "week", date: null, source: "none" };
}

export function readCalendarLocation(
  hook: CalendarLocationInput,
  browser?: CalendarLocationInput | null,
  memory?: CalendarLocationInput | null,
): { view: CalendarViewMode; date: string | null } {
  const resolved = resolveCalendarLocation({
    hook,
    browser,
    session: memory,
    durable: memory !== undefined ? null : undefined,
    today: null,
  });
  return { view: resolved.view, date: resolved.date };
}

export function stampCalendarHistory(input: CalendarLocationInput): void {
  if (typeof window === "undefined") return;
  const location = parseCalendarLocation(input);
  if (!location) return;
  const href = calendarHref(location);
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

export function calendarRestoreHref(
  currentHref: string,
  memory?: CalendarLocationInput | null,
): string | null {
  const remembered = memory !== undefined ? parseCalendarLocation(memory) : readStoredCalendarLocation();
  return calendarCanonicalHref(currentHref, remembered);
}

export function calendarCanonicalHref(
  currentHref: string,
  location?: CalendarLocationInput | null,
): string | null {
  try {
    const url = new URL(currentHref, "https://atlas.local");
    if (url.pathname !== "/calendar") return null;
    if (parseCalendarDate(url.searchParams.get("date"))) return null;
    const remembered = parseCalendarLocation(location);
    if (!remembered) return null;
    const href = calendarHref(remembered);
    const current = `${url.pathname}${url.search}`;
    return current === href ? null : href;
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

function calendarReturnHref(calendar?: CalendarLocationInput | null): string {
  const explicit = parseCalendarLocation(calendar);
  if (explicit) return calendarHref(explicit);
  const stored = readStoredCalendarLocation();
  if (stored) return calendarHref(stored);
  const dateOnly = parseCalendarDate(calendar?.date);
  if (dateOnly) return calendarHref({ view: parseCalendarView(calendar?.view), date: dateOnly });
  return "/calendar";
}

export function eventReturnPath(from?: string | null, calendar?: CalendarLocationInput): string {
  if (from === "today" || from === "/today") return "/today";
  return calendarReturnHref(calendar);
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
    const location = parseCalendarLocation(calendar);
    if (location) {
      params.set("view", location.view);
      params.set("date", location.date);
    } else {
      const view = parseCalendarView(calendar?.view);
      const date = parseCalendarDate(calendar?.date);
      if (view) params.set("view", view);
      if (date) params.set("date", date);
    }
    return `${path}?${params.toString()}`;
  }
  return path;
}

function eventQueryFromWindow(): { from: string | null; calendar: CalendarLocationInput } {
  if (typeof window === "undefined" || !window.location?.pathname?.startsWith("/events/")) {
    return { from: null, calendar: {} };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    from: params.get("from"),
    calendar: { view: params.get("view"), date: params.get("date") },
  };
}

export function routeBackFallback(
  pathname: string,
  from?: string | null,
  calendar?: CalendarLocationInput,
): string | null {
  if (pathname === "/brief") return "/today";
  if (pathname.startsWith("/events/")) {
    const live = eventQueryFromWindow();
    return eventReturnPath(from ?? live.from, calendar ?? live.calendar);
  }
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
