"use client";

import { describeAddedWorkout } from "@/lib/calendar/workoutSchedule";
import { readClockNow } from "@/lib/time/clock";
import type { AssistantAction } from "@/lib/types/assistant";

function isCalendarCreate(action: AssistantAction): boolean {
  return action.payload?.type === "createEvent";
}

export function ActionCard({
  action,
  timezone,
  onApply,
  onDismiss,
  onView,
  onMove,
  applying,
}: {
  action: AssistantAction;
  timezone: string;
  onApply: () => void;
  onDismiss: () => void;
  onView?: (eventId: string) => void;
  onMove?: (eventId: string) => void;
  applying?: boolean;
}) {
  if (action.kind === "read") {
    return (
      <p className="mt-1.5 text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {action.label} · {action.summary}
      </p>
    );
  }

  const calendarCreate = isCalendarCreate(action);
  const heading =
    action.status === "dismissed"
      ? "Dismissed"
      : action.status === "applied"
        ? "Added"
        : calendarCreate
          ? action.label
          : "Proposed change";
  const added =
    calendarCreate && action.status === "applied" && action.payload?.type === "createEvent"
      ? describeAddedWorkout({
          title: action.payload.event.title,
          start: action.payload.event.start,
          end: action.payload.event.end,
          timezone,
          now: readClockNow(),
        })
      : undefined;
  const resultId =
    action.resultEventId ?? (action.payload?.type === "updateEvent" || action.payload?.type === "deleteEvent" ? action.payload.id : undefined);

  return (
    <div className="mt-3 border-l-2 border-[var(--accent)] pl-3">
      <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--accent)]">{heading}</p>
      {calendarCreate && action.status === "proposed" ? null : (
        <p className="mt-1 text-[15px]">{added ?? action.label}</p>
      )}
      {added ? null : <p className="text-sm text-[var(--muted)]">{action.summary}</p>}
      {action.destination?.label || action.destinationLabel ? (
        <p className="text-xs text-[var(--muted)]">
          Calendar: {action.destination?.label ?? action.destinationLabel}
        </p>
      ) : action.payload?.type === "createEvent" && action.destination?.provider === "google" ? (
        <p className="text-xs text-[var(--muted)]">Calendar: {action.destination.label}</p>
      ) : action.payload?.type === "createEvent" && action.payload.event.source === "google" ? (
        <p className="text-xs text-[var(--muted)]">
          Calendar: Google Calendar{action.payload.event.calendarId ? ` · ${action.payload.event.calendarId}` : ""}
        </p>
      ) : action.payload?.type === "createEvent" ? (
        <p className="text-xs text-[var(--muted)]">Calendar: Atlas · Local</p>
      ) : null}
      {action.error ? <p className="mt-1 text-sm text-[var(--muted)]">{action.error}</p> : null}
      {action.status === "proposed" ? (
        <div className="mt-3 mb-2 flex gap-2">
          <button type="button" className="btn-solid scroll-mb-[var(--atlas-bottom-inset)]" disabled={applying} onClick={onApply}>
            {applying ? (calendarCreate ? "Adding…" : "Applying…") : calendarCreate ? "Add to calendar" : "Apply"}
          </button>
          <button type="button" className="btn-quiet scroll-mb-[var(--atlas-bottom-inset)]" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      ) : action.status === "applied" && resultId && (onView || onMove) ? (
        <div className="mt-3 mb-2 flex gap-2">
          {onView ? (
            <button type="button" className="btn-quiet" onClick={() => onView(resultId)}>
              View
            </button>
          ) : null}
          {onMove && action.payload?.type !== "deleteEvent" ? (
            <button type="button" className="btn-quiet" onClick={() => onMove(resultId)}>
              Move
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
