"use client";

import { presentEventRow } from "@/lib/present/event";
import { linkedMeeting, linkedWorkout } from "@/lib/prepare/content";
import type { CalendarEvent } from "@/lib/types/event";
import type { Meeting } from "@/lib/types/meeting";
import type { UserProfile } from "@/lib/types/profile";
import type { Workout } from "@/lib/types/training";
import { dayEventsFor } from "@/lib/calendar/dayAgenda";
import { addDays, startOfZonedDay, zonedParts } from "@/lib/time";
import { CategoryMark } from "../events/CategoryMark";

type WeekViewProps = {
  date: Date;
  events: CalendarEvent[];
  workouts: Workout[];
  meetings: Meeting[];
  profile: UserProfile;
  onSelect: (id: string) => void;
};

function startOfWeek(date: Date, timezone: string): Date {
  const start = startOfZonedDay(timezone, date);
  const weekday = zonedParts(timezone, start).weekday;
  return addDays(start, -weekday);
}

export function WeekView({ date, events, workouts, meetings, profile, onSelect }: WeekViewProps) {
  const weekStart = startOfWeek(date, profile.timezone);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="md:overflow-x-auto">
      <div className="flex flex-col gap-6 md:grid md:min-w-[880px] md:grid-cols-7 md:gap-3">
        {days.map((day) => {
          const dayEvents = dayEventsFor(events, day, profile.timezone);
          const parts = zonedParts(profile.timezone, day);

          return (
            <section key={day.toISOString()} className="min-w-0">
              <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
                {day.toLocaleDateString("en-US", { weekday: "short", timeZone: profile.timezone })}
              </p>
              <p className="mt-1 text-xl">{parts.day}</p>
              <div className="mt-3 space-y-3">
                {dayEvents.map((event) => {
                  const row = presentEventRow({
                    event,
                    timezone: profile.timezone,
                    workout: linkedWorkout(event, workouts),
                    meeting: linkedMeeting(event, meetings),
                    selfName: profile.displayName,
                  });
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelect(event.id)}
                      className="flex w-full gap-2 text-left"
                    >
                      <CategoryMark category={event.category} />
                      <span className="min-w-0">
                        <span className="block text-[12px] text-[var(--muted)]">{row.time}</span>
                        <span className="block truncate text-sm">{row.title}</span>
                        <span className="block truncate text-[12px] text-[var(--muted)]">{row.meta}</span>
                      </span>
                    </button>
                  );
                })}
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">Open</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
