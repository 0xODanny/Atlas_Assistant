import { addDays, zonedLocalToUtc } from "../time";
import type { CalendarEvent, EventCategory, EventStatus, Participant, PrivacyLevel } from "../types/event";

export type GoogleEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleAttendee = {
  email?: string;
  displayName?: string;
  organizer?: boolean;
  responseStatus?: string;
};

export type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  attendees?: GoogleAttendee[];
  organizer?: { email?: string; displayName?: string };
  recurringEventId?: string;
  recurrence?: string[];
  visibility?: string;
  transparency?: string;
  created?: string;
  updated?: string;
  htmlLink?: string;
};

export type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole?: string;
};

function googleBlocksTime(allDay: boolean, transparency: string | undefined, status: EventStatus): boolean {
  if (status === "cancelled") return false;
  if (transparency === "transparent") return false;
  if (allDay) return transparency === "opaque";
  return transparency !== "transparent";
}

function googleStatus(status?: string): EventStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "tentative") return "tentative";
  return "confirmed";
}

function googlePrivacy(visibility?: string, fallback: PrivacyLevel = "private"): PrivacyLevel {
  if (visibility === "public") return "shared";
  if (visibility === "private" || visibility === "confidential") return "private";
  return fallback;
}

function inferCategory(event: GoogleCalendarEvent): EventCategory {
  const text = `${event.summary ?? ""} ${event.description ?? ""}`.toLowerCase();
  if (event.attendees && event.attendees.length > 1) return "meeting";
  if (/\b(swim|bike|run|workout|train|gym|ride)\b/.test(text)) return "training";
  if (/\bfocus|deep work\b/.test(text)) return "focus";
  if (/\bflight|travel|airport\b/.test(text)) return "travel";
  if (/\bmeet|standup|sync|call\b/.test(text)) return "meeting";
  return "personal";
}

function parseDateParts(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function googleDateToUtc(value: GoogleEventDate | undefined, fallbackTimeZone: string): Date {
  if (!value) return new Date(NaN);
  if (value.dateTime) {
    const parsed = new Date(value.dateTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    if (value.timeZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value.dateTime)) {
      const [datePart, timePart] = value.dateTime.split("T");
      const { year, month, day } = parseDateParts(datePart);
      const [hour, minute] = timePart.split(":").map(Number);
      return zonedLocalToUtc(value.timeZone, year, month, day, hour, minute);
    }
  }
  if (value.date) {
    const { year, month, day } = parseDateParts(value.date);
    return zonedLocalToUtc(value.timeZone || fallbackTimeZone, year, month, day, 0, 0);
  }
  return new Date(NaN);
}

export function googleAllDayRange(
  start: GoogleEventDate | undefined,
  end: GoogleEventDate | undefined,
  fallbackTimeZone: string,
): { start: Date; end: Date } {
  const zone = start?.timeZone || end?.timeZone || fallbackTimeZone;
  const startDate = googleDateToUtc({ date: start?.date, timeZone: zone }, zone);
  let endDate = end?.date ? googleDateToUtc({ date: end.date, timeZone: zone }, zone) : addDays(startDate, 1);
  if (endDate.getTime() <= startDate.getTime()) {
    endDate = addDays(startDate, 1);
  }
  return { start: startDate, end: endDate };
}

export function atlasEventId(calendarId: string, providerEventId: string): string {
  const safeCalendar = calendarId.replace(/[^a-zA-Z0-9._@-]/g, "_");
  const safeEvent = providerEventId.replace(/[^a-zA-Z0-9._@-]/g, "_");
  return `gcal_${safeCalendar}_${safeEvent}`.slice(0, 180);
}

function participantsFromGoogle(event: GoogleCalendarEvent): Participant[] {
  const people = event.attendees ?? [];
  return people
    .filter((person) => person.displayName || person.email)
    .map((person, index) => ({
      id: person.email || `gcal_person_${index}`,
      name: person.displayName || person.email || "Guest",
      role: person.organizer ? "organizer" : "attendee",
    }));
}

export function mapGoogleEvent(input: {
  event: GoogleCalendarEvent;
  calendarId: string;
  userTimezone: string;
  privacyDefault?: PrivacyLevel;
  now?: Date;
}): CalendarEvent | null {
  const providerEventId = input.event.id;
  if (!providerEventId) return null;
  const allDay = Boolean(input.event.start?.date && !input.event.start.dateTime);
  const range = allDay
    ? googleAllDayRange(input.event.start, input.event.end, input.userTimezone)
    : {
        start: googleDateToUtc(input.event.start, input.userTimezone),
        end: googleDateToUtc(input.event.end, input.userTimezone),
      };
  if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) return null;

  const now = (input.now ?? new Date()).toISOString();
  const status = googleStatus(input.event.status);
  const eventTimezone = input.event.start?.timeZone || input.event.end?.timeZone || input.userTimezone;

  return {
    id: atlasEventId(input.calendarId, providerEventId),
    title: input.event.summary?.trim() || "(No title)",
    description: input.event.description?.trim() ?? "",
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    location: input.event.location?.trim() ?? "",
    participants: participantsFromGoogle(input.event),
    privacy: googlePrivacy(input.event.visibility, input.privacyDefault ?? "private"),
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: inferCategory(input.event),
    status,
    providerEventId,
    calendarId: input.calendarId,
    recurringEventId: input.event.recurringEventId,
    allDay,
    blocksTime: googleBlocksTime(allDay, input.event.transparency, status),
    transparency:
      input.event.transparency === "transparent" || input.event.transparency === "opaque"
        ? input.event.transparency
        : undefined,
    recurrence: null,
    timezone: eventTimezone,
    createdAt: input.event.created || now,
    updatedAt: input.event.updated || now,
  };
}

export function defaultIncludedCalendars(
  calendars: GoogleCalendarListEntry[],
): Array<{ id: string; summary: string; primary?: boolean; included: boolean; accessRole?: string }> {
  return calendars
    .filter((calendar) => calendar.id)
    .map((calendar) => {
      const summary = calendar.summary || calendar.id || "Calendar";
      const owned = calendar.accessRole === "owner" || calendar.accessRole === "writer";
      const holidayOrBirthday = /birthday|holiday/i.test(summary);
      const included = Boolean(calendar.primary || (owned && calendar.selected !== false && !holidayOrBirthday));
      return {
        id: calendar.id as string,
        summary,
        primary: calendar.primary,
        included,
        accessRole: calendar.accessRole,
      };
    });
}

export function eventKey(event: { calendarId?: string; providerEventId?: string; id: string }): string {
  if (event.calendarId && event.providerEventId) {
    return `google:${event.calendarId}:${event.providerEventId}`;
  }
  return `local:${event.id}`;
}
