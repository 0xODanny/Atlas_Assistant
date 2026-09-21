"use client";

import { dayEventsFor } from "@/lib/calendar/dayAgenda";
import type { CalendarEvent } from "@/lib/types/event";
import type { Meeting } from "@/lib/types/meeting";
import type { UserProfile } from "@/lib/types/profile";
import type { Workout } from "@/lib/types/training";
import { DaySchedule } from "./DaySchedule";

type DayViewProps = {
  date: Date;
  events: CalendarEvent[];
  workouts: Workout[];
  meetings: Meeting[];
  profile: UserProfile;
  onPrepare: (id: string) => void;
  onMove: (id: string) => void;
  onSelect?: (id: string) => void;
};

export function DayView({ date, events, profile, onSelect, onMove }: DayViewProps) {
  const daysEvents = dayEventsFor(events, date, profile.timezone);

  return (
    <div className="mx-auto w-full" data-atlas-day-view>
      <DaySchedule
        events={daysEvents}
        timezone={profile.timezone}
        onSelect={(id) => (onSelect ? onSelect(id) : onMove(id))}
      />
    </div>
  );
}
