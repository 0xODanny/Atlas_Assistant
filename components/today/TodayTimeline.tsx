import Link from "next/link";
import { formatClock, formatFreeSpan, formatRange } from "@/lib/format";
import { eventPlaceLabel } from "@/lib/present/link";
import { eventFill } from "@/lib/present/eventColor";
import type { TimelineItem } from "@/lib/calendar/timeline";
import type { CalendarEvent } from "@/lib/types/event";
import type { EventColorOverrides } from "@/lib/types/profile";

export function TodayTimeline({
  items,
  timezone,
  colorOverrides,
}: {
  items: TimelineItem[];
  timezone: string;
  colorOverrides?: EventColorOverrides;
}) {
  return (
    <ol className="timeline mt-1">
      {items.map((item) =>
        item.kind === "gap" ? (
          <li key={item.id} className="timeline-row">
            <span className="pt-0.5 text-[12px] text-[var(--atlas-meta)]" />
            <span aria-hidden className="timeline-dot is-gap" />
            <div>
              <p className="text-[16px] text-[var(--atlas-muted)]">{formatFreeSpan(item.minutes)}</p>
              <p className="mt-0.5 text-[14px] text-[var(--atlas-meta)]">{formatRange(item.start, item.end, timezone)}</p>
            </div>
          </li>
        ) : (
          <TimelineEvent key={item.event.id} event={item.event} timezone={timezone} colorOverrides={colorOverrides} />
        ),
      )}
    </ol>
  );
}

function TimelineEvent({
  event,
  timezone,
  colorOverrides,
}: {
  event: CalendarEvent;
  timezone: string;
  colorOverrides?: EventColorOverrides;
}) {
  const place = eventPlaceLabel(event);
  const when = event.allDay ? "All day" : formatRange(event.start, event.end, timezone);
  const meta = [when, place].filter(Boolean).join(" · ");
  return (
    <li className="timeline-row">
      <time className="pt-0.5 text-[13px] leading-5 text-[var(--atlas-meta)]">
        {event.allDay ? "All day" : formatClock(event.start, timezone)}
      </time>
      <span aria-hidden className="timeline-dot is-event" style={{ background: eventFill(event, colorOverrides) }} />
      <div className="min-w-0">
        <h3 className="text-[17px] font-medium leading-6 tracking-tight">
          <Link href={`/events/${encodeURIComponent(event.id)}`} className="hover:text-[var(--atlas-plum)]">
            {event.title}
          </Link>
        </h3>
        {meta ? <p className="mt-0.5 text-[14px] leading-5 text-[var(--atlas-muted)]">{meta}</p> : null}
      </div>
    </li>
  );
}
