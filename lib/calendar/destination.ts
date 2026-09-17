import type { AppState } from "../data/state";
import type { CreateEventInput } from "../types/event";
import type { ConnectedCalendar, ConnectionState, Connections } from "../types/profile";

export type WriteDestination =
  | { provider: "google"; calendarId: string; label: string }
  | { provider: "local"; label: "Atlas · Local" };

export function formatGoogleDestinationLabel(summary: string): string {
  return `Google Calendar · ${summary}`;
}

export function resolveCreateDestination(input: {
  googleConnected: boolean;
  googleWritesEnabled: boolean;
  includedCalendars?: Array<Pick<ConnectedCalendar, "id" | "summary" | "primary" | "included" | "accessRole">>;
  preferredCalendarId?: string;
  explicitUserCalendarChoice?: string;
}): WriteDestination {
  const listed = input.includedCalendars ?? [];
  const included = listed.filter((calendar) => calendar.included);
  const candidates = included.length > 0 ? included : listed.filter((calendar) => calendar.included !== false);
  const writable = candidates.filter((calendar) => {
    const role = calendar.accessRole;
    return !role || role === "owner" || role === "writer";
  });
  const pick = (id?: string) => (id ? writable.find((calendar) => calendar.id === id) : undefined);

  if (input.googleConnected && input.googleWritesEnabled) {
    const chosen =
      pick(input.explicitUserCalendarChoice) ??
      pick(input.preferredCalendarId) ??
      (writable.length === 1 ? writable[0] : undefined) ??
      writable.find((calendar) => calendar.primary) ??
      writable[0];
    if (chosen) {
      return {
        provider: "google",
        calendarId: chosen.id,
        label: formatGoogleDestinationLabel(chosen.summary),
      };
    }
  }

  return { provider: "local", label: "Atlas · Local" };
}

export function resolveCreateDestinationFromState(
  state: Pick<AppState, "connections">,
  explicitUserCalendarChoice?: string,
): WriteDestination {
  const google = state.connections.google;
  return resolveCreateDestination({
    googleConnected: google.status === "connected",
    googleWritesEnabled: Boolean(google.writeEnabled),
    includedCalendars: google.calendars,
    preferredCalendarId: google.defaultWriteCalendarId,
    explicitUserCalendarChoice,
  });
}

export function resolveCreateDestinationFromContext(input: {
  connections?: Connections;
  googleWriteEnabled?: boolean;
  explicitUserCalendarChoice?: string;
}): WriteDestination {
  const google = input.connections?.google;
  return resolveCreateDestination({
    googleConnected: google?.status === "connected",
    googleWritesEnabled: Boolean(input.googleWriteEnabled || google?.writeEnabled),
    includedCalendars: google?.calendars,
    preferredCalendarId: google?.defaultWriteCalendarId,
    explicitUserCalendarChoice: input.explicitUserCalendarChoice,
  });
}

export function applyDestinationToCreateInput(
  event: CreateEventInput,
  destination: WriteDestination,
): CreateEventInput {
  if (destination.provider === "google") {
    return { ...event, source: "google", calendarId: destination.calendarId };
  }
  return { ...event, source: "local", calendarId: event.calendarId };
}

export function withResolvedWriteCalendar(connection: ConnectionState): ConnectionState {
  const destination = resolveCreateDestination({
    googleConnected: connection.status === "connected",
    googleWritesEnabled: Boolean(connection.writeEnabled),
    includedCalendars: connection.calendars,
    preferredCalendarId: connection.defaultWriteCalendarId,
  });
  return {
    ...connection,
    defaultWriteCalendarId:
      destination.provider === "google" ? destination.calendarId : connection.defaultWriteCalendarId,
  };
}

export function mergeGoogleConnection(current: ConnectionState, incoming: ConnectionState): ConnectionState {
  return withResolvedWriteCalendar({
    ...current,
    ...incoming,
    calendars: incoming.calendars ?? current.calendars,
    writeEnabled:
      incoming.status === "error"
        ? Boolean(incoming.writeEnabled || current.writeEnabled)
        : incoming.writeEnabled ?? current.writeEnabled,
    defaultWriteCalendarId: incoming.defaultWriteCalendarId ?? current.defaultWriteCalendarId,
    email: incoming.email ?? current.email,
    lastSyncedAt: incoming.lastSyncedAt ?? current.lastSyncedAt,
    syncError: incoming.status === "connected" ? undefined : incoming.syncError,
  });
}

export function googleWriteConfigurationError(connection: ConnectionState): string | undefined {
  if (connection.status !== "connected" || !connection.writeEnabled) return undefined;
  const destination = resolveCreateDestination({
    googleConnected: true,
    googleWritesEnabled: true,
    includedCalendars: connection.calendars,
    preferredCalendarId: connection.defaultWriteCalendarId,
  });
  if (destination.provider !== "google") {
    return "Writes are enabled but no writable Google calendar is selected.";
  }
  return undefined;
}

export function destinationsMatch(left?: WriteDestination, right?: WriteDestination): boolean {
  if (!left || !right) return false;
  if (left.provider !== right.provider) return false;
  if (left.provider === "local" && right.provider === "local") return true;
  return left.provider === "google" && right.provider === "google" && left.calendarId === right.calendarId;
}
