"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { formatMinutesShort, formatRange } from "@/lib/format";
import { eventDetailHref, eventFromPath } from "@/lib/navigation/back";
import { presentEventRow } from "@/lib/present/event";
import { isUpcomingMeeting } from "@/lib/calendar/meetings";
import { actionLabelForCategory, shouldOfferPrepareAction } from "@/lib/prepare/content";
import type { CalendarEvent } from "@/lib/types/event";
import type { Meeting } from "@/lib/types/meeting";
import type { Workout } from "@/lib/types/training";
import { CategoryMark } from "./CategoryMark";

type EventRowProps = {
  event: CalendarEvent;
  timezone: string;
  workout?: Workout;
  meeting?: Meeting;
  selfName?: string;
  onPrepare?: () => void;
  onMove?: () => void;
  now?: Date;
};

export function EventRow({
  event,
  timezone,
  workout,
  meeting,
  selfName,
  onPrepare,
  onMove,
  now,
}: EventRowProps) {
  const from = eventFromPath(usePathname());
  const searchParams = useSearchParams();
  const eventHref = eventDetailHref(event.id, from, {
    view: searchParams.get("view"),
    date: searchParams.get("date"),
  });
  const meetingEligible = event.category !== "meeting" || !now || isUpcomingMeeting(event, now);
  const showPrepare = onPrepare && meetingEligible && shouldOfferPrepareAction({ event, workout, meeting });
  const row = presentEventRow({ event, timezone, workout, meeting, selfName });
  const time = event.allDay ? row.time : formatRange(event.start, event.end, timezone);
  const summary = [row.meta, event.location && !/^https?:\/\//i.test(event.location) ? event.location : undefined]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" · ");

  return (
    <article className="flex gap-3 border-b border-[var(--atlas-line)] py-3.5">
      <CategoryMark event={event} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] tracking-wide text-[var(--atlas-meta)]">{time}</p>
        <h3 className="mt-0.5 text-[16px] font-medium tracking-tight">
          <Link href={eventHref} className="hover:text-[var(--atlas-plum)]">
            {row.title}
          </Link>
        </h3>
        {summary ? <p className="mt-0.5 text-[13px] leading-5 text-[var(--atlas-muted)]">{summary}</p> : null}
        {showPrepare || onMove ? (
          <div className="mt-1 flex flex-wrap gap-4">
            {showPrepare ? (
              <button type="button" className="btn-quiet min-h-10 text-[13px]" onClick={onPrepare}>
                {actionLabelForCategory(event.category)}
              </button>
            ) : null}
            {onMove ? (
              <button type="button" className="btn-quiet min-h-10 text-[13px]" onClick={onMove}>
                Move
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {event.allDay ? null : (
        <p className="shrink-0 text-[12px] text-[var(--atlas-muted)]">{formatMinutesShort(
          Math.max(0, Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000)),
        )}</p>
      )}
    </article>
  );
}
