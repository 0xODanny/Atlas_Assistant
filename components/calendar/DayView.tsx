"use client";

import { findFreeTime } from "@/lib/calendar/freeTime";
import { planningFreeTimeOptions } from "@/lib/calendar/transitionBuffer";
import { formatClock, formatDuration } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { linkedMeeting, linkedWorkout } from "@/lib/prepare/content";
import type { CalendarEvent } from "@/lib/types/event";
import type { Meeting } from "@/lib/types/meeting";
import type { UserProfile } from "@/lib/types/profile";
import type { Workout } from "@/lib/types/training";
import { dayEventsFor } from "@/lib/calendar/dayAgenda";
import { splitAllDay } from "@/lib/calendar/dayEvents";
import { addDays, sameZonedDay, startOfZonedDay } from "@/lib/time";
import { availabilitySearchStart } from "@/lib/time/clock";
import { EventRow } from "../events/EventRow";

type DayViewProps = {
  date: Date;
  events: CalendarEvent[];
  workouts: Workout[];
  meetings: Meeting[];
  profile: UserProfile;
  onPrepare: (id: string) => void;
  onMove: (id: string) => void;
};

export function DayView({ date, events, workouts, meetings, profile, onPrepare, onMove }: DayViewProps) {
  const now = useNow();
  const daysEvents = dayEventsFor(events, date, profile.timezone);
  const { allDay, timed } = splitAllDay(daysEvents);
  const dayStart = startOfZonedDay(profile.timezone, date);
  const dayEnd = addDays(dayStart, 1);
  const windows = findFreeTime({
    start: sameZonedDay(now, date, profile.timezone) ? availabilitySearchStart(now, profile.timezone) : dayStart,
    end: dayEnd,
    durationMinutes: 30,
    events: daysEvents,
    timezone: profile.timezone,
    useWorkingHours: false,
    ...planningFreeTimeOptions(profile, workouts),
  });

  return (
    <div className="mx-auto max-w-xl md:max-w-3xl">
      {allDay.length ? (
        <div className="mb-3">
          <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">All day</p>
          <div className="divide-y divide-[var(--line)]">
            {allDay.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                timezone={profile.timezone}
                workout={linkedWorkout(event, workouts)}
                meeting={linkedMeeting(event, meetings)}
                selfName={profile.displayName}
                now={now}
                onPrepare={() => onPrepare(event.id)}
                onMove={() => onMove(event.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-[var(--line)]">
        {timed.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            timezone={profile.timezone}
            workout={linkedWorkout(event, workouts)}
            meeting={linkedMeeting(event, meetings)}
            selfName={profile.displayName}
            now={now}
            onPrepare={() => onPrepare(event.id)}
            onMove={() => onMove(event.id)}
          />
        ))}
      </div>
      {daysEvents.length === 0 ? (
        <p className="py-8 text-[var(--muted)]">Nothing scheduled.</p>
      ) : null}
      {windows[0] ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          Open time from {formatClock(windows[0].start, profile.timezone)} · {formatDuration(windows[0].minutes)} first block
        </p>
      ) : null}
    </div>
  );
}
