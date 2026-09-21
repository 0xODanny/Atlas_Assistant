"use client";

import { sameZonedDay, startOfZonedDay, zonedParts } from "@/lib/time";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DateStrip({
  days,
  selected,
  timezone,
  now,
  onSelect,
}: {
  days: Date[];
  selected: Date;
  timezone: string;
  now: Date;
  onSelect: (date: Date) => void;
}) {
  return (
    <div className="hide-scrollbar flex gap-1 overflow-x-auto" role="tablist" aria-label="Dates">
      {days.map((day) => {
        const parts = zonedParts(timezone, day);
        const selectedDay = sameZonedDay(day, selected, timezone);
        const isToday = sameZonedDay(day, now, timezone);
        return (
          <button
            key={day.toISOString()}
            type="button"
            role="tab"
            aria-selected={selectedDay}
            aria-current={isToday ? "date" : undefined}
            data-atlas-date-selected={selectedDay ? "true" : "false"}
            className={[
              "flex min-h-11 min-w-9 flex-col items-center justify-center px-1 text-[11px] sm:min-h-14 sm:min-w-11",
              selectedDay ? "text-[var(--atlas-plum)]" : "text-[var(--atlas-muted)]",
            ].join(" ")}
            onClick={() => onSelect(startOfZonedDay(timezone, day))}
          >
            <span>{WEEKDAYS[parts.weekday]}</span>
            <span className={selectedDay ? "date-selected mt-1 text-[14px] font-medium" : "mt-1 flex h-8 w-8 items-center justify-center text-[16px] font-medium"}>
              {parts.day}
            </span>
          </button>
        );
      })}
    </div>
  );
}
