import { defaultSchedulingHours, toWorkingHours } from "../calendar/hours";
import { DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES } from "../calendar/transitionBuffer";
import { DEFAULT_CALENDAR_ID, DEFAULT_TIMEZONE } from "../config";
import { addDays, addMinutes, atZonedTime } from "../time";
import type { AppState } from "./state";

export function createSeedState(now = new Date()): AppState {
  const timezone = DEFAULT_TIMEZONE;
  const createdAt = now.toISOString();

  const bikeStart = atZonedTime(timezone, now, 7, 30);
  const bikeEnd = addMinutes(bikeStart, 60);
  const meetingStart = atZonedTime(timezone, now, 11, 0);
  const meetingEnd = addMinutes(meetingStart, 45);
  const swimStart = atZonedTime(timezone, now, 17, 30);
  const swimEnd = addMinutes(swimStart, 60);

  const profile = {
    id: "user_local",
    displayName: "Daniel",
    timezone,
    schedulingHours: defaultSchedulingHours(),
    workingHours: toWorkingHours(defaultSchedulingHours().focus),
    morningBriefTime: "07:15",
    privacyDefault: "busy-only" as const,
    goals: ["Protect one deep-work block each weekday", "Train consistently for a triathlon"],
    routines: [
      { id: "routine_wake", title: "Wake / coffee", time: "06:45" },
      { id: "routine_shutdown", title: "Shutdown", time: "21:30" },
    ],
    trainingPreferences: {
      enabled: true,
      goal: "I am training for a triathlon.",
    },
    afterWorkoutBufferMinutes: DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES,
    createdAt,
    updatedAt: createdAt,
  };

  const events = [
    {
      id: "evt_bike",
      title: "Bike",
      description: "Outdoor endurance ride. Move indoors if the weather turns.",
      start: bikeStart.toISOString(),
      end: bikeEnd.toISOString(),
      location: "Neighborhood loop",
      participants: [],
      privacy: "busy-only" as const,
      preparationRequired: false,
      preparationMinutes: 0,
      source: "local" as const,
      category: "training" as const,
      status: "confirmed" as const,
      calendarId: DEFAULT_CALENDAR_ID,
      timezone,
      workoutId: "workout_bike",
      demo: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "evt_pepinho",
      title: "Pepinho Meeting",
      description:
        "Weekly product review. Bring launch status, payment blockers, and next-week priorities.",
      start: meetingStart.toISOString(),
      end: meetingEnd.toISOString(),
      location: "Google Meet",
      participants: [
        { id: "person_self", name: "Daniel", role: "organizer" as const },
        { id: "person_marcus", name: "Marcus", role: "attendee" as const },
      ],
      privacy: "shared" as const,
      preparationRequired: true,
      preparationMinutes: 15,
      source: "local" as const,
      category: "meeting" as const,
      status: "confirmed" as const,
      calendarId: DEFAULT_CALENDAR_ID,
      timezone,
      meetingId: "meet_pepinho",
      demo: true,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "evt_swim",
      title: "Swim",
      description: "Endurance + technique. 200s and drills.",
      start: swimStart.toISOString(),
      end: swimEnd.toISOString(),
      location: "Community pool",
      participants: [],
      privacy: "busy-only" as const,
      preparationRequired: false,
      preparationMinutes: 0,
      source: "local" as const,
      category: "training" as const,
      status: "confirmed" as const,
      calendarId: DEFAULT_CALENDAR_ID,
      timezone,
      workoutId: "workout_swim",
      demo: true,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  return {
    profile,
    connections: {
      google: { status: "disconnected" },
      icloud: { status: "disconnected" },
      telegram: { status: "disconnected" },
    },
    events,
    tasks: [
      {
        id: "task_agenda",
        title: "Review Pepinho agenda and numbers",
        due: meetingStart.toISOString(),
        important: true,
        completed: false,
        eventId: "evt_pepinho",
        demo: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "task_ride",
        title: "Confirm weekend long ride",
        due: addDays(now, 2).toISOString(),
        important: true,
        completed: false,
        demo: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    workouts: [
      {
        id: "workout_bike",
        eventId: "evt_bike",
        sport: "bike",
        duration: 60,
        intensity: "zone2",
        description: "Outdoor endurance ride",
        scheduledTime: bikeStart.toISOString(),
        completed: false,
        indoorAlternative: "60-minute indoor endurance trainer ride",
        weatherDependent: true,
        demo: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "workout_swim",
        eventId: "evt_swim",
        sport: "swim",
        duration: 60,
        intensity: "moderate",
        description: "Endurance + technique",
        focus: ["200s", "Technique drills"],
        scheduledTime: swimStart.toISOString(),
        completed: false,
        weatherDependent: false,
        demo: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    meetings: [
      {
        id: "meet_pepinho",
        eventId: "evt_pepinho",
        title: "Pepinho Meeting",
        participantIds: ["person_self", "person_marcus"],
        agenda: ["Review launch status", "Review payment blockers", "Bring next-week priorities"],
        preparationNotes: ["Weekly product review"],
        unresolvedQuestions: [],
        actionItems: [],
        demo: true,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}
