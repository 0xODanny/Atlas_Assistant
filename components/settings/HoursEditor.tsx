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
    <div className="hours-editor">
      <p className="setting-row-label">{label}</p>
      {hint ? <p className="setting-note">{hint}</p> : null}
      <div className="hours-editor-times">
        <label className="field">
          <input
            type="time"
            value={hours.start}
            aria-label={`${label} start`}
            onChange={(event) => onChange({ start: event.target.value })}
          />
          <span>Start</span>
        </label>
        <label className="field">
          <input
            type="time"
            value={midnight ? "00:00" : hours.end}
            disabled={midnight}
            aria-label={`${label} end`}
            onChange={(event) => onChange({ end: event.target.value === "00:00" ? "24:00" : event.target.value })}
          />
          <span>End {midnight ? "· midnight" : ""}</span>
        </label>
      </div>
      {allowMidnight ? (
        <label className="setting-row">
          <span className="setting-row-label">Until midnight</span>
          <span className="setting-row-control">
            <input
              type="checkbox"
              checked={midnight}
              aria-label={`${label} until midnight`}
              onChange={(event) => onChange({ end: event.target.checked ? "24:00" : "18:00" })}
            />
          </span>
        </label>
      ) : null}
      <div className="settings-days" role="group" aria-label={`${label} days`}>
        {DAY_CHIPS.map((day) => {
          const selected = hours.days.includes(day.id);
          return (
            <button
              key={day.id}
              type="button"
              className="day-chip"
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
      <p className="setting-note">
        {hours.source === "user" ? "Saved preference" : "Initial default"} · {formatHourClock(hours.start)}–
        {formatHourClock(hours.end)}
      </p>
    </div>
  );
}
