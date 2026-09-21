"use client";

import { useRouter } from "next/navigation";
import { categoryLabel, eventDurationMinutes, formatAllDayLabel, formatAllDayRange, formatDuration, formatRange } from "@/lib/format";
import { descriptionSegments } from "@/lib/present/description";
import { participantSummary, presentWorkoutDetails } from "@/lib/present/event";
import {
  actionLabelForCategory,
  linkedMeeting,
  linkedWorkout,
  shouldOfferPrepareAction,
} from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";
import { CategoryMark } from "./CategoryMark";

export function EventDetails({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { state, openSheet, deleteEvent } = useAppState();
  const event = state.events.find((item) => item.id === eventId);
  const timezone = state.profile.timezone;

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
    <article className="page-column">
      <div className="flex gap-3">
        <CategoryMark event={event} overrides={state.profile.eventColorOverrides} />
        <div>
          <h1 className="display-title">{event.title}</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
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

      {event.category === "meeting" ? (
        <div className="mt-5 space-y-3 text-[15px] leading-6">
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

      {event.category === "training" && details ? (
        <div className="mt-5 space-y-2 text-[15px] leading-6">
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

      {event.category === "travel" ? (
        <div className="mt-5 space-y-2 text-[15px] leading-6">
          {event.location ? <p>{event.location}</p> : null}
          {event.description ? <EventDescription text={event.description} /> : null}
        </div>
      ) : null}

      {event.category === "focus" || event.category === "work" || event.category === "personal" ? (
        <div className="mt-5 space-y-2 text-[15px] leading-6">
          {event.location ? <p>{event.location}</p> : null}
          {event.description ? <EventDescription text={event.description} /> : null}
          {event.category === "work" && people ? <p>With {people}</p> : null}
        </div>
      ) : null}

      <div className="mt-8 flex scroll-mb-[var(--atlas-bottom-inset)] flex-col items-start gap-1">
        {showPrepare ? (
          <button type="button" className="btn-quiet" onClick={() => openSheet({ name: "prepare", eventId: event.id })}>
            {actionLabelForCategory(event.category)}
          </button>
        ) : null}
        <button type="button" className="btn-quiet" onClick={() => openSheet({ name: "move", eventId: event.id })}>
          Move
        </button>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => openSheet({ name: "event", mode: "edit", eventId: event.id })}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            void deleteEvent(event.id).then((result) => {
              if (result.ok) router.push("/calendar");
            });
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function EventDescription({ text }: { text: string }) {
  return (
    <p className="text-[var(--muted)]">
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
