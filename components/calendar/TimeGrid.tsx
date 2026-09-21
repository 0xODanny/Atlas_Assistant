"use client";

import { hoursInRange, HOUR_HEIGHT_PX, layoutTimedEvents, nowLineOffset, visibleHourRange } from "@/lib/calendar/dayLayout";
import { splitAllDay } from "@/lib/calendar/dayEvents";
import { formatClock } from "@/lib/format";
import { eventFill } from "@/lib/present/eventColor";
import { sameZonedDay } from "@/lib/time";
import type { CalendarEvent } from "@/lib/types/event";

export function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export function HourRail({
  startHour,
  endHour,
}: {
  startHour: number;
  endHour: number;
}) {
  const hours = hoursInRange(startHour, endHour);
  return (
    <div className="relative w-11 shrink-0" style={{ height: hours.length * HOUR_HEIGHT_PX }}>
      {hours.map((hour, index) => (
        <div
          key={hour}
          className="absolute inset-x-0"
          style={{ top: index * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
        >
          <span className="block pt-0.5 text-[10px] font-medium text-[var(--atlas-meta)]">{hourLabel(hour)}</span>
        </div>
      ))}
    </div>
  );
}

export function TimeGrid({
  date,
  events,
  timezone,
  now,
  onSelect,
  compact,
  showLabels = true,
  hourRange,
  reserveAllDay,
}: {
  date: Date;
  events: CalendarEvent[];
  timezone: string;
  now: Date;
  onSelect: (id: string) => void;
  compact?: boolean;
  showLabels?: boolean;
  hourRange?: { startHour: number; endHour: number };
  reserveAllDay?: boolean;
}) {
  const { allDay, timed } = splitAllDay(events);
  const range =
    hourRange ??
    visibleHourRange(timed, timezone, date, sameZonedDay(now, date, timezone) ? now : undefined);
  const hours = hoursInRange(range.startHour, range.endHour);
  const blocks = layoutTimedEvents(timed, timezone, date, range.startHour, range.endHour);
  const nowTop = sameZonedDay(now, date, timezone)
    ? nowLineOffset(now, timezone, date, range.startHour, range.endHour)
    : null;

  return (
    <div>
      {allDay.length || reserveAllDay ? (
        <div className="mb-2 min-h-8 border-b border-[var(--atlas-line)] pb-1">
          {allDay.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event.id)}
              className="flex min-h-9 w-full items-center justify-between gap-3 py-0.5 text-left"
            >
              <span className="truncate text-[14px]">{event.title}</span>
              {showLabels ? (
                <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-[var(--atlas-meta)]">All day</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="relative" style={{ height: hours.length * HOUR_HEIGHT_PX }}>
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute inset-x-0 flex border-t border-[var(--atlas-line)]"
            style={{ top: index * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
          >
            {showLabels ? (
              <span className="w-11 shrink-0 pt-0.5 text-[10px] font-medium text-[var(--atlas-meta)]">
                {hourLabel(hour)}
              </span>
            ) : null}
          </div>
        ))}
        {nowTop !== null ? <div className={`calendar-now${showLabels ? "" : " is-flush"}`} style={{ top: nowTop }} /> : null}
        {blocks.map((block) => (
          <button
            key={block.event.id}
            type="button"
            onClick={() => onSelect(block.event.id)}
            className="absolute overflow-hidden rounded-[4px] px-1.5 py-1 text-left"
            style={{
              top: block.top + 1,
              height: Math.max(22, block.height - 2),
              ...blockStyle(block.column, block.columns, showLabels),
              background: eventFill(block.event),
            }}
          >
            <span className={`block truncate ${compact ? "text-[11px]" : "text-[13px]"} font-medium leading-tight`}>
              {block.event.title}
            </span>
            {block.height > 28 ? (
              <span className="mt-0.5 block truncate text-[11px] text-[var(--atlas-meta)]">
                {formatClock(block.event.start, timezone)}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function blockStyle(column: number, columns: number, showLabels: boolean): { left: string; width: string } {
  const gutter = showLabels ? 2.75 : 0.15;
  const width = `calc((100% - ${gutter}rem) / ${columns} - 0.2rem)`;
  const left = `calc(${gutter}rem + ((100% - ${gutter}rem) / ${columns}) * ${column})`;
  return { left, width };
}
