"use client";

import Link from "next/link";
import { findFreeTime, suggestFocusWindow } from "@/lib/calendar/freeTime";
import { resolveScheduleHours } from "@/lib/calendar/hours";
import { planningFreeTimeOptions } from "@/lib/calendar/transitionBuffer";
import { formatFullDateUpper, formatRange, greetingEditorial, remainingOpenLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useVisualEvents } from "@/lib/hooks/useVisualMode";
import { nextActiveEvent } from "@/lib/present/status";
import { eventJoinAction, eventPlaceLabel } from "@/lib/present/link";
import { useAppState } from "@/lib/state/provider";
import { calendarReadStatus, dayEventsFor } from "@/lib/calendar/dayAgenda";
import { dayTimelineItems, todaySubtitle } from "@/lib/calendar/timeline";
import { addDays, startOfZonedDay } from "@/lib/time";
import { availabilitySearchStart } from "@/lib/time/clock";
import { useEffect } from "react";
import type { CalendarEvent } from "@/lib/types/event";
import { eventDetailHref } from "@/lib/navigation/back";
import { EmptyState, InlineStatus } from "../ui/EmptyState";
import { TodayComposer } from "./TodayComposer";
import { TodayTimeline } from "./TodayTimeline";

export function TodayView() {
  const { ready, state, openSheet, refreshGoogle, googleSyncing } = useAppState();
  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);
  const { profile, tasks } = state;
  const now = useNow();
  const events = useVisualEvents(state.events, now, profile.timezone);
  const dayStart = startOfZonedDay(profile.timezone, now);
  const dayEnd = addDays(dayStart, 1);
  const todays = dayEventsFor(events, now, profile.timezone);
  const readStatus = calendarReadStatus({
    ready,
    syncing: googleSyncing,
    google: state.connections.google,
    dayEventCount: todays.length,
  });
  const next = nextActiveEvent(todays, now);
  const windows = findFreeTime({
    start: availabilitySearchStart(now, profile.timezone),
    end: dayEnd,
    durationMinutes: 30,
    events: todays,
    timezone: profile.timezone,
    workingHours: resolveScheduleHours(profile, "focus"),
    useWorkingHours: true,
    ...planningFreeTimeOptions(profile, state.workouts),
  });
  const focus = suggestFocusWindow(windows, profile.timezone, now);
  const important = tasks.filter((task) => task.important && !task.completed);
  const timeline = dayTimelineItems(todays);
  const openLabel = focus ? remainingOpenLabel(focus.start, focus.end, profile.timezone) : "";
  const subtitle = todaySubtitle({
    status: readStatus,
    events: todays,
    timezone: profile.timezone,
  });

  return (
    <div className={`page-column today-stack${todays.length === 0 ? " is-empty" : ""}`}>
      <p className="section-kicker">{formatFullDateUpper(now.toISOString(), profile.timezone)}</p>
      <h1 className="display-title mt-3" data-atlas-greeting>
        {greetingEditorial(now.toISOString(), profile.timezone, profile.displayName)}
      </h1>
      <p className="body-copy mt-3 max-w-md">{subtitle}</p>
      <Link href="/brief" className="brief-row mt-6">
        <span>Morning brief</span>
        <span className="starter-arrow" aria-hidden>→</span>
      </Link>

      {next ? <UpNext event={next} timezone={profile.timezone} /> : null}

      <section className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Your day</h2>
          <button
            type="button"
            className="add-round"
            aria-label="Add event"
            onClick={() => openSheet({ name: "event", mode: "create" })}
          >
            +
          </button>
        </div>
        {readStatus === "loading" && todays.length === 0 ? <EmptyState>Loading calendar…</EmptyState> : null}
        {readStatus === "unavailable" ? <EmptyState>Could not read your calendar.</EmptyState> : null}
        {readStatus === "ready" && todays.length === 0 ? (
          <div className="empty-card" data-atlas-empty-day>
            <h3 className="section-title">Your day is open</h3>
            <p className="body-copy mt-2">No events scheduled yet.</p>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/assistant?prompt=Plan%20my%20day" className="btn-solid">
                Plan my day
              </Link>
              <button type="button" className="btn-quiet" onClick={() => openSheet({ name: "event", mode: "create" })}>
                Add event
              </button>
            </div>
          </div>
        ) : null}
        {todays.length > 0 ? (
          <TodayTimeline items={timeline} timezone={profile.timezone} colorOverrides={profile.eventColorOverrides} />
        ) : null}
      </section>

      {focus && todays.length > 0 ? (
        <section className="mt-8">
          <p className="section-kicker">Open time</p>
          <p className="mt-2 text-[16px]">{openLabel}</p>
          {openLabel === "Rest of day open" ? null : (
            <InlineStatus>Longest stretch still free.</InlineStatus>
          )}
        </section>
      ) : null}

      {important.length ? (
        <section className="mt-8">
          <p className="section-kicker">Important</p>
          <ul className="mt-2 space-y-1">
            {important.map((task) => (
              <li key={task.id} className="text-[16px] leading-6">
                {task.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TodayComposer />
    </div>
  );
}

function UpNext({
  event,
  timezone,
}: {
  event: CalendarEvent;
  timezone: string;
}) {
  const join = eventJoinAction(event);
  const place = eventPlaceLabel(event);
  const when = event.allDay ? "All day" : formatRange(event.start, event.end, timezone);
  const meta = [when, place].filter(Boolean).join(" · ");

  return (
    <section className={`up-next mt-7${join ? " has-join" : ""}`} data-atlas-up-next>
      <Link href={eventDetailHref(event.id, "today")} className="up-next-card">
        <p className="text-[12px] uppercase tracking-[0.18em] text-white/70">Up next</p>
        <h2 className="section-title mt-3 text-[var(--atlas-surface)]">{event.title}</h2>
        <p className="mt-3 text-[14px] text-white/80">{meta}</p>
      </Link>
      {join ? (
        <a
          href={join.href}
          target="_blank"
          rel="noreferrer"
          className="up-next-join"
          onClick={(eventClick) => eventClick.stopPropagation()}
        >
          {join.label} →
        </a>
      ) : null}
    </section>
  );
}
