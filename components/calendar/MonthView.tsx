"use client";

import { compactMonthTitles, monthDayEvents, monthGridDays, sameZonedMonth } from "@/lib/calendar/monthOverview";
import { eventFill } from "@/lib/present/eventColor";
import { sameZonedDay, zonedParts } from "@/lib/time";
import type { CalendarEvent } from "@/lib/types/event";
import type { UserProfile } from "@/lib/types/profile";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function MonthView({
  date,
  events,
  profile,
  now,
  onSelectDay,
}: {
  date: Date;
  events: CalendarEvent[];
  profile: UserProfile;
  now: Date;
  onSelectDay: (date: Date) => void;
}) {
  const timezone = profile.timezone;
  const days = monthGridDays(date, timezone);

  return (
    <div data-atlas-month-view className="month-view">
      <div className="month-weekdays" aria-hidden>
        {WEEKDAYS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const parts = zonedParts(timezone, day);
          const inMonth = sameZonedMonth(day, date, timezone);
          const selected = sameZonedDay(day, date, timezone);
          const isToday = sameZonedDay(day, now, timezone);
          const dayEvents = monthDayEvents(events, day, timezone);
          const titles = compactMonthTitles(dayEvents);
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={[
                "month-cell",
                inMonth ? "" : "is-outside",
                selected ? "is-selected" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={selected}
              data-atlas-month-selected={selected ? "true" : "false"}
              onClick={() => onSelectDay(day)}
            >
              <span className="month-cell-day">{parts.day}</span>
              {dayEvents.length ? (
                <span className="month-cell-marks" aria-label={`${dayEvents.length} events`}>
                  {titles.map((event) => (
                    <span
                      key={event.id}
                      className="month-cell-title"
                      style={{ background: eventFill(event, profile.eventColorOverrides) }}
                    >
                      {event.title}
                    </span>
                  ))}
                  <span className="month-cell-dots">
                    {dayEvents.slice(0, 3).map((event) => (
                      <i
                        key={event.id}
                        className="month-cell-dot"
                        style={{ background: eventFill(event, profile.eventColorOverrides) }}
                      />
                    ))}
                    {dayEvents.length > 3 ? <span className="month-cell-more">+{dayEvents.length - 3}</span> : null}
                  </span>
                </span>
              ) : (
                <span className="month-cell-marks" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
