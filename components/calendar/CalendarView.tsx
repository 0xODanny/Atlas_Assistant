"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  calendarCursorFromDateParam,
  calendarHref,
  calendarLocationMemory,
  calendarRestoreHref,
  eventDetailHref,
  formatCalendarDateParam,
  readCalendarLocation,
  rememberCalendarLocation,
  stampCalendarHistory,
  type CalendarViewMode,
} from "@/lib/navigation/back";
import { formatWeekRange } from "@/lib/calendar/weekOverview";
import { formatMonth, formatYear } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useVisualEvents } from "@/lib/hooks/useVisualMode";
import { useAppState } from "@/lib/state/provider";
import { addDays, addMonths, sameZonedDay, startOfZonedDay, zonedParts } from "@/lib/time";
import { DateStrip } from "./DateStrip";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

function startOfWeek(date: Date, timezone: string): Date {
  const start = startOfZonedDay(timezone, date);
  return addDays(start, -zonedParts(timezone, start).weekday);
}

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, openSheet, refreshGoogle } = useAppState();
  const now = useNow();
  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);
  const timezone = state.profile.timezone;
  const browserSearch =
    typeof window !== "undefined" && window.location.pathname === "/calendar"
      ? new URLSearchParams(window.location.search)
      : null;
  const memory = typeof window !== "undefined" ? calendarLocationMemory() : null;
  const resolved = readCalendarLocation(
    { view: searchParams.get("view"), date: searchParams.get("date") },
    browserSearch ? { view: browserSearch.get("view"), date: browserSearch.get("date") } : null,
    memory,
  );
  const view: CalendarViewMode = resolved.view;
  const cursor =
    (resolved.date ? calendarCursorFromDateParam(resolved.date, timezone) : null) ??
    startOfZonedDay(timezone, now);
  const events = useVisualEvents(state.events, now, timezone);
  const stripStart = startOfWeek(cursor, timezone);
  const stripDays = Array.from({ length: 7 }, (_, index) => addDays(stripStart, index));
  const location = {
    view,
    date: formatCalendarDateParam(cursor, timezone),
  };

  useEffect(() => {
    if (resolved.date) rememberCalendarLocation({ view, date: resolved.date });
    const current = `${window.location.pathname}${window.location.search}`;
    const restore = calendarRestoreHref(current, calendarLocationMemory());
    if (restore && restore !== current) {
      router.replace(restore, { scroll: false });
    }
  }, [resolved.date, view, router]);

  function openEvent(id: string) {
    rememberCalendarLocation(location);
    stampCalendarHistory(location);
    router.push(eventDetailHref(id, "calendar", location));
  }

  function setView(next: CalendarViewMode) {
    const href = calendarHref({ view: next, date: location.date });
    rememberCalendarLocation({ view: next, date: location.date });
    router.replace(href, { scroll: false });
  }

  function setCursor(next: Date, nextView: CalendarViewMode = view) {
    const date = formatCalendarDateParam(next, timezone);
    rememberCalendarLocation({ view: nextView, date });
    router.replace(calendarHref({ view: nextView, date }), { scroll: false });
  }

  function stepCursor(direction: -1 | 1) {
    if (view === "month") {
      setCursor(addMonths(cursor, direction, timezone));
      return;
    }
    setCursor(addDays(cursor, direction * 7));
  }

  return (
    <div className="page-column-calendar relative">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="display-title-cal whitespace-nowrap" data-atlas-month>
            {formatMonth(cursor.toISOString(), timezone)}
          </h1>
          <p className="year-label">{formatYear(cursor.toISOString(), timezone)}</p>
        </div>
        <div className="flex items-center gap-1 pt-1" role="group" aria-label="View">
          <button type="button" className="day-chip" aria-pressed={view === "day"} onClick={() => setView("day")}>
            Day
          </button>
          <button type="button" className="day-chip" aria-pressed={view === "week"} onClick={() => setView("week")}>
            Week
          </button>
          <button type="button" className="day-chip" aria-pressed={view === "month"} onClick={() => setView("month")}>
            Month
          </button>
          {sameZonedDay(cursor, now, timezone) ? null : (
            <button type="button" className="day-chip" onClick={() => setCursor(now)}>
              Today
            </button>
          )}
          <button
            type="button"
            aria-label="Add event"
            className="ml-2 hidden h-12 w-12 items-center justify-center rounded-full bg-[var(--atlas-plum)] text-[1.5rem] leading-none text-[var(--atlas-surface)] md:inline-flex"
            onClick={() => openSheet({ name: "event", mode: "create" })}
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          className="calendar-step"
          aria-label={view === "month" ? "Previous month" : "Previous week"}
          onClick={() => stepCursor(-1)}
        >
          ‹
        </button>
        {view === "day" ? (
          <div className="min-w-0 flex-1">
            <DateStrip
              days={stripDays}
              selected={cursor}
              timezone={timezone}
              now={now}
              onSelect={setCursor}
            />
          </div>
        ) : (
          <p className="week-range" data-atlas-week-range>
            {view === "month" ? formatMonth(cursor.toISOString(), timezone) : formatWeekRange(cursor, timezone)}
          </p>
        )}
        <button
          type="button"
          className="calendar-step"
          aria-label={view === "month" ? "Next month" : "Next week"}
          onClick={() => stepCursor(1)}
        >
          ›
        </button>
      </div>

      <div className="mt-4">
        {view === "day" ? (
          <DayView
            date={cursor}
            events={events}
            workouts={state.workouts}
            meetings={state.meetings}
            profile={state.profile}
            onPrepare={(id) => openSheet({ name: "prepare", eventId: id })}
            onMove={(id) => openSheet({ name: "move", eventId: id })}
            onSelect={openEvent}
          />
        ) : null}
        {view === "week" ? (
          <WeekView
            date={cursor}
            events={events}
            workouts={state.workouts}
            meetings={state.meetings}
            profile={state.profile}
            onSelect={openEvent}
            onAdd={() => openSheet({ name: "event", mode: "create" })}
          />
        ) : null}
        {view === "month" ? (
          <MonthView
            date={cursor}
            events={events}
            profile={state.profile}
            now={now}
            onSelectDay={(next) => setCursor(next, "day")}
          />
        ) : null}
      </div>

      <button type="button" aria-label="Add event" className="add-fab md:hidden" onClick={() => openSheet({ name: "event", mode: "create" })}>
        +
      </button>
    </div>
  );
}
