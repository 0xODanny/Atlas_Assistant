export type Sport = "swim" | "bike" | "run" | "strength" | "recovery";

export type Intensity = "easy" | "moderate" | "hard" | "recovery" | "zone2";

export type Workout = {
  id: string;
  eventId?: string;
  sport: Sport;
  duration: number;
  intensity: Intensity;
  description: string;
  focus?: string[];
  scheduledTime: string;
  completed: boolean;
  indoorAlternative?: string;
  weatherDependent: boolean;
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FitnessGoal = {
  id: string;
  title: string;
  description: string;
};

export type TrainingPlan = {
  id: string;
  goalId?: string;
  summary: string;
  workoutIds: string[];
};

export type WorkoutSchedulePreference = {
  durationMinutes?: number;
  part?: "morning" | "afternoon" | "evening";
  startHour?: number;
};

export type TrainingPreferences = {
  enabled: boolean;
  goal?: string;
  schedule?: WorkoutSchedulePreference;
  sports?: Partial<Record<Sport, WorkoutSchedulePreference>>;
};
