import type { AppState } from "./state";
import type { CalendarEvent } from "../types/event";
import type { Meeting } from "../types/meeting";
import type { Connections, UserProfile } from "../types/profile";
import type { Task } from "../types/task";
import type { Workout } from "../types/training";

export const SEED_EVENT_IDS = new Set(["evt_bike", "evt_pepinho", "evt_swim"]);
export const SEED_TASK_IDS = new Set(["task_agenda", "task_ride"]);
export const SEED_WORKOUT_IDS = new Set(["workout_bike", "workout_swim"]);
export const SEED_MEETING_IDS = new Set(["meet_pepinho"]);

export function isDemoEvent(event: Pick<CalendarEvent, "id" | "demo">): boolean {
  return event.demo === true;
}

export function isDemoTask(task: Pick<Task, "id" | "demo">): boolean {
  return task.demo === true || SEED_TASK_IDS.has(task.id);
}

export function isDemoWorkout(workout: Pick<Workout, "id" | "demo">): boolean {
  return workout.demo === true || SEED_WORKOUT_IDS.has(workout.id);
}

export function isDemoMeeting(meeting: Pick<Meeting, "id" | "demo">): boolean {
  return meeting.demo === true || SEED_MEETING_IDS.has(meeting.id);
}

export function hasExternalCalendar(connections: Connections): boolean {
  return connections.google.status === "connected" || connections.icloud.status === "connected";
}

export function sampleDataEnabled(profile: UserProfile, connections: Connections): boolean {
  if (profile.sampleDataExplicit) return profile.showSampleData === true;
  return !hasExternalCalendar(connections);
}

export function stampSeedDemoFlags(state: AppState): AppState {
  return {
    ...state,
    events: state.events.map((event) => (SEED_EVENT_IDS.has(event.id) ? { ...event, demo: true } : event)),
    tasks: state.tasks.map((task) => (SEED_TASK_IDS.has(task.id) ? { ...task, demo: true } : task)),
    workouts: state.workouts.map((workout) =>
      SEED_WORKOUT_IDS.has(workout.id) ? { ...workout, demo: true } : workout,
    ),
    meetings: state.meetings.map((meeting) =>
      SEED_MEETING_IDS.has(meeting.id) ? { ...meeting, demo: true } : meeting,
    ),
  };
}

export function presentAppState(state: AppState): AppState {
  const stamped = stampSeedDemoFlags(state);
  if (sampleDataEnabled(stamped.profile, stamped.connections)) return stamped;
  return {
    ...stamped,
    events: stamped.events.filter((event) => !isDemoEvent(event)),
    tasks: stamped.tasks.filter((task) => !isDemoTask(task)),
    workouts: stamped.workouts.filter((workout) => !isDemoWorkout(workout)),
    meetings: stamped.meetings.filter((meeting) => !isDemoMeeting(meeting)),
  };
}
