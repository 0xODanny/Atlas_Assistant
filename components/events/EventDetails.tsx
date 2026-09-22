"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { categoryLabel, eventDurationMinutes, formatAllDayLabel, formatAllDayRange, formatDuration, formatRange } from "@/lib/format";
import {
  atlasBack,
  eventDetailHref,
  eventPrepareHref,
  eventReturnPath,
  isEventPrepareParam,
} from "@/lib/navigation/back";
import { descriptionSegments } from "@/lib/present/description";
import { PreparePanel } from "../sheets/PrepareSheet";
import { participantSummary, presentWorkoutDetails } from "@/lib/present/event";
import {
  actionLabelForCategory,
  linkedMeeting,
  linkedWorkout,
  shouldOfferPrepareAction,
} from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";
import { useShellBack } from "../shell/ShellChrome";
import { CategoryMark } from "./CategoryMark";

export function EventDetails({ eventId }: { eventId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, openSheet, deleteEvent } = useAppState();
  const event = state.events.find((item) => item.id === eventId);
  const timezone = state.profile.timezone;
  const from = searchParams.get("from");
  const calendar = {
    view: searchParams.get("view"),
    date: searchParams.get("date"),
  };
  const preparing = isEventPrepareParam(searchParams.get("prepare"));
  const eventHref = eventDetailHref(eventId, from, calendar);
  const returnTo = eventReturnPath(from, calendar);
  const backTo = preparing ? eventHref : returnTo;
  const onBack = useCallback(() => {
    atlasBack(router, backTo);
  }, [backTo, router]);

  useShellBack({
    fallback: backTo,
    onBack,
  });

  if (!event) {
    return <p className="text-[var(--muted)]">This event is no longer on your calendar.</p>;
  }

  const workout = linkedWorkout(event, state.workouts);
  const meeting = linkedMeeting(event, state.meetings);
  const minutes = eventDurationMinutes(event.start, event.end);
  const showPrepare = shouldOfferPrepareAction({ event, workout, meeting });
  const details = workout ? presentWorkoutDetails({ event, workout, timezone }) : undefined;
  const people = participantSummary(event, state.profile.displayName);

  return (
    <article className="page-column event-detail">
      <div className="flex gap-3">
        <CategoryMark event={event} overrides={state.profile.eventColorOverrides} />
        <div className="min-w-0">
          <h1 className="display-title">{event.title}</h1>
          <p className="event-detail-lead text-sm text-[var(--muted)]">
            {event.allDay
              ? [formatAllDayLabel(event.start, event.end, timezone), formatAllDayRange(event.start, event.end, timezone)]
                  .filter((value, index, list) => list.indexOf(value) === index)
                  .join(" · ")
              : formatRange(event.start, event.end, timezone)}
          </p>
          {event.source === "google" ? (
            <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-[var(--atlas-muted)]">
              Google Calendar{event.calendarId ? ` · ${event.calendarId}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-[var(--atlas-muted)]">Atlas · Local</p>
          )}
          {event.demo ? (
            <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">Sample</p>
          ) : null}
          {event.category !== "training" && !event.allDay ? (
            <p className="mt-1 text-[var(--muted)]">
              {formatDuration(minutes)} · {categoryLabel(event.category)}
            </p>
          ) : null}
          {event.allDay && event.category !== "training" ? (
            <p className="mt-1 text-[var(--muted)]">{categoryLabel(event.category)}</p>
          ) : null}
        </div>
      </div>

      {preparing ? (
        <div className="event-detail-meta">
          <PreparePanel event={event} onScheduled={onBack} />
        </div>
      ) : null}

      {!preparing && event.category === "meeting" ? (
        <div className="event-detail-meta event-detail-copy space-y-2 text-[15px] leading-6">
          {event.location ? <p>{event.location}</p> : null}
          {people ? <p>With {people}</p> : null}
          {meeting?.agenda.length ? (
            <section>
              <p className="section-kicker">Agenda</p>
              <ul className="mt-1.5 space-y-1 text-sm leading-6">
                {meeting.agenda.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {event.preparationRequired ? (
            <p className="text-sm">Preparation recommended · {formatDuration(event.preparationMinutes)}</p>
          ) : null}
          {event.description ? <EventDescription text={event.description} /> : null}
        </div>
      ) : null}

      {!preparing && event.category === "training" && details ? (
        <div className="event-detail-meta event-detail-copy space-y-2 text-[15px] leading-6">
          <p>
            {details.duration} · {details.intensity}
          </p>
          {details.description ? <p>{details.description}</p> : null}
          {details.focus.length ? (
            <ul className="space-y-0.5">
              {details.focus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {details.weatherDependent || details.indoorAlternative ? (
            <div className="pt-1">
              {details.weatherDependent ? <p>Weather dependent</p> : null}
              {details.indoorAlternative ? <p>Indoor alternative: {details.indoorAlternative}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!preparing && event.category === "travel" ? (
        <div className="event-detail-meta event-detail-copy space-y-2 text-[15px] leading-6">
          {event.location ? <p>{event.location}</p> : null}
          {event.description ? <EventDescription text={event.description} /> : null}
        </div>
      ) : null}

      {!preparing && (event.category === "focus" || event.category === "work" || event.category === "personal") ? (
        <div className="event-detail-meta event-detail-copy space-y-2 text-[15px] leading-6">
          {event.location ? <p>{event.location}</p> : null}
          {event.description ? <EventDescription text={event.description} /> : null}
          {event.category === "work" && people ? <p>With {people}</p> : null}
        </div>
      ) : null}

      {preparing ? null : (
      <div className="event-actions" data-atlas-event-actions>
        {showPrepare ? (
          <button
            type="button"
            className="event-action is-primary"
            onClick={() => router.push(eventPrepareHref(event.id, from, calendar))}
          >
            <span className="event-action-label">{actionLabelForCategory(event.category)}</span>
          </button>
        ) : null}
        <button type="button" className="event-action is-secondary" onClick={() => openSheet({ name: "move", eventId: event.id })}>
          <span className="event-action-label">Move</span>
        </button>
        <button
          type="button"
          className="event-action is-secondary"
          onClick={() => openSheet({ name: "event", mode: "edit", eventId: event.id })}
        >
          <span className="event-action-label">Edit</span>
        </button>
        <button
          type="button"
          className="event-action is-danger"
          onClick={() => {
            void deleteEvent(event.id).then((result) => {
              if (result.ok) router.push(returnTo);
            });
          }}
        >
          <span className="event-action-label">Delete</span>
        </button>
      </div>
      )}
    </article>
  );
}

function EventDescription({ text }: { text: string }) {
  return (
    <p className="event-detail-copy text-[var(--muted)]">
      {descriptionSegments(text).map((part, index) =>
        part.type === "link" ? (
          <a key={`${part.value}-${index}`} href={part.value} className="underline underline-offset-2" target="_blank" rel="noreferrer">
            {part.value}
          </a>
        ) : (
          <span key={`${part.value}-${index}`}>{part.value}</span>
        ),
      )}
    </p>
  );
}
