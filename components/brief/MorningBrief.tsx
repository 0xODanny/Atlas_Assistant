"use client";

import { useState } from "react";
import { generateBrief } from "@/lib/brief/generateBrief";
import type { BriefEvent } from "@/lib/brief/model";
import { formatClock, formatFullDateUpper, formatHoursMinutes, formatRange } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { eventFill } from "@/lib/present/eventColor";
import type { EventColorOverrides } from "@/lib/types/profile";
import { actionLabelForCategory } from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";

export function MorningBriefView() {
  const { state, openSheet, refreshGoogle, googleSyncing } = useAppState();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const brief = generateBrief({
    now,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  });
  const glance = [
    `${brief.glance.eventCount} ${brief.glance.eventCount === 1 ? "event" : "events"}`,
    brief.glance.workoutCount
      ? `${brief.glance.workoutCount} ${brief.glance.workoutCount === 1 ? "workout" : "workouts"}`
      : null,
    `${formatHoursMinutes(brief.glance.openMinutes)} open`,
  ]
    .filter(Boolean)
    .join(" · ");

  async function refresh() {
    if (refreshing || googleSyncing) return;
    setRefreshing(true);
    try {
      await refreshGoogle(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <article className="page-column-brief brief-page">
      <header>
        <div className="brief-header-row">
          <p className="section-kicker">{formatFullDateUpper(brief.date, brief.timezone)}</p>
          <button type="button" className="btn-quiet brief-refresh" onClick={() => void refresh()} disabled={refreshing || googleSyncing}>
            Refresh
          </button>
        </div>
        <h1 className="display-title mt-2">Morning brief</h1>
        <p className="brief-updated">Updated {formatClock(brief.generatedAt, brief.timezone)}</p>
        <p className="body-copy mt-4">{brief.lead}</p>
        {brief.glance.eventCount || brief.openMinutes ? <p className="brief-glance mt-3">{glance}</p> : null}
      </header>

      {brief.nextEvent ? (
        <section className="brief-section">
          <h2 className="section-title">Next</h2>
          <p className="brief-next-title mt-2">{brief.nextEvent.title}</p>
          <p className="brief-meta">
            {brief.nextEvent.concurrentCount && brief.nextEvent.concurrentCount > 1
              ? brief.nextEvent.timeLabel.replace(/^Now:\s*/, "")
              : formatRange(brief.nextEvent.start, brief.nextEvent.end, brief.timezone)}
          </p>
        </section>
      ) : null}

      {brief.workouts.length ? (
        <section className="brief-section">
          <h2 className="section-title">Training</h2>
          <ul className="brief-list">
            {brief.workouts.map((event) => (
              <li key={event.eventId}>
                <BriefEventLine event={event} timezone={brief.timezone} overrides={state.profile.eventColorOverrides} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.allDayEvents.length ? (
        <section className="brief-section">
          <h2 className="section-title">All day</h2>
          <ul className="brief-list">
            {brief.allDayEvents.map((event) => (
              <li key={event.eventId} className={event.phase === "completed" ? "is-past" : undefined}>
                <span className="brief-event-title">{event.title}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.events.some((event) => !event.allDay) ? (
        <section className="brief-section">
          <h2 className="section-title">Your day</h2>
          <ul className="brief-list">
            {brief.events
              .filter((event) => !event.allDay)
              .map((event) => (
                <li key={event.eventId} className={event.phase === "completed" ? "is-past" : undefined}>
                  <BriefEventLine event={event} timezone={brief.timezone} overrides={state.profile.eventColorOverrides} />
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {brief.openBlocks.length ? (
        <section className="brief-section">
          <h2 className="section-title">Open time</h2>
          <ul className="brief-list">
            {brief.openBlocks.map((block) => (
              <li key={`${block.start}-${block.end}`}>
                <p className="brief-event-title">{formatRange(block.start, block.end, brief.timezone)}</p>
                <p className="brief-meta">{formatHoursMinutes(block.minutes)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.observations.length || brief.issues.length || brief.recommendations.length ? (
        <section className="brief-section">
          <h2 className="section-title">Atlas notes</h2>
          <ul className="brief-notes">
            {[...brief.issues, ...brief.recommendations, ...brief.observations].map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {brief.prepItems[0] ? (
        <button
          type="button"
          className="btn-quiet mt-5"
          onClick={() => openSheet({ name: "prepare", eventId: brief.prepItems[0]!.eventId })}
        >
          {actionLabelForCategory("meeting")}
        </button>
      ) : null}

      {brief.important.length ? (
        <section className="brief-section">
          <h2 className="section-title">Important</h2>
          <ul className="brief-notes">
            {brief.important.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function BriefEventLine({
  event,
  timezone,
  overrides,
}: {
  event: BriefEvent;
  timezone: string;
  overrides?: EventColorOverrides;
}) {
  return (
    <div className="brief-event">
      <span aria-hidden className="brief-mark" style={{ background: eventFill({ category: event.category, title: event.title }, overrides) }} />
      <div className="min-w-0">
        <p className="brief-event-title">{event.title}</p>
        <p className="brief-meta">{event.allDay ? "All day" : formatRange(event.start, event.end, timezone)}</p>
      </div>
    </div>
  );
}
