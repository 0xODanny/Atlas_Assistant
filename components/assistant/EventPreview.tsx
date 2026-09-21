"use client";

import { applyActionLabel, destinationCaption } from "@/lib/assistant/applyLabel";
import { eventDurationMinutes, formatDuration, formatRange, formatRelativeDayDate } from "@/lib/format";
import { eventFill } from "@/lib/present/eventColor";
import type { AssistantAction } from "@/lib/types/assistant";
import type { EventColorOverrides } from "@/lib/types/profile";

export function EventPreview({
  action,
  timezone,
  now,
  applying,
  onApply,
  onDismiss,
  onView,
  onMove,
  colorOverrides,
}: {
  action: AssistantAction;
  timezone: string;
  now: Date;
  applying?: boolean;
  onApply: () => void;
  onDismiss: () => void;
  onView?: (eventId: string) => void;
  onMove?: (eventId: string) => void;
  colorOverrides?: EventColorOverrides;
}) {
  const times =
    action.payload?.type === "createEvent"
      ? {
          start: action.payload.event.start,
          end: action.payload.event.end,
          title: action.payload.event.title,
          category: action.payload.event.category,
        }
      : action.payload?.type === "updateEvent" && action.payload.patch.start && action.payload.patch.end
        ? {
            start: action.payload.patch.start,
            end: action.payload.patch.end,
            title: action.payload.patch.title ?? action.label,
            category: action.payload.patch.category,
          }
        : undefined;
  const destination = destinationCaption(action);
  const resultId =
    action.resultEventId ??
    (action.payload?.type === "updateEvent" || action.payload?.type === "deleteEvent" ? action.payload.id : undefined);
  const accent = eventFill(
    times
      ? { title: times.title, category: times.category }
      : { title: action.label },
    colorOverrides,
  );

  return (
    <section className="event-preview" data-atlas-event-preview>
      <span aria-hidden className="event-preview-accent" style={{ background: accent }} />
      <div className="min-w-0 flex-1">
        {times && action.status === "proposed" ? (
          <div>
            <p className="section-title text-[1.65rem]">{times.title}</p>
            <p className="mt-2 text-[16px]">{formatRelativeDayDate(times.start, timezone, now)}</p>
            <p className="text-[14px] text-[var(--atlas-muted)]">{formatRange(times.start, times.end, timezone)}</p>
            <p className="text-[14px] text-[var(--atlas-muted)]">{formatDuration(eventDurationMinutes(times.start, times.end))}</p>
          </div>
        ) : (
          <div>
            <p className="section-kicker">
              {action.status === "applied" ? "Added" : action.status === "dismissed" ? "Dismissed" : action.label}
            </p>
            <p className="mt-1 text-[14px] leading-5">{action.summary}</p>
          </div>
        )}
        {destination ? (
          <p className="mt-1.5 text-[13px] text-[var(--atlas-muted)]" data-atlas-destination>
            {destination}
          </p>
        ) : null}
        {action.error ? <p className="mt-1.5 text-[14px] text-[#8a2a2a]">{action.error}</p> : null}

        {action.status === "proposed" ? (
          <div className="mt-5 flex flex-col items-stretch gap-2">
            <button type="button" className="btn-solid w-full scroll-mb-[var(--atlas-bottom-inset)]" disabled={applying} onClick={onApply}>
              {applyActionLabel(action, applying)}
            </button>
            <button type="button" className="btn-quiet scroll-mb-[var(--atlas-bottom-inset)]" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        ) : action.status === "applied" && resultId && (onView || onMove) ? (
          <div className="mt-4 flex gap-5">
            {onView ? (
              <button type="button" className="btn-quiet" onClick={() => onView(resultId)}>
                View event
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
    </section>
  );
}
