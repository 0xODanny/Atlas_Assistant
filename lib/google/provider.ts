import type { CalendarProvider, CalendarRange } from "../integrations/calendar-provider";
import type { CalendarEvent } from "../types/event";
import type { ConnectedCalendar } from "../types/profile";
import { GOOGLE_CALENDAR_API } from "./config";
import { defaultIncludedCalendars, mapGoogleEvent, type GoogleCalendarEvent, type GoogleCalendarListEntry } from "./mapEvent";

export type GoogleFetch = typeof fetch;

export type GoogleCalendarProviderOptions = {
  accessToken: string;
  userTimezone: string;
  includedCalendarIds?: string[];
  privacyDefault?: CalendarEvent["privacy"];
  fetchImpl?: GoogleFetch;
};

async function googleJson<T>(
  accessToken: string,
  url: string,
  init: RequestInit = {},
  fetchImpl: GoogleFetch = fetch,
): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`google_http_${response.status}`);
    (error as Error & { status?: number; body?: string }).status = response.status;
    (error as Error & { status?: number; body?: string }).body = body.slice(0, 300);
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly id = "google" as const;
  private readonly accessToken: string;
  private readonly userTimezone: string;
  private readonly includedCalendarIds?: string[];
  private readonly privacyDefault?: CalendarEvent["privacy"];
  private readonly fetchImpl: GoogleFetch;

  constructor(options: GoogleCalendarProviderOptions) {
    this.accessToken = options.accessToken;
    this.userTimezone = options.userTimezone;
    this.includedCalendarIds = options.includedCalendarIds;
    this.privacyDefault = options.privacyDefault;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listCalendars(): Promise<ConnectedCalendar[]> {
    const data = await googleJson<{ items?: GoogleCalendarListEntry[] }>(
      this.accessToken,
      `${GOOGLE_CALENDAR_API}/users/me/calendarList`,
      {},
      this.fetchImpl,
    );
    const calendars = defaultIncludedCalendars(data.items ?? []);
    if (!this.includedCalendarIds?.length) return calendars;
    const included = new Set(this.includedCalendarIds);
    const anyMatch = calendars.some((calendar) => included.has(calendar.id));
    if (!anyMatch) return calendars;
    return calendars.map((calendar) => ({ ...calendar, included: included.has(calendar.id) }));
  }

  async listEvents(range: CalendarRange): Promise<CalendarEvent[]> {
    const calendars = range.calendarIds?.length
      ? range.calendarIds
      : (await this.listCalendars()).filter((calendar) => calendar.included).map((calendar) => calendar.id);
    const events: CalendarEvent[] = [];
    for (const calendarId of calendars) {
      const params = new URLSearchParams({
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      const data = await googleJson<{ items?: GoogleCalendarEvent[] }>(
        this.accessToken,
        `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        {},
        this.fetchImpl,
      );
      for (const item of data.items ?? []) {
        const mapped = mapGoogleEvent({
          event: item,
          calendarId,
          userTimezone: this.userTimezone,
          privacyDefault: this.privacyDefault,
        });
        if (mapped) events.push(mapped);
      }
    }
    return events.sort((a, b) => a.start.localeCompare(b.start));
  }
}

export async function googleUserEmail(accessToken: string, fetchImpl: GoogleFetch = fetch): Promise<string | undefined> {
  try {
    const data = await googleJson<{ email?: string }>(
      accessToken,
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {},
      fetchImpl,
    );
    return data.email;
  } catch {
    return undefined;
  }
}

export { googleJson };
