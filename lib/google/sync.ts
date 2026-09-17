import { addDays, startOfZonedDay } from "../time";
import type { CalendarEvent } from "../types/event";
import type { ConnectedCalendar, ConnectionState } from "../types/profile";
import { hasWriteScope } from "./config";
import type { CalendarCredential, CalendarCredentialStore } from "./credentials";
import { ensureFreshGoogleCredential } from "./oauth";
import { GoogleCalendarProvider, googleUserEmail } from "./provider";
export { GOOGLE_SYNC_STALE_MS, isGoogleSyncStale } from "./stale";

export type GoogleSyncResult = {
  connection: ConnectionState;
  events: CalendarEvent[];
  writeEnabled: boolean;
  complete: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  calendarIds?: string[];
  accountEmail?: string;
};

export async function loadFreshGoogleCredential(
  store: CalendarCredentialStore,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CalendarCredential | null> {
  const current = await store.get();
  if (!current) return null;
  const { credential, refreshed } = await ensureFreshGoogleCredential(current, env);
  if (refreshed) await store.set(credential);
  return credential;
}

export function defaultSyncRange(timezone: string, now = new Date()): { start: Date; end: Date } {
  const start = addDays(startOfZonedDay(timezone, now), -1);
  const end = addDays(startOfZonedDay(timezone, now), 14);
  return { start, end };
}

export async function syncGoogleCalendar(input: {
  store: CalendarCredentialStore;
  timezone: string;
  includedCalendarIds?: string[];
  privacyDefault?: CalendarEvent["privacy"];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<GoogleSyncResult> {
  try {
    const credential = await loadFreshGoogleCredential(input.store, input.env);
    if (!credential) {
      return {
        connection: { status: "disconnected" },
        events: [],
        writeEnabled: false,
        complete: false,
      };
    }
    const provider = new GoogleCalendarProvider({
      accessToken: credential.accessToken,
      userTimezone: input.timezone,
      includedCalendarIds: input.includedCalendarIds,
      privacyDefault: input.privacyDefault,
      fetchImpl: input.fetchImpl,
    });
    const calendars = await provider.listCalendars();
    const range = defaultSyncRange(input.timezone, input.now);
    const events = await provider.listEvents({
      ...range,
      calendarIds: calendars.filter((calendar) => calendar.included).map((calendar) => calendar.id),
    });
    const email = credential.email || (await googleUserEmail(credential.accessToken, input.fetchImpl));
    if (email && email !== credential.email) {
      await input.store.set({ ...credential, email });
    }
    const calendarIds = calendars.filter((calendar) => calendar.included).map((calendar) => calendar.id);
    return {
      connection: {
        status: "connected",
        email,
        lastSyncedAt: (input.now ?? new Date()).toISOString(),
        calendars,
      },
      events,
      writeEnabled: hasWriteScope(credential.scope),
      complete: true,
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      calendarIds,
      accountEmail: email,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_sync_failed";
    return {
      connection: {
        status: "error",
        syncError: message,
      },
      events: [],
      writeEnabled: false,
      complete: false,
    };
  }
}

export function applyIncludedCalendars(
  calendars: ConnectedCalendar[] | undefined,
  includedIds: string[],
): ConnectedCalendar[] {
  const included = new Set(includedIds);
  return (calendars ?? []).map((calendar) => ({ ...calendar, included: included.has(calendar.id) }));
}

