import type { CalendarEvent, EventSource } from "../types/event";
import type { ConnectedCalendar } from "../types/profile";

export type CalendarRange = {
  start: Date;
  end: Date;
  calendarIds?: string[];
};

export type ProviderWriteResult = {
  event: CalendarEvent;
};

export interface CalendarProvider {
  id: EventSource;
  listCalendars(): Promise<ConnectedCalendar[]>;
  listEvents(range: CalendarRange): Promise<CalendarEvent[]>;
}

export class DisconnectedCalendarProvider implements CalendarProvider {
  constructor(public readonly id: Exclude<EventSource, "local">) {}

  async listCalendars(): Promise<ConnectedCalendar[]> {
    throw new Error(`${this.id} calendar is not connected.`);
  }

  async listEvents(): Promise<CalendarEvent[]> {
    throw new Error(`${this.id} calendar is not connected.`);
  }
}
