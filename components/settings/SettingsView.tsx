"use client";

import { Suspense, useEffect, useState } from "react";
import {
  DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES,
  clampAfterWorkoutBufferMinutes,
  resolveAfterWorkoutBufferMinutes,
} from "@/lib/calendar/transitionBuffer";
import { resolveFocusBlockMinutes, resolveSchedulingHours, withUpdatedHours } from "@/lib/calendar/hours";
import { HoursEditor } from "./HoursEditor";
import { EventColorLegend } from "./EventColorLegend";
import { APP_DISPLAY_NAME } from "@/lib/config";
import { sampleDataEnabled } from "@/lib/data/sample";
import { useAppState } from "@/lib/state/provider";
import type { PrivacyLevel } from "@/lib/types/event";
import { SettingRow } from "../ui/SettingRow";
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
  const { state, updateProfile, resetSampleData } = useAppState();
  const profile = state.profile;
  const sampleOn = sampleDataEnabled(profile, state.connections);
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
    <div className="page-column overflow-x-hidden">
      <p className="section-kicker">You</p>
      <h1 className="display-title mt-2" data-atlas-greeting>
        {profile.displayName}
      </h1>
      <p className="body-copy mt-3 max-w-md">
        {APP_DISPLAY_NAME} stays on this device. Calendar changes only happen after you apply them.
      </p>
      <a href="/brief" className="btn-quiet mt-1">
        Morning brief
      </a>

      <section className="settings-section">
        <h2 className="settings-heading">Calendar</h2>
        <Suspense fallback={<ConnectionRow name="Google Calendar" status="disconnected" />}>
          <GoogleCalendarSettings />
        </Suspense>
        <ConnectionRow name="iCloud Calendar" status={state.connections.icloud.status} />
        <SettingRow
          label="Sample Atlas data"
          control={
            <span className="flex items-center gap-2 text-[14px] text-[var(--atlas-muted)]">
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
          }
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Scheduling</h2>
        <SettingRow
          label="Timezone"
          control={
            <select value={profile.timezone} onChange={(event) => updateProfile({ timezone: event.target.value })}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          }
        />
        <SettingRow
          label="Morning brief"
          control={
            <input
              type="time"
              value={profile.morningBriefTime}
              aria-label="Morning brief time"
              onChange={(event) => updateProfile({ morningBriefTime: event.target.value })}
            />
          }
        />
        <HoursEditor
          label="Focus-work hours"
          hint="Deep work and end-time. Midnight means the end of the selected day."
          hours={resolveSchedulingHours(profile).focus}
          allowMidnight
          onChange={(patch) =>
            updateProfile({
              schedulingHours: withUpdatedHours(resolveSchedulingHours(profile), "focus", patch),
            })
          }
        />
        <SettingRow
          label="Focus block"
          control={
            <input
              type="number"
              min={15}
              step={15}
              value={resolveFocusBlockMinutes(profile).minutes}
              aria-label="Usual focus-block length in minutes"
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
          }
        />
        <HoursEditor
          label="Meeting hours"
          hint="Used when suggesting meetings."
          hours={resolveSchedulingHours(profile).meeting}
          onChange={(patch) =>
            updateProfile({
              schedulingHours: withUpdatedHours(resolveSchedulingHours(profile), "meeting", patch),
            })
          }
        />
        <SettingRow
          label="Default privacy"
          control={
            <select
              value={profile.privacyDefault}
              onChange={(event) => updateProfile({ privacyDefault: event.target.value as PrivacyLevel })}
            >
              <option value="private">private</option>
              <option value="busy-only">busy-only</option>
              <option value="shared">shared</option>
            </select>
          }
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Training</h2>
        <p className="setting-note">Fitness stays off unless you set a preference.</p>
        <HoursEditor
          label="Workout hours"
          hint="Used when suggesting training."
          hours={resolveSchedulingHours(profile).workout}
          onChange={(patch) =>
            updateProfile({
              schedulingHours: withUpdatedHours(resolveSchedulingHours(profile), "workout", patch),
            })
          }
        />
        <SettingRow
          label="After workout"
          control={
            <input
              type="number"
              min={0}
              max={180}
              step={5}
              value={resolveAfterWorkoutBufferMinutes(profile)}
              aria-label="After workout buffer in minutes"
              onChange={(event) =>
                updateProfile({
                  afterWorkoutBufferMinutes: clampAfterWorkoutBufferMinutes(Number(event.target.value)),
                })
              }
            />
          }
        />
        <p className="setting-note">
          Default {DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES} min after a recognized workout. Planning only — not a calendar
          event.
        </p>
        <SettingRow
          label="Training goal"
          control={
            <input
              value={profile.trainingPreferences.goal ?? ""}
              aria-label="Training goal"
              onChange={(event) =>
                updateProfile({
                  trainingPreferences: {
                    ...profile.trainingPreferences,
                    goal: event.target.value,
                  },
                })
              }
            />
          }
        />
        <SettingRow
          label="Usual workout"
          control={
            <input
              type="number"
              min={15}
              step={15}
              value={profile.trainingPreferences.schedule?.durationMinutes ?? ""}
              placeholder="min"
              aria-label="Usual workout duration in minutes"
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
          }
        />
        <SettingRow
          label="Preferred time"
          control={
            <select
              value={profile.trainingPreferences.schedule?.part ?? ""}
              aria-label="Preferred workout time"
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
          }
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Appearance</h2>
        <p className="setting-row-label">Event colors</p>
        <EventColorLegend
          overrides={profile.eventColorOverrides}
          onChange={(eventColorOverrides) => updateProfile({ eventColorOverrides })}
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Account & integrations</h2>
        <SettingRow
          label="Display name"
          control={
            <input
              value={profile.displayName}
              aria-label="Display name"
              onChange={(event) => updateProfile({ displayName: event.target.value })}
            />
          }
        />
        <ConnectionRow
          name="OpenAI"
          status={openaiStatus === "connected" ? "connected" : "disconnected"}
          connectedLabel="Connected"
          disconnectedLabel="Not configured"
        />
        <ConnectionRow name="Telegram" status={state.connections.telegram.status} />
        <div className="pt-2">
          <p className="setting-row-label">Routines</p>
          <ul className="mt-1 space-y-1 text-[14px] text-[var(--atlas-muted)]">
            {profile.routines.map((routine) => (
              <li key={routine.id}>
                {routine.time} · {routine.title}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <button type="button" className="btn-quiet mt-8" onClick={resetSampleData}>
        Restore sample day
      </button>
    </div>
  );
}
