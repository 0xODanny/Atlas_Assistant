"use client";

import { useEffect, useState } from "react";
import { formatWeekRange } from "@/lib/calendar/weekOverview";
import { formatMonth, formatYear } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useVisualEvents } from "@/lib/hooks/useVisualMode";
import { useAppState } from "@/lib/state/provider";
import { addDays, sameZonedDay, startOfZonedDay, zonedParts } from "@/lib/time";
import { readClockNow } from "@/lib/time/clock";
import { DateStrip } from "./DateStrip";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";

function startOfWeek(date: Date, timezone: string): Date {
  const start = startOfZonedDay(timezone, date);
  return addDays(start, -zonedParts(timezone, start).weekday);
}

export function CalendarView() {
  const { state, openSheet, refreshGoogle } = useAppState();
  const now = useNow();
  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);
  const [view, setView] = useState<"day" | "week">("week");
  const [cursor, setCursor] = useState(() => readClockNow());
  const timezone = state.profile.timezone;
  const events = useVisualEvents(state.events, now, timezone);
  const stripStart = startOfWeek(cursor, timezone);
  const stripDays = Array.from({ length: 7 }, (_, index) => addDays(stripStart, index));

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
          {sameZonedDay(cursor, now, timezone) ? null : (
            <button type="button" className="day-chip" onClick={() => setCursor(readClockNow())}>
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
          className="btn-quiet min-w-11 text-[1.35rem]"
          aria-label="Previous week"
          onClick={() => setCursor(addDays(cursor, -7))}
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
            {formatWeekRange(cursor, timezone)}
          </p>
        )}
        <button
          type="button"
          className="btn-quiet min-w-11 text-[1.35rem]"
          aria-label="Next week"
          onClick={() => setCursor(addDays(cursor, 7))}
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
            onSelect={(id) => openSheet({ name: "event", mode: "edit", eventId: id })}
          />
        ) : (
          <WeekView
            date={cursor}
            events={events}
            workouts={state.workouts}
            meetings={state.meetings}
            profile={state.profile}
            onSelect={(id) => openSheet({ name: "event", mode: "edit", eventId: id })}
            onAdd={() => openSheet({ name: "event", mode: "create" })}
          />
        )}
      </div>

      <button type="button" aria-label="Add event" className="add-fab md:hidden" onClick={() => openSheet({ name: "event", mode: "create" })}>
        +
      </button>
    </div>
  );
}
