import {
  eventDurationMinutes,
  formatAllDayLabel,
  formatAllDayRange,
  formatClock,
  formatDurationMinutes,
  formatMinutesShort,
  formatRange,
} from "../format";
import { sanitizeListCopy } from "./description";
import { intensityLabel } from "../prepare/content";
import type { CalendarEvent } from "../types/event";
import type { Meeting } from "../types/meeting";
import type { Sport, Workout } from "../types/training";

export function sportLabel(sport: Sport): string {
  const labels: Record<Sport, string> = {
    bike: "Bike",
    swim: "Swim",
    run: "Run",
    strength: "Strength",
    recovery: "Recovery",
  };
  return labels[sport];
}

export function otherParticipantNames(event: CalendarEvent, selfName?: string): string[] {
  return event.participants
    .filter((person) => person.role !== "organizer" && (!selfName || person.name !== selfName))
    .map((person) => person.name);
}

export function participantSummary(event: CalendarEvent, selfName?: string): string | undefined {
  const names = otherParticipantNames(event, selfName);
  return names.length ? names.join(", ") : undefined;
}

export type EventRowPresentation = {
  time: string;
  title: string;
  meta: string;
  detail?: string;
};

export function presentEventRow(input: {
  event: CalendarEvent;
  timezone: string;
  workout?: Workout;
  meeting?: Meeting;
  selfName?: string;
}): EventRowPresentation {
  const { event, timezone, workout, selfName } = input;
  const minutes = eventDurationMinutes(event.start, event.end);
  const time = event.allDay ? formatAllDayLabel(event.start, event.end, timezone) : formatClock(event.start, timezone);
  const title = event.title;

  if (event.allDay) {
    const location = event.location.trim();
    const span = formatAllDayRange(event.start, event.end, timezone);
    return {
      time,
      title,
      meta: [span !== "All day" ? span : undefined, location || undefined].filter(Boolean).join(" · "),
    };
  }

  if (event.category === "training" && workout) {
    return {
      time,
      title,
      meta: `${formatMinutesShort(workout.duration || minutes)} · ${intensityLabel(workout.intensity)}`,
      detail: workout.description || undefined,
    };
  }

  if (event.category === "meeting") {
    const people = participantSummary(event, selfName);
    return {
      time,
      title,
      meta: people ? `${formatMinutesShort(minutes)} · With ${people}` : formatMinutesShort(minutes),
      detail: event.preparationRequired
        ? `Preparation recommended · ${event.preparationMinutes} min`
        : undefined,
    };
  }

  return {
    time,
    title,
    meta: formatMinutesShort(minutes),
    detail: sanitizeListCopy(event.description),
  };
}

export type WorkoutDetailPresentation = {
  title: string;
  range: string;
  duration: string;
  intensity: string;
  description?: string;
  focus: string[];
  weatherDependent: boolean;
  indoorAlternative?: string;
};

export function presentWorkoutDetails(input: {
  event: CalendarEvent;
  workout: Workout;
  timezone: string;
}): WorkoutDetailPresentation {
  const { event, workout, timezone } = input;
  return {
    title: event.title || sportLabel(workout.sport),
    range: formatRange(event.start, event.end, timezone),
    duration: formatDurationMinutes(workout.duration || eventDurationMinutes(event.start, event.end)),
    intensity: intensityLabel(workout.intensity),
    description: workout.description || undefined,
    focus: workout.focus ?? [],
    weatherDependent: workout.weatherDependent,
    indoorAlternative: workout.indoorAlternative,
  };
}
