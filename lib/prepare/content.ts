import { eventDurationMinutes, formatDurationMinutes } from "../format";
import type { CalendarEvent, EventCategory } from "../types/event";
import type { Meeting } from "../types/meeting";
import type { Intensity, Sport, Workout } from "../types/training";

export type PreparationSection = {
  heading: string;
  items: string[];
};

export type PreparationContent = {
  actionLabel: string;
  sheetTitle: string;
  eyebrow: string;
  headline: string;
  summary?: string;
  sections: PreparationSection[];
  schedulePrep: boolean;
  prepMinutes: number;
};

export type PreparationInput = {
  event: CalendarEvent;
  workout?: Workout;
  meeting?: Meeting;
};

const TRAINING_BEFORE: Partial<Record<Sport, string[]>> = {
  bike: ["Hydrate", "Check bike / trainer", "Bring nutrition if needed"],
  run: ["Hydrate", "Check shoes", "Warm up easy"],
  swim: ["Goggles", "Hydration", "Swim gear"],
  strength: ["Warm up", "Check equipment", "Water nearby"],
  recovery: ["Easy pace only", "Hydrate"],
};

export function intensityLabel(intensity: Intensity): string {
  if (intensity === "zone2") return "Zone 2";
  return intensity.charAt(0).toUpperCase() + intensity.slice(1);
}

export function actionLabelForCategory(category: EventCategory): string {
  switch (category) {
    case "training":
      return "View Workout";
    case "travel":
      return "Trip Details";
    case "meeting":
      return "Prepare Me";
    default:
      return "Prepare";
  }
}

export function shouldOfferPrepareAction(input: PreparationInput): boolean {
  const { event } = input;
  if (event.category === "personal") {
    return event.preparationRequired || Boolean(event.description.trim());
  }
  return true;
}

export function linkedWorkout(event: CalendarEvent, workouts: Workout[]): Workout | undefined {
  return workouts.find((item) => item.id === event.workoutId || item.eventId === event.id);
}

export function linkedMeeting(event: CalendarEvent, meetings: Meeting[]): Meeting | undefined {
  return meetings.find((item) => item.id === event.meetingId || item.eventId === event.id);
}

function splitDescription(description: string): string[] {
  return description
    .split(/(?<=\.)\s+/)
    .map((item) => item.replace(/\.$/, "").trim())
    .filter(Boolean);
}

function meetingSections(event: CalendarEvent, meeting?: Meeting): PreparationSection[] {
  const agenda = meeting?.agenda?.length ? meeting.agenda : splitDescription(event.description);
  const notes = meeting?.preparationNotes ?? [];
  const unresolved = meeting?.unresolvedQuestions ?? [];
  const sections: PreparationSection[] = [];
  if (agenda.length) sections.push({ heading: "Agenda", items: agenda });
  if (notes.length) sections.push({ heading: "Notes", items: notes });
  if (unresolved.length) sections.push({ heading: "Unresolved", items: unresolved });
  const people = event.participants.map((person) => person.name);
  if (people.length) sections.push({ heading: "Participants", items: people });
  return sections;
}

function trainingSections(event: CalendarEvent, workout?: Workout): PreparationSection[] {
  const sport = workout?.sport;
  const duration = workout?.duration ?? eventDurationMinutes(event.start, event.end);
  const session = [
    workout?.description || event.description || "Training session",
    workout
      ? `${formatDurationMinutes(duration)} · ${intensityLabel(workout.intensity)}`
      : formatDurationMinutes(duration),
  ].filter(Boolean);

  const sections: PreparationSection[] = [{ heading: "Today's session", items: session }];

  if (workout?.focus?.length) {
    sections.push({ heading: "Focus", items: workout.focus });
  }

  const before = sport ? TRAINING_BEFORE[sport] ?? [] : [];
  if (before.length) {
    sections.push({
      heading: "Before you start",
      items: before,
    });
  }

  if (workout?.weatherDependent && workout.indoorAlternative) {
    sections.push({
      heading: "If weather changes",
      items: [workout.indoorAlternative],
    });
  }

  return sections;
}

function travelSections(event: CalendarEvent): PreparationSection[] {
  const minutes = eventDurationMinutes(event.start, event.end);
  const items = [
    event.location ? `Destination: ${event.location}` : undefined,
    `Travel duration: ${minutes} minutes`,
    "Allow a buffer before you leave",
    "Documents and check-in",
  ].filter((item): item is string => Boolean(item));
  if (event.description.trim()) items.push(event.description.trim());
  return [{ heading: "Before you go", items }];
}

function focusSections(event: CalendarEvent): PreparationSection[] {
  const items = [event.title, ...splitDescription(event.description), "Silence notifications"];
  return [{ heading: "Protect the block", items }];
}

function personalSections(event: CalendarEvent): PreparationSection[] {
  const items = splitDescription(event.description);
  if (!items.length && !event.preparationRequired) return [];
  return [
    {
      heading: "Notes",
      items: items.length ? items : ["Keep this time protected"],
    },
  ];
}

export function buildPreparation(input: PreparationInput): PreparationContent {
  const { event, workout, meeting } = input;
  const actionLabel = actionLabelForCategory(event.category);
  const schedulePrep =
    (event.category === "meeting" || event.category === "work") &&
    event.preparationRequired &&
    event.preparationMinutes > 0;

  if (event.category === "training") {
    return {
      actionLabel,
      sheetTitle: "Workout",
      eyebrow: event.title,
      headline: "",
      summary: workout?.description ?? event.description,
      sections: trainingSections(event, workout),
      schedulePrep: false,
      prepMinutes: 0,
    };
  }

  if (event.category === "meeting" || event.category === "work") {
    const minutes = event.preparationMinutes || 0;
    return {
      actionLabel,
      sheetTitle: actionLabel,
      eyebrow: event.title,
      headline: minutes ? `Prepare for ${minutes} minutes.` : "What to review",
      sections: meetingSections(event, meeting),
      schedulePrep,
      prepMinutes: minutes,
    };
  }

  if (event.category === "travel") {
    return {
      actionLabel,
      sheetTitle: "Trip Details",
      eyebrow: event.title,
      headline: "Before you leave",
      sections: travelSections(event),
      schedulePrep: false,
      prepMinutes: 0,
    };
  }

  if (event.category === "focus") {
    return {
      actionLabel,
      sheetTitle: "Prepare",
      eyebrow: event.title,
      headline: "Objective",
      sections: focusSections(event),
      schedulePrep: false,
      prepMinutes: 0,
    };
  }

  return {
    actionLabel,
    sheetTitle: "Prepare",
    eyebrow: event.title,
    headline: event.preparationRequired ? "Worth a look" : "Notes",
    sections: personalSections(event),
    schedulePrep: false,
    prepMinutes: 0,
  };
}

export function preparationCopy(content: PreparationContent): string {
  return [
    content.headline,
    content.summary,
    ...content.sections.flatMap((section) => [section.heading, ...section.items]),
  ]
    .filter(Boolean)
    .join("\n");
}
