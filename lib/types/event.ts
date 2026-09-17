export type EventCategory =
  | "work"
  | "meeting"
  | "personal"
  | "training"
  | "travel"
  | "focus";

export type PrivacyLevel = "private" | "busy-only" | "shared";

export type EventSource = "local" | "google" | "icloud" | "telegram";

export type EventStatus = "confirmed" | "tentative" | "cancelled";

export type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  until?: string;
  byWeekday?: number[];
};

export type Participant = {
  id: string;
  name: string;
  role?: "organizer" | "attendee";
};

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location: string;
  participants: Participant[];
  privacy: PrivacyLevel;
  preparationRequired: boolean;
  preparationMinutes: number;
  source: EventSource;
  category: EventCategory;
  status: EventStatus;
  providerEventId?: string;
  calendarId?: string;
  recurringEventId?: string;
  allDay?: boolean;
  blocksTime?: boolean;
  transparency?: "opaque" | "transparent";
  demo?: boolean;
  recurrence?: RecurrenceRule | null;
  timezone?: string;
  workoutId?: string;
  meetingId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BusyBlock = {
  start: string;
  end: string;
  busy: true;
};

export type CreateEventInput = {
  title: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  participants?: Participant[];
  privacy?: PrivacyLevel;
  preparationRequired?: boolean;
  preparationMinutes?: number;
  source?: EventSource;
  category?: EventCategory;
  status?: EventStatus;
  providerEventId?: string;
  calendarId?: string;
  recurringEventId?: string;
  allDay?: boolean;
  blocksTime?: boolean;
  transparency?: "opaque" | "transparent";
  demo?: boolean;
  recurrence?: RecurrenceRule | null;
  timezone?: string;
  workoutId?: string;
  meetingId?: string;
};

export type UpdateEventInput = Partial<Omit<CalendarEvent, "id" | "createdAt">>;
