"use client";

import { useEffect, useState } from "react";
import { formatDayHeading } from "@/lib/format";
import { useAppState } from "@/lib/state/provider";
import { addDays } from "@/lib/time";
import { readClockNow } from "@/lib/time/clock";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";

export function CalendarView() {
  const { state, openSheet, refreshGoogle } = useAppState();
  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);
  const [view, setView] = useState<"day" | "week">("day");
  const [cursor, setCursor] = useState(() => readClockNow());

  return (
    <div>
      <p className="section-kicker">Calendar</p>
      <h1 className="display-title mt-1.5">{formatDayHeading(cursor.toISOString(), state.profile.timezone)}</h1>

      <div className="control-bar mt-3">
        <div className="control-group" role="group" aria-label="Navigate">
          <button type="button" className="btn-quiet min-h-10 px-3" onClick={() => setCursor(addDays(cursor, view === "week" ? -7 : -1))}>
            Prev
          </button>
          <button type="button" className="btn-quiet min-h-10 px-3" onClick={() => setCursor(readClockNow())}>
            Today
          </button>
          <button type="button" className="btn-quiet min-h-10 px-3" onClick={() => setCursor(addDays(cursor, view === "week" ? 7 : 1))}>
            Next
          </button>
        </div>
        <div className="control-group" role="group" aria-label="View">
          <button type="button" className={view === "day" ? "btn-solid min-h-10 px-3" : "btn-quiet min-h-10 px-3"} onClick={() => setView("day")}>
            Day
          </button>
          <button type="button" className={view === "week" ? "btn-solid min-h-10 px-3" : "btn-quiet min-h-10 px-3"} onClick={() => setView("week")}>
            Week
          </button>
        </div>
        <div className="control-group" role="group" aria-label="Actions">
          <button type="button" className="btn-solid min-h-10 px-3" onClick={() => openSheet({ name: "event", mode: "create" })}>
            + Add
          </button>
        </div>
      </div>

      <div className="mt-5">
        {view === "day" ? (
          <DayView
            date={cursor}
            events={state.events}
            workouts={state.workouts}
            meetings={state.meetings}
            profile={state.profile}
            onPrepare={(id) => openSheet({ name: "prepare", eventId: id })}
            onMove={(id) => openSheet({ name: "move", eventId: id })}
          />
        ) : (
          <WeekView
            date={cursor}
            events={state.events}
            workouts={state.workouts}
            meetings={state.meetings}
            profile={state.profile}
            onSelect={(id) => openSheet({ name: "event", mode: "edit", eventId: id })}
          />
        )}
      </div>
    </div>
  );
}
