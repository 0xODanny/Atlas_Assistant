"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  calendarCanonicalHref,
  calendarCursorFromDateParam,
  calendarHref,
  eventDetailHref,
  formatCalendarDateParam,
  rememberCalendarLocation,
  resolveCalendarLocation,
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

function clientSnapshot(): boolean {
  return true;
}

function serverSnapshot(): boolean {
  return false;
}

function subscribeNever(): () => void {
  return () => undefined;
}

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, openSheet, refreshGoogle } = useAppState();
  const now = useNow();
  const client = useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
  const timezone = state.profile.timezone;
  const todayDate = formatCalendarDateParam(now, timezone);
  const hook = { view: searchParams.get("view"), date: searchParams.get("date") };
  const browser =
    client && window.location.pathname === "/calendar"
      ? { view: new URLSearchParams(window.location.search).get("view"), date: new URLSearchParams(window.location.search).get("date") }
      : null;
  const resolved = resolveCalendarLocation({
    hook,
    browser,
    today: client ? todayDate : null,
  });
  const view: CalendarViewMode = resolved.view;
  const cursor = resolved.date ? calendarCursorFromDateParam(resolved.date, timezone) : null;
  const events = useVisualEvents(state.events, now, timezone);

  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);

  useLayoutEffect(() => {
    if (!resolved.date) return;
    const location = { view, date: resolved.date };
    rememberCalendarLocation(location);
    if (window.location.pathname !== "/calendar") return;
    const current = `${window.location.pathname}${window.location.search}`;
    const canonical = calendarCanonicalHref(current, location);
    if (canonical) {
      router.replace(canonical, { scroll: false });
    }
  }, [resolved.date, view, router]);

  if (!cursor || !resolved.date) {
    return <p className="text-[var(--atlas-muted)]">Loading calendar…</p>;
  }

  const selected = cursor;
  const selectedDate = resolved.date;
  const stripStart = startOfWeek(selected, timezone);
  const stripDays = Array.from({ length: 7 }, (_, index) => addDays(stripStart, index));
  const location = { view, date: selectedDate };

  function openEvent(id: string, day?: Date) {
    const nextLocation = day
      ? { view, date: formatCalendarDateParam(day, timezone) }
      : location;
    rememberCalendarLocation(nextLocation);
    stampCalendarHistory(nextLocation);
    router.push(eventDetailHref(id, "calendar", nextLocation));
  }

  function setView(next: CalendarViewMode) {
    const nextLocation = { view: next, date: location.date };
    rememberCalendarLocation(nextLocation);
    router.replace(calendarHref(nextLocation), { scroll: false });
  }

  function setCursor(next: Date, nextView: CalendarViewMode = view) {
    const date = formatCalendarDateParam(next, timezone);
    const nextLocation = { view: nextView, date };
    rememberCalendarLocation(nextLocation);
    router.replace(calendarHref(nextLocation), { scroll: false });
  }

  function stepCursor(direction: -1 | 1) {
    if (view === "month") {
      setCursor(addMonths(selected, direction, timezone));
      return;
    }
    setCursor(addDays(selected, direction * 7));
  }

  return (
    <div className="page-column-calendar relative">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="display-title-cal whitespace-nowrap" data-atlas-month>
            {formatMonth(selected.toISOString(), timezone)}
          </h1>
          <p className="year-label">{formatYear(selected.toISOString(), timezone)}</p>
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
          {sameZonedDay(selected, now, timezone) ? null : (
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
              selected={selected}
              timezone={timezone}
              now={now}
              onSelect={setCursor}
            />
          </div>
        ) : (
          <p className="week-range" data-atlas-week-range>
            {view === "month" ? formatMonth(selected.toISOString(), timezone) : formatWeekRange(selected, timezone)}
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
            date={selected}
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
            date={selected}
            events={events}
            workouts={state.workouts}
            meetings={state.meetings}
            profile={state.profile}
            onSelect={openEvent}
            onSelectDay={(next) => setCursor(next, "week")}
            onAdd={() => openSheet({ name: "event", mode: "create" })}
          />
        ) : null}
        {view === "month" ? (
          <MonthView
            date={selected}
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
