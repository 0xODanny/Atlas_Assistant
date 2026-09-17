"use client";

import { Suspense, useEffect, useState } from "react";
import { resolveCreateDestinationFromState } from "@/lib/calendar/destination";
import {
  DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES,
  clampAfterWorkoutBufferMinutes,
  resolveAfterWorkoutBufferMinutes,
} from "@/lib/calendar/transitionBuffer";
import { resolveFocusBlockMinutes, resolveSchedulingHours, withUpdatedHours } from "@/lib/calendar/hours";
import { HoursEditor } from "./HoursEditor";
import { APP_DISPLAY_NAME } from "@/lib/config";
import { sampleDataEnabled } from "@/lib/data/sample";
import { useAppState } from "@/lib/state/provider";
import type { PrivacyLevel } from "@/lib/types/event";
import { ConnectionRow } from "./ConnectionRow";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

export function SettingsView() {
  const { state, updateProfile, resetSampleData, googleWriteEnabled } = useAppState();
  const profile = state.profile;
  const sampleOn = sampleDataEnabled(profile, state.connections);
  const writeDestination = resolveCreateDestinationFromState({
    connections: {
      ...state.connections,
      google: { ...state.connections.google, writeEnabled: googleWriteEnabled || state.connections.google.writeEnabled },
    },
  });
  const defaultWriteLabel =
    writeDestination.provider === "google"
      ? state.connections.google.calendars?.find((calendar) => calendar.id === writeDestination.calendarId)?.summary ??
        writeDestination.calendarId
      : "Not configured";
  const [openaiStatus, setOpenaiStatus] = useState<"connected" | "not_configured">("not_configured");

  useEffect(() => {
    void fetch("/api/assistant")
      .then((response) => response.json())
      .then((data: { openai?: string }) => {
        setOpenaiStatus(data.openai === "connected" ? "connected" : "not_configured");
      })
      .catch(() => setOpenaiStatus("not_configured"));
  }, []);

  return (
    <div className="mx-auto max-w-xl">
      <p className="section-kicker">Settings</p>
      <h1 className="display-title mt-2">{profile.displayName}</h1>
      <p className="mt-3 text-[var(--muted)]">
        {APP_DISPLAY_NAME} stays local. Intelligence uses a server-side key if one is configured.
      </p>

      <section className="mt-8 space-y-3">
        <p className="section-kicker">Intelligence</p>
        <ConnectionRow
          name="OpenAI"
          status={openaiStatus === "connected" ? "connected" : "disconnected"}
          connectedLabel="Connected"
          disconnectedLabel="Not configured"
        />
      </section>

      <section className="mt-8 space-y-3">
        <p className="section-kicker">Data</p>
        <div className="flex items-baseline justify-between gap-3">
          <p>Google Calendar</p>
          <p className="text-sm text-[var(--muted)]">
            {state.connections.google.status === "connected" ? "Connected" : "Disconnected"}
          </p>
        </div>
        {state.connections.google.status === "connected" ? (
          <div className="flex items-baseline justify-between gap-3">
            <p>Calendar writes</p>
            <p className="text-sm text-[var(--muted)]">{googleWriteEnabled ? "Enabled" : "Read only"}</p>
          </div>
        ) : null}
        {googleWriteEnabled ? (
          <div className="flex items-baseline justify-between gap-3">
            <p>Default write calendar</p>
            <p className="text-sm text-[var(--muted)]">{defaultWriteLabel}</p>
          </div>
        ) : null}
        <label className="flex items-center justify-between gap-3 text-[15px]">
          <span>
            Sample Atlas data
            {sampleOn && state.connections.google.status === "connected" ? (
              <span className="ml-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Sample</span>
            ) : null}
          </span>
          <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
            {sampleOn ? "On" : "Off"}
            <input
              type="checkbox"
              checked={sampleOn}
              aria-label="Show sample Atlas events"
              onChange={(event) =>
                updateProfile({
                  showSampleData: event.target.checked,
                  sampleDataExplicit: true,
                })
              }
            />
          </span>
        </label>
        <p className="text-sm text-[var(--muted)]">Show sample Atlas events</p>
      </section>

      <section className="mt-8 space-y-4">
        <p className="section-kicker">Connections</p>
        <Suspense fallback={<ConnectionRow name="Google Calendar" status="disconnected" />}>
          <GoogleCalendarSettings />
        </Suspense>
        <ConnectionRow name="iCloud Calendar" status={state.connections.icloud.status} />
        <ConnectionRow name="Telegram" status={state.connections.telegram.status} />
      </section>

      <section className="mt-10 space-y-4">
        <p className="section-kicker">Preferences</p>
        <label className="field">
          <span>Display name</span>
          <input
            value={profile.displayName}
            onChange={(event) => updateProfile({ displayName: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Timezone</span>
          <select
            value={profile.timezone}
            onChange={(event) => updateProfile({ timezone: event.target.value })}
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Morning brief time</span>
          <input
            type="time"
            value={profile.morningBriefTime}
            onChange={(event) => updateProfile({ morningBriefTime: event.target.value })}
          />
        </label>
        <HoursEditor
          label="Focus-work hours"
          hint="Deep work and find-time. Midnight means the end of the selected day."
          hours={resolveSchedulingHours(profile).focus}
          allowMidnight
          onChange={(patch) =>
            updateProfile({
              schedulingHours: withUpdatedHours(resolveSchedulingHours(profile), "focus", patch),
            })
          }
        />
        <label className="field">
          <span>Usual focus-block length (minutes)</span>
          <input
            type="number"
            min={15}
            step={15}
            value={resolveFocusBlockMinutes(profile).minutes}
            onChange={(event) => {
              const value = Number(event.target.value);
              updateProfile({
                schedulingHours: {
                  ...resolveSchedulingHours(profile),
                  focusBlockMinutes: Number.isFinite(value) && value >= 15 ? Math.round(value) : undefined,
                  focusBlockSource: "user",
                },
              });
            }}
          />
        </label>
        <HoursEditor
          label="Meeting hours"
          hint="Used when suggesting meetings. Not extended to midnight automatically."
          hours={resolveSchedulingHours(profile).meeting}
          onChange={(patch) =>
            updateProfile({
              schedulingHours: withUpdatedHours(resolveSchedulingHours(profile), "meeting", patch),
            })
          }
        />
        <HoursEditor
          label="Workout hours"
          hint="Used when suggesting training. Not extended to midnight automatically."
          hours={resolveSchedulingHours(profile).workout}
          onChange={(patch) =>
            updateProfile({
              schedulingHours: withUpdatedHours(resolveSchedulingHours(profile), "workout", patch),
            })
          }
        />
        <label className="field">
          <span>After workout</span>
          <input
            type="number"
            min={0}
            max={180}
            step={5}
            value={resolveAfterWorkoutBufferMinutes(profile)}
            onChange={(event) =>
              updateProfile({
                afterWorkoutBufferMinutes: clampAfterWorkoutBufferMinutes(Number(event.target.value)),
              })
            }
          />
        </label>
        <p className="text-sm text-[var(--muted)]">
          Default {DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES} minutes. Atlas reserves this time after a recognized
          workout so you can shower and get ready. It is planning time only — not a calendar event, and it does
          not change the workout.
        </p>
        <label className="field">
          <span>Default privacy</span>
          <select
            value={profile.privacyDefault}
            onChange={(event) => updateProfile({ privacyDefault: event.target.value as PrivacyLevel })}
          >
            <option value="private">private</option>
            <option value="busy-only">busy-only</option>
            <option value="shared">shared</option>
          </select>
        </label>
        <label className="field">
          <span>Training goal</span>
          <input
            value={profile.trainingPreferences.goal ?? ""}
            onChange={(event) =>
              updateProfile({
                trainingPreferences: {
                  ...profile.trainingPreferences,
                  goal: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="field">
          <span>Usual workout duration (minutes)</span>
          <input
            type="number"
            min={15}
            step={15}
            value={profile.trainingPreferences.schedule?.durationMinutes ?? ""}
            placeholder="Optional"
            onChange={(event) => {
              const value = Number(event.target.value);
              updateProfile({
                trainingPreferences: {
                  ...profile.trainingPreferences,
                  schedule: {
                    ...profile.trainingPreferences.schedule,
                    durationMinutes: Number.isFinite(value) && value >= 15 ? Math.round(value) : undefined,
                  },
                },
              });
            }}
          />
        </label>
        <label className="field">
          <span>Preferred workout time</span>
          <select
            value={profile.trainingPreferences.schedule?.part ?? ""}
            onChange={(event) =>
              updateProfile({
                trainingPreferences: {
                  ...profile.trainingPreferences,
                  schedule: {
                    ...profile.trainingPreferences.schedule,
                    part: (event.target.value || undefined) as "morning" | "afternoon" | "evening" | undefined,
                  },
                },
              })
            }
          >
            <option value="">No preference</option>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="evening">Evening</option>
          </select>
        </label>
        <div>
          <p className="mb-2 text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">Routines</p>
          <ul className="space-y-2 text-sm">
            {profile.routines.map((routine) => (
              <li key={routine.id}>
                {routine.time} · {routine.title}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <button type="button" className="btn-quiet mt-10" onClick={resetSampleData}>
        Restore sample day
      </button>
    </div>
  );
}
