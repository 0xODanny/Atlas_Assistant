import type { FreeWindow } from "../types/assistant";
import type { CalendarEvent } from "../types/event";
import type { Task } from "../types/task";
import type { SemanticEventKind } from "../types/profile";

export type BriefLine = {
  kind: "event" | "focus";
  eventId?: string;
  start: string;
  timeLabel: string;
  heading: string;
  meta?: string;
  lines: string[];
  action?: "prepare";
};

export type BriefItem = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  minutes: number;
  preparationRequired: boolean;
  preparationMinutes: number;
  category: CalendarEvent["category"];
  meta?: string;
  detail?: string;
};

export type BriefEventPhase = "allDay" | "upcoming" | "now" | "completed";

export type BriefEvent = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  minutes: number;
  allDay: boolean;
  blocksTime: boolean;
  category: CalendarEvent["category"];
  kind: SemanticEventKind;
  training: boolean;
  location?: string;
  calendarId?: string;
  source?: CalendarEvent["source"];
  phase: BriefEventPhase;
  preparationRequired: boolean;
  preparationMinutes: number;
  meta?: string;
  detail?: string;
};

export type BriefOpenUsefulness = "small" | "meaningful" | "focus";

export type BriefOpenBlock = {
  start: string;
  end: string;
  minutes: number;
  usefulness: BriefOpenUsefulness;
};

export type BriefNextEvent = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  status: "now" | "next";
  timeLabel: string;
  concurrentCount?: number;
};

export type BriefNote = {
  id: string;
  kind: "observation" | "overlap" | "tight_transition" | "workout_buffer" | "recommendation";
  text: string;
  start?: string;
  end?: string;
};

export type BriefGlance = {
  eventCount: number;
  workoutCount: number;
  busyMinutes: number;
  /** Remaining usable windows >= 30 minutes, including 30–59 minute openings. */
  openMinutes: number;
  /** Remaining usable windows >= 60 minutes only. */
  meaningfulOpenMinutes: number;
};

export type MorningBrief = {
  date: string;
  timezone: string;
  generatedAt: string;
  greeting: string;
  lead: string;
  eventCount: number;
  openMinutes: number;
  summary: string;
  glance: BriefGlance;
  nextEvent?: BriefNextEvent;
  events: BriefEvent[];
  workouts: BriefEvent[];
  allDayEvents: BriefEvent[];
  openBlocks: BriefOpenBlock[];
  observations: BriefNote[];
  issues: BriefNote[];
  recommendations: BriefNote[];
  timeline: BriefLine[];
  items: BriefItem[];
  bestFocus?: FreeWindow;
  important: Task[];
  prepItems: Array<{
    eventId: string;
    title: string;
    minutes: number;
  }>;
};
