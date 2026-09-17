import { DEFAULT_CALENDAR_ID } from "../config";
import { atlasEventId } from "../google/mapEvent";
import { createId } from "../id";
import type { CalendarEvent, CreateEventInput, UpdateEventInput } from "../types/event";
import type { StateStore } from "../data/state";

export function createCalendarRepository(store: StateStore) {
  return {
    listEvents(range?: { start: Date; end: Date }): CalendarEvent[] {
      const events = store.getState().events;
      if (!range) {
        return [...events].sort((a, b) => a.start.localeCompare(b.start));
      }
      const start = range.start.getTime();
      const end = range.end.getTime();
      return events
        .filter((event) => {
          const eventStart = new Date(event.start).getTime();
          const eventEnd = new Date(event.end).getTime();
          return eventEnd > start && eventStart < end;
        })
        .sort((a, b) => a.start.localeCompare(b.start));
    },

    getEvent(id: string): CalendarEvent | undefined {
      return store.getState().events.find((event) => event.id === id);
    },

    createEvent(input: CreateEventInput): CalendarEvent {
      const now = new Date().toISOString();
      const state = store.getState();
      const existing =
        input.providerEventId && input.calendarId
          ? state.events.find(
              (event) => event.providerEventId === input.providerEventId && event.calendarId === input.calendarId,
            )
          : undefined;
      if (existing) {
        return createCalendarRepository(store).updateEvent(existing.id, input);
      }
      const event: CalendarEvent = {
        id:
          input.providerEventId && input.calendarId
            ? atlasEventId(input.calendarId, input.providerEventId)
            : createId("evt"),
        title: input.title.trim(),
        description: input.description?.trim() ?? "",
        start: input.start,
        end: input.end,
        location: input.location?.trim() ?? "",
        participants: input.participants ?? [],
        privacy: input.privacy ?? state.profile.privacyDefault,
        preparationRequired: input.preparationRequired ?? false,
        preparationMinutes: input.preparationMinutes ?? 0,
        source: input.source ?? "local",
        category: input.category ?? "personal",
        status: input.status ?? "confirmed",
        providerEventId: input.providerEventId,
        calendarId: input.calendarId ?? DEFAULT_CALENDAR_ID,
        recurringEventId: input.recurringEventId,
        allDay: input.allDay ?? false,
        blocksTime: input.blocksTime ?? input.status !== "cancelled",
        transparency: input.transparency,
        recurrence: input.recurrence ?? null,
        timezone: input.timezone ?? state.profile.timezone,
        workoutId: input.workoutId,
        meetingId: input.meetingId,
        demo: input.demo === true,
        createdAt: now,
        updatedAt: now,
      };
      store.setState({
        ...state,
        events: [...state.events, event],
      });
      return event;
    },

    updateEvent(id: string, patch: UpdateEventInput): CalendarEvent {
      const state = store.getState();
      const current = state.events.find((event) => event.id === id);
      if (!current) {
        throw new Error(`Event not found: ${id}`);
      }
      const updated: CalendarEvent = {
        ...current,
        ...patch,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      store.setState({
        ...state,
        events: state.events.map((event) => (event.id === id ? updated : event)),
      });
      return updated;
    },

    deleteEvent(id: string): CalendarEvent {
      const state = store.getState();
      const current = state.events.find((event) => event.id === id);
      if (!current) {
        throw new Error(`Event not found: ${id}`);
      }
      store.setState({
        ...state,
        events: state.events.filter((event) => event.id !== id),
        workouts: state.workouts.map((workout) =>
          workout.eventId === id ? { ...workout, eventId: undefined } : workout,
        ),
        meetings: state.meetings.filter((meeting) => meeting.eventId !== id),
        tasks: state.tasks.map((task) =>
          task.eventId === id ? { ...task, eventId: undefined } : task,
        ),
      });
      return current;
    },
  };
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
