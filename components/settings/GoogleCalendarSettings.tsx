"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  googleWriteConfigurationError,
  resolveCreateDestinationFromState,
} from "@/lib/calendar/destination";
import { useAppState } from "@/lib/state/provider";
import { ConnectionRow } from "./ConnectionRow";

export function GoogleCalendarSettings() {
  const searchParams = useSearchParams();
  const {
    state,
    googleSyncing,
    googleWriteEnabled,
    refreshGoogle,
    disconnectGoogle,
    setGoogleCalendars,
    setDefaultWriteCalendar,
  } = useAppState();
  const google = {
    ...state.connections.google,
    writeEnabled: googleWriteEnabled || state.connections.google.writeEnabled,
  };
  const writeDestination = resolveCreateDestinationFromState({
    connections: { ...state.connections, google },
  });
  const writeConfigError = googleWriteConfigurationError(google);
  const writableCalendars = (google.calendars ?? []).filter((calendar) => {
    if (!calendar.included) return false;
    return !calendar.accessRole || calendar.accessRole === "owner" || calendar.accessRole === "writer";
  });
  const query = searchParams.get("google");

  useEffect(() => {
    if (query === "connected") {
      void refreshGoogle(true);
      window.history.replaceState({}, "", "/settings");
    }
  }, [query, refreshGoogle]);

  const statusLabel =
    query === "not_configured"
      ? "Not configured"
      : google.status === "connected"
        ? google.email
          ? `Connected · ${google.email}`
          : "Connected"
        : google.status === "connecting"
          ? "Connecting"
          : google.status === "error"
            ? "Connection error"
            : "Not connected";

  return (
    <div>
      <ConnectionRow
        name="Google Calendar"
        status={google.status}
        connectedLabel={statusLabel}
        disconnectedLabel={query === "not_configured" ? "Not configured" : "Not connected"}
      />
      {google.syncError ? <p className="text-sm text-[var(--muted)]">{google.syncError}</p> : null}
      {google.lastSyncedAt ? (
        <p className="text-sm text-[var(--muted)]">
          Last synced {new Date(google.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {googleSyncing ? " · Refreshing…" : ""}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {google.status !== "connected" ? (
          <a className="btn-solid" href="/api/google/oauth">
            Connect
          </a>
        ) : (
          <>
            <button type="button" className="btn-quiet" onClick={() => void refreshGoogle(true)} disabled={googleSyncing}>
              Refresh
            </button>
            <button type="button" className="btn-quiet" onClick={() => void disconnectGoogle()}>
              Disconnect
            </button>
            {!googleWriteEnabled ? (
              <a className="btn-quiet" href="/api/google/oauth?mode=write">
                Enable writes
              </a>
            ) : (
              <p className="self-center text-sm text-[var(--muted)]">Writes enabled</p>
            )}
          </>
        )}
      </div>

      {google.calendars?.length ? (
        <div className="mt-4">
          <p className="section-kicker">Included calendars</p>
          <ul className="mt-2 space-y-2">
            {google.calendars.map((calendar) => (
              <li key={calendar.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={calendar.included}
                    onChange={(event) => {
                      const next = (google.calendars ?? []).map((item) =>
                        item.id === calendar.id ? { ...item, included: event.target.checked } : item,
                      );
                      void setGoogleCalendars(next.filter((item) => item.included).map((item) => item.id));
                    }}
                  />
                  <span>
                    {calendar.summary}
                    {calendar.primary ? " · Primary" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {google.status === "connected" && googleWriteEnabled ? (
        <div className="mt-4">
          <p className="section-kicker">Default write calendar</p>
          {writeConfigError ? (
            <p className="mt-2 text-sm text-[var(--muted)]">{writeConfigError}</p>
          ) : writableCalendars.length > 1 ? (
            <label className="mt-2 flex flex-col gap-1 text-sm">
              <select
                value={writeDestination.provider === "google" ? writeDestination.calendarId : ""}
                onChange={(event) => setDefaultWriteCalendar(event.target.value)}
              >
                {writableCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                    {calendar.primary ? " · Primary" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : writeDestination.provider === "google" ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {google.calendars?.find((calendar) => calendar.id === writeDestination.calendarId)?.summary ??
                writeDestination.calendarId}
            </p>
          ) : null}
        </div>
      ) : null}

      {query === "error" ? (
        <p className="mt-2 text-sm text-[var(--muted)]">Google Calendar could not connect. Local events are unchanged.</p>
      ) : null}
    </div>
  );
}
