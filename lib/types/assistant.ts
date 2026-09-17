import type { WriteDestination } from "../calendar/destination";
import type { CalendarEvent, CreateEventInput, UpdateEventInput } from "./event";
import type { Connections, UserProfile } from "./profile";
import type { Task } from "./task";
import type { Meeting } from "./meeting";
import type { Workout, TrainingPlan, FitnessGoal } from "./training";

export type AssistantToolName =
  | "getCalendarEvents"
  | "findFreeTime"
  | "createEvent"
  | "updateEvent"
  | "deleteEvent"
  | "getTasks"
  | "createTask"
  | "getUserGoals"
  | "getTrainingPlan"
  | "getWeather"
  | "searchMeetingMemory";

export type AssistantActionKind = "read" | "propose" | "mutate";

export type AssistantActionStatus = "proposed" | "applied" | "dismissed";

export type FreeWindow = {
  start: string;
  end: string;
  minutes: number;
};

export type WeatherSnapshot = {
  date: string;
  condition: string;
  precipitationChance: number;
  source: "none" | "mock";
};

export type MeetingMemoryHit = {
  meetingId: string;
  kind: "decision" | "action" | "summary" | "promise";
  text: string;
};

export type CapabilityId = "openai" | "calendar" | "weather" | "memory" | "telegram";

export type CapabilityStatus = {
  id: CapabilityId;
  available: boolean;
};

export type TimeHint = {
  day?: "today" | "tomorrow" | "weekday";
  weekday?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  part?: "morning" | "afternoon" | "evening" | "later" | "working";
  hour?: number;
  minute?: number;
  year?: number;
  month?: number;
  dayOfMonth?: number;
  week?: "this" | "next";
};

export type ModelIntentType =
  | "answer"
  | "find_time"
  | "create_event"
  | "move_event"
  | "create_focus_block"
  | "prepare_meeting"
  | "reorganize_day"
  | "delete_event"
  | "clarify";

export type ModelIntent = {
  type: ModelIntentType;
  topic?: "day" | "next" | "next_meeting" | "next_workout" | "training_goal" | "open_time";
  eventId?: string;
  eventHint?: string;
  avoidEventHint?: string;
  durationMinutes?: number;
  durationRequested?: boolean;
  title?: string;
  category?: CalendarEvent["category"];
  sport?: Workout["sport"];
  when?: TimeHint;
  untilHint?: string;
  slotOffset?: number;
  question?: string;
  capability?: Exclude<CapabilityId, "openai" | "calendar">;
};

export type AssistantChoice = {
  id: string;
  label: string;
  start: string;
  end: string;
  reason?: string;
};

export type AssistantContext = {
  now: string;
  timezone: string;
  profile: UserProfile;
  events: CalendarEvent[];
  tasks: Task[];
  workouts: Workout[];
  meetings: Meeting[];
  connections?: Connections;
  googleWriteEnabled?: boolean;
  selectedEventId?: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantSource = "openai" | "local" | "error";

export type AssistantRequest = {
  messages: ChatTurn[];
  context: AssistantContext;
  pending?: ModelIntent;
};

export type MutationPayload =
  | { type: "createEvent"; event: CreateEventInput; workoutSport?: Workout["sport"] }
  | { type: "updateEvent"; id: string; patch: UpdateEventInput; before?: CalendarEvent }
  | { type: "deleteEvent"; id: string; before?: CalendarEvent }
  | { type: "createTask"; title: string; important?: boolean; eventId?: string };

export type AssistantAction = {
  id: string;
  kind: AssistantActionKind;
  tool: AssistantToolName;
  label: string;
  summary: string;
  destinationLabel?: string;
  destination?: WriteDestination;
  payload?: MutationPayload;
  status: AssistantActionStatus;
  error?: string;
  resultEventId?: string;
};

export type AssistantResponse = {
  message: string;
  actions: AssistantAction[];
  intentType?: ModelIntentType;
  choices?: AssistantChoice[];
  windows?: FreeWindow[];
  pending?: ModelIntent;
  resume?: ModelIntent;
  targetEventId?: string;
  error?: string;
  errorCategory?: string;
  source?: AssistantSource;
};

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type GoalRecord = {
  text: string;
};

export type TrainingPlanResult = {
  plan: TrainingPlan | null;
  goals: FitnessGoal[];
};
