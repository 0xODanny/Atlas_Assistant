import { createId } from "../id";
import { createCalendarRepository } from "../repositories/calendar";
import { createTaskRepository } from "../repositories/tasks";
import type { StateStore } from "../data/state";
import type { AssistantAction } from "../types/assistant";
import type { Sport, Workout } from "../types/training";
import type { Meeting } from "../types/meeting";

function sportFromTitle(title: string, explicit?: Sport): Sport | undefined {
  if (explicit) return explicit;
  const lower = title.toLowerCase();
  if (lower.includes("swim")) return "swim";
  if (lower.includes("bike")) return "bike";
  if (lower.includes("run")) return "run";
  if (lower.includes("strength")) return "strength";
  if (lower.includes("recovery")) return "recovery";
  return undefined;
}

export function applyAssistantAction(store: StateStore, action: AssistantAction): AssistantAction {
  if (!action.payload || action.kind === "read") {
    return { ...action, status: "applied" };
  }

  const calendar = createCalendarRepository(store);
  const tasks = createTaskRepository(store);
  const payload = action.payload;
  let resultEventId: string | undefined;

  if (payload.type === "createEvent") {
    const event = calendar.createEvent({ ...payload.event, demo: payload.event.demo === true });
    resultEventId = event.id;
    const sport = sportFromTitle(event.title, payload.workoutSport);
    const state = store.getState();
    const now = new Date().toISOString();

    if (sport) {
      const workout: Workout = {
        id: createId("workout"),
        eventId: event.id,
        sport,
        duration: Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000),
        intensity: "moderate",
        description: event.description || `${sport} session`,
        scheduledTime: event.start,
        completed: false,
        weatherDependent: sport === "bike" || sport === "run",
        createdAt: now,
        updatedAt: now,
      };
      calendar.updateEvent(event.id, { workoutId: workout.id, category: "training" });
      store.setState({
        ...store.getState(),
        workouts: [...store.getState().workouts, workout],
      });
    } else if (event.category === "meeting") {
      const meeting: Meeting = {
        id: createId("meet"),
        eventId: event.id,
        title: event.title,
        participantIds: event.participants.map((person) => person.id),
        agenda: event.description ? [event.description] : [],
        preparationNotes: [],
        unresolvedQuestions: [],
        actionItems: [],
        createdAt: now,
        updatedAt: now,
      };
      calendar.updateEvent(event.id, { meetingId: meeting.id });
      store.setState({
        ...store.getState(),
        meetings: [...state.meetings, meeting],
      });
    }
  }

  if (payload.type === "updateEvent") {
    calendar.updateEvent(payload.id, payload.patch);
  }

  if (payload.type === "deleteEvent") {
    calendar.deleteEvent(payload.id);
  }

  if (payload.type === "createTask") {
    tasks.createTask({
      title: payload.title,
      important: payload.important,
      eventId: payload.eventId,
    });
  }

  return { ...action, status: "applied", resultEventId: resultEventId ?? (payload.type === "updateEvent" || payload.type === "deleteEvent" ? payload.id : undefined) };
}
