"use client";

import { formatClock, formatDuration } from "@/lib/format";
import { buildPreparation, linkedMeeting, linkedWorkout } from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";
import { addMinutes } from "@/lib/time";
import { Sheet } from "./Sheet";

export function PrepareSheet() {
  const { state, sheet, closeSheet, createEvent } = useAppState();
  const event = sheet?.name === "prepare" ? state.events.find((item) => item.id === sheet.eventId) : undefined;
  const timezone = state.profile.timezone;

  if (!event || sheet?.name !== "prepare") return null;

  const workout = linkedWorkout(event, state.workouts);
  const meeting = linkedMeeting(event, state.meetings);
  const prep = buildPreparation({ event, workout, meeting });
  const prepStart = addMinutes(new Date(event.start), -Math.max(prep.prepMinutes, 0));

  return (
    <Sheet title={prep.sheetTitle} onClose={closeSheet}>
      <p className="text-sm text-[var(--muted)]">
        {prep.eyebrow} · {formatClock(event.start, timezone)}
      </p>
      {prep.headline ? <p className="mt-3 text-[17px] leading-relaxed">{prep.headline}</p> : null}

      <div className="mt-5 space-y-6">
        {prep.sections.map((section) => (
          <section key={section.heading}>
            <p className="section-kicker">{section.heading}</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {prep.schedulePrep ? (
        <button
          type="button"
          className="btn-solid mt-6"
          onClick={() => {
            createEvent({
              title: `Prep: ${event.title}`,
              description: prep.sections.flatMap((section) => section.items).join(" · "),
              start: prepStart.toISOString(),
              end: event.start,
              category: "focus",
              privacy: "private",
            });
            closeSheet();
          }}
        >
          Schedule {formatDuration(prep.prepMinutes)} preparation
        </button>
      ) : null}
    </Sheet>
  );
}
