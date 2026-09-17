"use client";

import { findFreeTime, suggestFocusWindow, totalOpenMinutes } from "@/lib/calendar/freeTime";
import { resolveScheduleHours } from "@/lib/calendar/hours";
import { planningFreeTimeOptions } from "@/lib/calendar/transitionBuffer";
import {
  formatCompactHours,
  formatDayHeading,
  formatRange,
  greetingForNow,
} from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { isUpcomingMeeting } from "@/lib/calendar/meetings";
import { nextUpcomingEvent, presentNextStatus } from "@/lib/present/status";
import { linkedMeeting, linkedWorkout } from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";
import {
  calendarReadStatus,
  dayEventsFor,
  groupDayEvents,
  todayCountLabel,
} from "@/lib/calendar/dayAgenda";
import { addDays, startOfZonedDay } from "@/lib/time";
import { availabilitySearchStart } from "@/lib/time/clock";
import { useEffect } from "react";
import type { CalendarEvent } from "@/lib/types/event";
import type { Meeting } from "@/lib/types/meeting";
import type { UserProfile } from "@/lib/types/profile";
import type { Workout } from "@/lib/types/training";
import { EventRow } from "../events/EventRow";

export function TodayView() {
  const { ready, state, openSheet, refreshGoogle, googleSyncing } = useAppState();
  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);
  const { profile, events, tasks, workouts, meetings } = state;
  const now = useNow();
  const dayStart = startOfZonedDay(profile.timezone, now);
  const dayEnd = addDays(dayStart, 1);
  const todays = dayEventsFor(events, now, profile.timezone);
  const groups = groupDayEvents(todays, now);
  const readStatus = calendarReadStatus({
    ready,
    syncing: googleSyncing,
    google: state.connections.google,
    dayEventCount: todays.length,
  });
  const next = nextUpcomingEvent(todays, now);
  const windows = findFreeTime({
    start: availabilitySearchStart(now, profile.timezone),
    end: dayEnd,
    durationMinutes: 30,
    events: todays,
    timezone: profile.timezone,
    workingHours: resolveScheduleHours(profile, "focus"),
    useWorkingHours: true,
    ...planningFreeTimeOptions(profile, workouts),
  });
  const focus = suggestFocusWindow(windows, profile.timezone, now);
  const important = tasks.filter((task) => task.important && !task.completed);
  const prepCount = todays.filter((event) => {
    if (!event.preparationRequired || event.preparationMinutes <= 0) return false;
    if (event.category === "meeting") return isUpcomingMeeting(event, now);
    return event.category === "work";
  }).length;
  const nextStatus = next
    ? presentNextStatus({
        event: next,
        now,
        timezone: profile.timezone,
        workout: linkedWorkout(next, workouts),
        meeting: linkedMeeting(next, meetings),
        selfName: profile.displayName,
      })
    : undefined;

  return (
    <div className="mx-auto max-w-xl md:max-w-3xl">
      <p className="text-sm text-[var(--muted)]">{formatDayHeading(now.toISOString(), profile.timezone)}</p>
      <h1 className="display-title mt-1.5">{greetingForNow(now.toISOString(), profile.timezone, profile.displayName)}</h1>
      <p className="mt-2 text-[14px] leading-6 text-[var(--muted)]">
        {todayCountLabel(todays.length, readStatus)}
        {readStatus === "ready" ? (
          <>
            <span aria-hidden className="px-2">
              ·
            </span>
            {formatCompactHours(totalOpenMinutes(windows))} open
            <span aria-hidden className="px-2">
              ·
            </span>
            {prepCount} {prepCount === 1 ? "preparation item" : "preparation items"}
            <span aria-hidden className="px-2">
              ·
            </span>
            {important.length} important {important.length === 1 ? "task" : "tasks"}
          </>
        ) : null}
      </p>

      {nextStatus ? (
        <section className="mt-5">
          <p className="section-kicker">Next</p>
          <p className="mt-1 text-[20px] font-medium tracking-tight">{nextStatus.title}</p>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">{nextStatus.lead}</p>
          {nextStatus.summary ? <p className="mt-0.5 text-[13px] text-[var(--muted)]">{nextStatus.summary}</p> : null}
        </section>
      ) : null}

      <section className="mt-6">
        <div className="flex items-center gap-3">
          <p className="section-kicker">Today</p>
          <button type="button" className="btn-quiet min-h-10 px-3 md:min-h-9" onClick={() => openSheet({ name: "event", mode: "create" })}>
            + Add
          </button>
        </div>
        {readStatus === "loading" && todays.length === 0 ? (
          <p className="mt-4 text-[var(--muted)]">Loading calendar…</p>
        ) : null}
        {readStatus === "unavailable" ? (
          <p className="mt-4 text-[var(--muted)]">Could not read your calendar.</p>
        ) : null}
        {readStatus === "ready" && todays.length === 0 ? (
          <p className="mt-4 text-[var(--muted)]">Nothing scheduled today.</p>
        ) : null}
        {groups.allDay.length ? (
          <AgendaGroup
            label="All day"
            events={groups.allDay}
            now={now}
            profile={profile}
            workouts={workouts}
            meetings={meetings}
            onPrepare={(id) => openSheet({ name: "prepare", eventId: id })}
            onMove={(id) => openSheet({ name: "move", eventId: id })}
          />
        ) : null}
        {groups.now.length ? (
          <AgendaGroup
            label="Now"
            events={groups.now}
            now={now}
            profile={profile}
            workouts={workouts}
            meetings={meetings}
            onPrepare={(id) => openSheet({ name: "prepare", eventId: id })}
            onMove={(id) => openSheet({ name: "move", eventId: id })}
          />
        ) : null}
        {groups.upcoming.length ? (
          <AgendaGroup
            label="Upcoming"
            events={groups.upcoming}
            now={now}
            profile={profile}
            workouts={workouts}
            meetings={meetings}
            onPrepare={(id) => openSheet({ name: "prepare", eventId: id })}
            onMove={(id) => openSheet({ name: "move", eventId: id })}
          />
        ) : null}
        {groups.completed.length ? (
          <AgendaGroup
            label="Completed"
            events={groups.completed}
            now={now}
            profile={profile}
            workouts={workouts}
            meetings={meetings}
            onPrepare={(id) => openSheet({ name: "prepare", eventId: id })}
            onMove={(id) => openSheet({ name: "move", eventId: id })}
          />
        ) : null}
      </section>

      {focus || important.length ? (
        <div className="scan-grid mt-6">
          {focus ? (
            <section>
              <p className="section-kicker">Suggested focus</p>
              <p className="mt-1.5 text-[16px]">{formatRange(focus.start, focus.end, profile.timezone)}</p>
              <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                Best uninterrupted window · {formatCompactHours(focus.minutes)}
              </p>
            </section>
          ) : null}
          {important.length ? (
            <section>
              <p className="section-kicker">Important tasks</p>
              <ul className="mt-1.5 space-y-1">
                {important.map((task) => (
                  <li key={task.id} className="text-[14px] leading-6">
                    {task.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AgendaGroup({
  label,
  events,
  now,
  profile,
  workouts,
  meetings,
  onPrepare,
  onMove,
}: {
  label: string;
  events: CalendarEvent[];
  now: Date;
  profile: UserProfile;
  workouts: Workout[];
  meetings: Meeting[];
  onPrepare: (id: string) => void;
  onMove: (id: string) => void;
}) {
  return (
    <div className="mt-2">
      <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <div className="divide-y divide-[var(--line)]">
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            timezone={profile.timezone}
            workout={linkedWorkout(event, workouts)}
            meeting={linkedMeeting(event, meetings)}
            selfName={profile.displayName}
            now={now}
            onPrepare={() => onPrepare(event.id)}
            onMove={() => onMove(event.id)}
          />
        ))}
      </div>
    </div>
  );
}
