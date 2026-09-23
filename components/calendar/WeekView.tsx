"use client";

import { useEffect, useRef, useState } from "react";
import { dayEventsFor } from "@/lib/calendar/dayAgenda";
import {
  compactMoreLabel,
  compactOverflowCount,
  dayDetailsLabel,
  visibleCompactEvents,
  weekDays,
  weekdayName,
} from "@/lib/calendar/weekOverview";
import { formatClock } from "@/lib/format";
import { eventFill } from "@/lib/present/eventColor";
import { useNow } from "@/lib/hooks/useNow";
import { useAppState } from "@/lib/state/provider";
import { sameZonedDay, zonedParts } from "@/lib/time";
import type { CalendarEvent } from "@/lib/types/event";
import type { Meeting } from "@/lib/types/meeting";
import type { UserProfile } from "@/lib/types/profile";
import type { Workout } from "@/lib/types/training";
import { DayOverlay, InfoMark } from "./DayOverlay";

type WeekViewProps = {
  date: Date;
  events: CalendarEvent[];
  workouts?: Workout[];
  meetings?: Meeting[];
  profile: UserProfile;
  onSelect: (id: string, day: Date) => void;
  onSelectDay: (day: Date) => void;
  onAdd?: () => void;
};

export function WeekView({ date, events, profile, onSelect, onSelectDay, onAdd }: WeekViewProps) {
  const now = useNow();
  const { sheet } = useAppState();
  const days = weekDays(date, profile.timezone);
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const infoRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);

  const openKey = openDay ? startKey(openDay, profile.timezone) : null;
  const openEvents = openDay ? dayEventsFor(events, openDay, profile.timezone) : [];

  useEffect(() => {
    const scroller = scrollerRef.current;
    const selected = scroller?.querySelector<HTMLElement>('[data-atlas-week-selected="true"]');
    if (!scroller || !selected) return;
    const left = selected.offsetLeft - (scroller.clientWidth - selected.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [date]);

  function toggleDay(day: Date) {
    onSelectDay(day);
    setOpenDay((current) => (current && sameZonedDay(current, day, profile.timezone) ? null : day));
  }

  function openDayDetails(day: Date) {
    onSelectDay(day);
    setOpenDay(day);
  }

  function openEventOnDay(id: string, day: Date) {
    onSelect(id, day);
  }

  return (
    <div data-atlas-week-overview>
      <div
        ref={scrollerRef}
        className="hide-scrollbar snap-x snap-mandatory overflow-x-auto md:overflow-visible"
        data-atlas-week-scroller
      >
        <div className="flex min-w-0 gap-2 md:grid md:grid-cols-7 md:gap-2">
          {days.map((day) => {
            const key = startKey(day, profile.timezone);
            const dayEvents = dayEventsFor(events, day, profile.timezone);
            const visible = visibleCompactEvents(dayEvents);
            const overflow = compactOverflowCount(dayEvents);
            const selected = sameZonedDay(day, date, profile.timezone);
            const today = sameZonedDay(day, now, profile.timezone);
            const parts = zonedParts(profile.timezone, day);
            return (
              <section
                key={key}
                data-atlas-week-panel
                data-atlas-week-selected={selected ? "true" : "false"}
                className={[
                  "week-panel w-[43%] shrink-0 snap-start md:w-auto",
                  selected ? "is-selected" : "",
                  today ? "is-today" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-1">
                  <button
                    ref={(node) => {
                      infoRefs.current[key] = node;
                    }}
                    type="button"
                    className="week-info"
                    aria-label={dayDetailsLabel(day, profile.timezone)}
                    aria-expanded={openKey === key}
                    data-atlas-week-info
                    onClick={() => toggleDay(day)}
                  >
                    <InfoMark />
                  </button>
                  <div className="min-w-0 pt-1 text-right">
                    <p className="week-weekday">
                      {weekdayName(day, profile.timezone)}
                    </p>
                    <p className={selected ? "date-selected ml-auto mt-1 text-[14px] font-medium" : "mt-1 text-[17px] font-medium"}>
                      {parts.day}
                    </p>
                  </div>
                </div>
                <div className="mt-3 min-h-0 space-y-1.5">
                  {dayEvents.length === 0 ? null : (
                    visible.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        data-atlas-week-event={event.id}
                        data-atlas-event-source={event.source}
                        className="week-event"
                        style={{ background: eventFill(event, profile.eventColorOverrides) }}
                        onClick={() => openEventOnDay(event.id, day)}
                      >
                        <span className="week-event-time">
                          {event.allDay ? "All day" : formatClock(event.start, profile.timezone)}
                        </span>
                        <span className="min-w-0 w-full truncate">{event.title}</span>
                      </button>
                    ))
                  )}
                  {overflow > 0 ? (
                    <button
                      type="button"
                      className="week-more"
                      data-atlas-week-more
                      onClick={() => openDayDetails(day)}
                    >
                      {compactMoreLabel(overflow)}
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {openDay ? (
        <DayOverlay
          date={openDay}
          events={openEvents}
          timezone={profile.timezone}
          covered={Boolean(sheet)}
          onClose={() => setOpenDay(null)}
          onSelect={(id) => (openDay ? openEventOnDay(id, openDay) : undefined)}
          onAdd={onAdd}
          returnFocus={infoRefs.current[openKey ?? ""] ?? null}
          colorOverrides={profile.eventColorOverrides}
        />
      ) : null}
    </div>
  );
}

function startKey(date: Date, timezone: string): string {
  const parts = zonedParts(timezone, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
