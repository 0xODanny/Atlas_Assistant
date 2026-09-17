import type { WriteDestination } from "../calendar/destination";
import {
  applyDestinationToCreateInput,
  resolveCreateDestinationFromState,
} from "../calendar/destination";
import { applyAssistantAction } from "../assistant/apply";
import { createEventAlreadyExists } from "../calendar/workoutSchedule";
import { planningConflicts, planningFreeTimeOptions } from "../calendar/transitionBuffer";
import type { AssistantAction, MutationPayload } from "../types/assistant";
import type { CalendarEvent, CreateEventInput } from "../types/event";
import type { AppState, StateStore } from "../data/state";
import type { GoogleWriteRequest } from "./write";

export function destinationFromState(state: AppState): { calendarId: string; summary: string } | undefined {
  const destination = resolveCreateDestinationFromState(state);
  if (destination.provider !== "google") return undefined;
  const calendar = state.connections.google.calendars?.find((item) => item.id === destination.calendarId);
  return { calendarId: destination.calendarId, summary: calendar?.summary ?? destination.calendarId };
}

export function googleWriteRequestForDestination(
  payload: MutationPayload,
  state: AppState,
  destination?: WriteDestination,
): GoogleWriteRequest | undefined {
  if (payload.type === "createEvent") {
    const resolved = destination ?? resolveCreateDestinationFromState(state, payload.event.calendarId);
    if (resolved.provider !== "google") return undefined;
    const event = applyDestinationToCreateInput(payload.event, resolved);
    return {
      kind: "create",
      calendarId: resolved.calendarId,
      event,
      userTimezone: event.timezone || state.profile.timezone,
    };
  }

  if (payload.type === "updateEvent") {
    const current = state.events.find((item) => item.id === payload.id);
    if (!current || current.source !== "google" || !current.providerEventId || !current.calendarId) return undefined;
    return {
      kind: "update",
      calendarId: current.calendarId,
      providerEventId: current.providerEventId,
      event: current,
      patch: payload.patch,
      userTimezone: state.profile.timezone,
    };
  }

  if (payload.type === "deleteEvent") {
    const current = state.events.find((item) => item.id === payload.id);
    if (!current || current.source !== "google" || !current.providerEventId || !current.calendarId) return undefined;
    return {
      kind: "delete",
      calendarId: current.calendarId,
      providerEventId: current.providerEventId,
    };
  }

  return undefined;
}

export function googleWriteRequestForPayload(
  payload: MutationPayload,
  state: AppState,
): GoogleWriteRequest | undefined {
  return googleWriteRequestForDestination(payload, state);
}

export function shouldWriteGoogle(payload: MutationPayload | undefined, state: AppState): boolean {
  if (!payload) return false;
  return Boolean(googleWriteRequestForPayload(payload, state));
}

export function createEventInputFromGoogle(event: CalendarEvent): CreateEventInput {
  return {
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    location: event.location,
    participants: event.participants,
    privacy: event.privacy,
    source: "google",
    category: event.category,
    status: event.status,
    providerEventId: event.providerEventId,
    calendarId: event.calendarId,
    recurringEventId: event.recurringEventId,
    allDay: event.allDay,
    blocksTime: event.blocksTime,
    timezone: event.timezone,
    demo: false,
  };
}

export async function postGoogleWrite(
  request: GoogleWriteRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; event: CalendarEvent | null } | { ok: false; error: string }> {
  const response = await fetchImpl("/api/google/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; event?: CalendarEvent; error?: string };
  if (!response.ok || data.ok === false) {
    return { ok: false, error: data.error || "Could not create this event in Google Calendar." };
  }
  if (request.kind === "create" && !data.event?.providerEventId) {
    return { ok: false, error: "Could not create this event in Google Calendar." };
  }
  if (request.kind === "update" && !data.event?.providerEventId) {
    return { ok: false, error: "Could not update this event in Google Calendar." };
  }
  return { ok: true, event: data.event ?? null };
}

export function actionWriteError(action: AssistantAction, error: string): AssistantAction {
  return { ...action, status: "proposed", error };
}

export async function executeAssistantWrite(
  store: StateStore,
  action: AssistantAction,
  write: typeof postGoogleWrite = postGoogleWrite,
): Promise<AssistantAction> {
  const current = store.getState();
  const payload = action.payload;
  if (payload?.type === "createEvent") {
    if (createEventAlreadyExists(current.events, payload.event.title, payload.event.start)) {
      return actionWriteError(action, `${payload.event.title} is already on the calendar.`);
    }
    if (
      planningConflicts(
        payload.event.start,
        payload.event.end,
        current.events,
        planningFreeTimeOptions(current.profile, current.workouts),
      )
    ) {
      return actionWriteError(action, "That time now conflicts with another event or a workout buffer.");
    }
  }
  const destination =
    action.destination ??
    (payload?.type === "createEvent"
      ? resolveCreateDestinationFromState(current, payload.event.calendarId)
      : undefined);

  if (payload?.type === "createEvent" && destination?.provider === "google") {
    const request = googleWriteRequestForDestination(payload, current, destination);
    if (!request) {
      return actionWriteError(action, "Could not create this event in Google Calendar.");
    }
    const written = await write(request);
    if (!written.ok || !written.event?.providerEventId) {
      return actionWriteError(
        action,
        written.ok ? "Could not create this event in Google Calendar." : written.error,
      );
    }
    return applyAssistantAction(store, {
      ...action,
      payload: { ...payload, event: createEventInputFromGoogle(written.event) },
    });
  }

  if (payload && (payload.type === "updateEvent" || payload.type === "deleteEvent")) {
    const request = googleWriteRequestForDestination(payload, current, destination);
    if (request) {
      const written = await write(request);
      if (!written.ok) return actionWriteError(action, written.error);
      if (payload.type === "updateEvent" && !written.event?.providerEventId) {
        return actionWriteError(action, "Could not update this event in Google Calendar.");
      }
      if (payload.type === "updateEvent" && written.event) {
        return applyAssistantAction(store, {
          ...action,
          payload: { ...payload, patch: written.event },
        });
      }
      if (payload.type === "deleteEvent" && written.ok) {
        return applyAssistantAction(store, action);
      }
    } else if (destination?.provider === "google") {
      return actionWriteError(
        action,
        payload.type === "deleteEvent"
          ? "Could not delete this event in Google Calendar."
          : "Could not update this event in Google Calendar.",
      );
    }
  }

  if (destination?.provider === "google") {
    return actionWriteError(action, "Could not create this event in Google Calendar.");
  }

  return applyAssistantAction(store, action);
}
