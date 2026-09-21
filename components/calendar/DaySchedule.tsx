import { dayTimelineItems } from "@/lib/calendar/timeline";
import { eventDurationMinutes, formatClock, formatDuration, formatFreeSpan, formatRange } from "@/lib/format";
import { eventFill } from "@/lib/present/eventColor";
import { eventJoinAction, eventPlaceLabel } from "@/lib/present/link";
import type { CalendarEvent } from "@/lib/types/event";
import type { EventColorOverrides } from "@/lib/types/profile";

export function DaySchedule({
  events,
  timezone,
  onSelect,
  colorOverrides,
}: {
  events: CalendarEvent[];
  timezone: string;
  onSelect: (id: string) => void;
  colorOverrides?: EventColorOverrides;
}) {
  const items = dayTimelineItems(events);
  if (events.length === 0) {
    return <p className="py-3 text-[15px] text-[var(--atlas-muted)]">Open</p>;
  }

  return (
    <ol className="timeline" data-atlas-day-schedule>
      {items.map((item) =>
        item.kind === "gap" ? (
          <li key={item.id} className="timeline-row">
            <span />
            <span aria-hidden className="timeline-dot is-gap" />
            <p className="text-[16px] text-[var(--atlas-muted)]">{formatFreeSpan(item.minutes)}</p>
          </li>
        ) : (
          <li key={item.event.id} className="timeline-row">
            <time className="pt-0.5 text-[13px] leading-5 text-[var(--atlas-meta)]">
              {item.event.allDay ? "All day" : formatClock(item.event.start, timezone)}
            </time>
            <span aria-hidden className="timeline-dot is-event" style={{ background: eventFill(item.event, colorOverrides) }} />
            <ExpandedEvent event={item.event} timezone={timezone} onSelect={onSelect} />
          </li>
        ),
      )}
    </ol>
  );
}

function ExpandedEvent({
  event,
  timezone,
  onSelect,
}: {
  event: CalendarEvent;
  timezone: string;
  onSelect: (id: string) => void;
}) {
  const place = eventPlaceLabel(event);
  const join = eventJoinAction(event);
  const when = event.allDay ? "All day" : formatRange(event.start, event.end, timezone);
  const duration = event.allDay ? undefined : formatDuration(eventDurationMinutes(event.start, event.end));
  const source =
    event.source === "google"
      ? event.calendarId
        ? `Google Calendar · ${event.calendarId}`
        : "Google Calendar"
      : "Atlas · Local";

  return (
    <div className="min-w-0">
      <button type="button" className="block w-full text-left" onClick={() => onSelect(event.id)}>
        <span className="block text-[17px] font-medium leading-6">{event.title}</span>
        <span className="mt-0.5 block text-[14px] text-[var(--atlas-muted)]">{when}</span>
        {duration ? <span className="block text-[14px] text-[var(--atlas-muted)]">{duration}</span> : null}
        {place ? <span className="block text-[14px] text-[var(--atlas-muted)]">{place}</span> : null}
        <span className="block text-[12px] text-[var(--atlas-meta)]" data-atlas-event-source={event.source}>
          {source}
        </span>
      </button>
      {join ? (
        <a href={join.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-10 items-center text-[13px] text-[var(--atlas-plum)]">
          {join.label} →
        </a>
      ) : null}
    </div>
  );
}
