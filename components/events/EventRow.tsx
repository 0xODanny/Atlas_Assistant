"use client";

import Link from "next/link";
import { formatScheduledEventWhen } from "@/lib/format";
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
  const meetingEligible = event.category !== "meeting" || !now || isUpcomingMeeting(event, now);
  const showPrepare = onPrepare && meetingEligible && shouldOfferPrepareAction({ event, workout, meeting });
  const row = presentEventRow({ event, timezone, workout, meeting, selfName });
  const time = now ? formatScheduledEventWhen(event, timezone, now) : row.time;
  const summary = [row.meta, row.detail].filter(Boolean).join(" · ");

  return (
    <article className="flex gap-3 py-2.5">
      <CategoryMark category={event.category} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-[var(--muted)]">{time}</p>
          <h3 className="text-[16px] font-medium tracking-tight">{row.title}</h3>
          {summary ? <p className="mt-0.5 text-[13px] leading-5 text-[var(--muted)]">{summary}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5 md:shrink-0 md:justify-end">
          {showPrepare ? (
            <button type="button" className="btn-quiet" onClick={onPrepare}>
              {actionLabelForCategory(event.category)}
            </button>
          ) : null}
          {onMove ? (
            <button type="button" className="btn-quiet" onClick={onMove}>
              Move
            </button>
          ) : null}
          <Link href={`/events/${encodeURIComponent(event.id)}`} className="btn-quiet">
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}
