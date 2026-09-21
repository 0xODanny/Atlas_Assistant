import type { PrivacyLevel } from "./event";
import type { TrainingPreferences } from "./training";

export type PreferenceSource = "default" | "user";

export type HourKind = "focus" | "meeting" | "workout";

export type WorkingHours = {
  start: string;
  end: string;
  days: number[];
};

export type ScheduleHours = WorkingHours & {
  source: PreferenceSource;
};

export type SchedulingHours = {
  focus: ScheduleHours;
  meeting: ScheduleHours;
  workout: ScheduleHours;
  focusBlockMinutes?: number;
  focusBlockSource?: PreferenceSource;
};

export type Routine = {
  id: string;
  title: string;
  time: string;
};

export type SemanticEventKind =
  | "call"
  | "meeting"
  | "workout"
  | "focus"
  | "personal"
  | "relax"
  | "travel"
  | "other";

export type EventColorOverrides = Partial<Record<SemanticEventKind, string>>;

export type UserProfile = {
  id: string;
  displayName: string;
  schemaVersion?: number;
  timezone: string;
  workingHours: WorkingHours;
  schedulingHours?: SchedulingHours;
  morningBriefTime: string;
  privacyDefault: PrivacyLevel;
  goals: string[];
  routines: Routine[];
  trainingPreferences: TrainingPreferences;
  afterWorkoutBufferMinutes?: number;
  eventColorOverrides?: EventColorOverrides;
  showSampleData?: boolean;
  sampleDataExplicit?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type ConnectionId = "google" | "icloud" | "telegram";

export type ConnectedCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
  included: boolean;
  accessRole?: string;
};

export type ConnectionState = {
  status: ConnectionStatus;
  email?: string;
  lastSyncedAt?: string;
  syncError?: string;
  calendars?: ConnectedCalendar[];
  writeEnabled?: boolean;
  defaultWriteCalendarId?: string;
};

export type Connections = Record<ConnectionId, ConnectionState>;
