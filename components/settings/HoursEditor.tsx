"use client";

import { formatHourClock, isMidnightEnd } from "@/lib/calendar/hours";
import type { ScheduleHours } from "@/lib/types/profile";

const DAY_CHIPS = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 0, label: "Sun" },
];

export function HoursEditor({
  label,
  hint,
  hours,
  allowMidnight,
  onChange,
}: {
  label: string;
  hint?: string;
  hours: ScheduleHours;
  allowMidnight?: boolean;
  onChange: (patch: Partial<ScheduleHours>) => void;
}) {
  const midnight = isMidnightEnd(hours.end);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[15px]">{label}</p>
        {hint ? <p className="text-sm text-[var(--muted)]">{hint}</p> : null}
        <p className="text-xs text-[var(--muted)]">
          {hours.source === "user" ? "Saved preference" : "Initial default"} · {formatHourClock(hours.start)}–
          {formatHourClock(hours.end)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span>Start</span>
          <input
            type="time"
            value={hours.start}
            onChange={(event) => onChange({ start: event.target.value })}
          />
        </label>
        <label className="field">
          <span>End</span>
          <input
            type="time"
            value={midnight ? "00:00" : hours.end}
            disabled={midnight}
            onChange={(event) => onChange({ end: event.target.value === "00:00" ? "24:00" : event.target.value })}
          />
        </label>
      </div>
      {allowMidnight ? (
        <label className="flex items-center justify-between gap-3 text-[15px]">
          <span>Until midnight</span>
          <input
            type="checkbox"
            checked={midnight}
            aria-label={`${label} until midnight`}
            onChange={(event) => onChange({ end: event.target.checked ? "24:00" : "18:00" })}
          />
        </label>
      ) : null}
      {midnight ? (
        <p className="text-sm text-[var(--muted)]">Midnight is the end of the selected day, not the beginning.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {DAY_CHIPS.map((day) => {
          const selected = hours.days.includes(day.id);
          return (
            <button
              key={day.id}
              type="button"
              className={selected ? "btn-solid" : "btn-quiet"}
              aria-pressed={selected}
              onClick={() => {
                const days = selected ? hours.days.filter((item) => item !== day.id) : [...hours.days, day.id];
                onChange({ days: days.length ? days : hours.days });
              }}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
