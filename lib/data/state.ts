import type { CalendarEvent } from "../types/event";
import type { Task } from "../types/task";
import type { Workout } from "../types/training";
import type { Meeting } from "../types/meeting";
import type { Connections, UserProfile } from "../types/profile";

export type AppState = {
  profile: UserProfile;
  connections: Connections;
  events: CalendarEvent[];
  tasks: Task[];
  workouts: Workout[];
  meetings: Meeting[];
};

export type StateStore = {
  getState(): AppState;
  setState(next: AppState): void;
};
