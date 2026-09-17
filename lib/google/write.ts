import type { CalendarEvent, CreateEventInput, UpdateEventInput } from "../types/event";
import { GOOGLE_CALENDAR_API, hasWriteScope } from "./config";
import type { CalendarCredential } from "./credentials";
import { mapGoogleEvent, type GoogleCalendarEvent } from "./mapEvent";
import { googleJson } from "./provider";

export type GoogleWriteRequest =
  | { kind: "create"; calendarId: string; event: CreateEventInput; userTimezone: string }
  | { kind: "update"; calendarId: string; providerEventId: string; event: CalendarEvent; patch: UpdateEventInput; userTimezone: string }
  | { kind: "delete"; calendarId: string; providerEventId: string };

function googleEventBody(input: {
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  timezone: string;
  attendees?: Array<{ email?: string; displayName?: string }>;
}): Record<string, unknown> {
  if (input.allDay) {
    const startDate = input.start.slice(0, 10);
    const endDate = input.end.slice(0, 10);
    return {
      summary: input.title,
      description: input.description,
      location: input.location,
      start: { date: startDate },
      end: { date: endDate },
    };
  }
  return {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
    attendees: input.attendees,
  };
}

export function assertGoogleWriteAllowed(credential: CalendarCredential, event?: CalendarEvent): void {
  if (!hasWriteScope(credential.scope)) {
    throw new Error("google_write_scope_required");
  }
  if (event?.recurringEventId) {
    throw new Error("google_recurring_edit_unsupported");
  }
}

export async function writeGoogleEvent(input: {
  credential: CalendarCredential;
  request: GoogleWriteRequest;
  fetchImpl?: typeof fetch;
}): Promise<CalendarEvent | null> {
  assertGoogleWriteAllowed(input.credential, input.request.kind === "update" ? input.request.event : undefined);
  const fetchImpl = input.fetchImpl ?? fetch;

  if (input.request.kind === "delete") {
    await googleJson(
      input.credential.accessToken,
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(input.request.calendarId)}/events/${encodeURIComponent(input.request.providerEventId)}`,
      { method: "DELETE" },
      fetchImpl,
    );
    return null;
  }

  if (input.request.kind === "create") {
    const body = googleEventBody({
      title: input.request.event.title,
      description: input.request.event.description,
      location: input.request.event.location,
      start: input.request.event.start,
      end: input.request.event.end,
      allDay: input.request.event.allDay,
      timezone: input.request.event.timezone || input.request.userTimezone,
      attendees: input.request.event.participants?.map((person) => ({ displayName: person.name })),
    });
    const created = await googleJson<GoogleCalendarEvent>(
      input.credential.accessToken,
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(input.request.calendarId)}/events`,
      { method: "POST", body: JSON.stringify(body) },
      fetchImpl,
    );
    const mapped = mapGoogleEvent({
      event: created,
      calendarId: input.request.calendarId,
      userTimezone: input.request.userTimezone,
    });
    if (!mapped) throw new Error("google_write_unmapped");
    return mapped;
  }

  const next = { ...input.request.event, ...input.request.patch };
  const body = googleEventBody({
    title: next.title,
    description: next.description,
    location: next.location,
    start: next.start,
    end: next.end,
    allDay: next.allDay,
    timezone: next.timezone || input.request.userTimezone,
  });
  const updated = await googleJson<GoogleCalendarEvent>(
    input.credential.accessToken,
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(input.request.calendarId)}/events/${encodeURIComponent(input.request.providerEventId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
    fetchImpl,
  );
  const mapped = mapGoogleEvent({
    event: updated,
    calendarId: input.request.calendarId,
    userTimezone: input.request.userTimezone,
  });
  if (!mapped) throw new Error("google_write_unmapped");
  return mapped;
}
