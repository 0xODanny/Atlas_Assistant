import { findFreeTime } from "../calendar/freeTime";
import { resolveScheduleHours } from "../calendar/hours";
import { planningFreeTimeOptions } from "../calendar/transitionBuffer";
import { addDays, startOfZonedDay } from "../time";
import type {
  AssistantContext,
  FreeWindow,
  GoalRecord,
  MeetingMemoryHit,
  ToolResult,
  TrainingPlanResult,
  WeatherSnapshot,
} from "../types/assistant";
import type { CalendarEvent, CreateEventInput, UpdateEventInput } from "../types/event";
import type { Task } from "../types/task";

export type ToolContext = AssistantContext;

function eventsInRange(context: ToolContext, start: Date, end: Date): CalendarEvent[] {
  return context.events.filter((event) => {
    if (event.status === "cancelled") return false;
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    return eventEnd > start.getTime() && eventStart < end.getTime();
  });
}

export function getCalendarEvents(
  context: ToolContext,
  range?: { start: string; end: string },
): ToolResult<CalendarEvent[]> {
  if (!range) {
    const start = startOfZonedDay(context.timezone, new Date(context.now));
    const end = addDays(start, 1);
    return { ok: true, data: eventsInRange(context, start, end) };
  }
  return {
    ok: true,
    data: eventsInRange(context, new Date(range.start), new Date(range.end)),
  };
}

export function findFreeTimeTool(
  context: ToolContext,
  input: { durationMinutes: number; start?: string; end?: string; useWorkingHours?: boolean },
): ToolResult<FreeWindow[]> {
  const start = input.start
    ? new Date(input.start)
    : startOfZonedDay(context.timezone, new Date(context.now));
  const end = input.end ? new Date(input.end) : addDays(start, 1);
  return {
    ok: true,
    data: findFreeTime({
      start,
      end,
      durationMinutes: input.durationMinutes,
      events: context.events,
      timezone: context.timezone,
      workingHours: resolveScheduleHours(context.profile, "focus"),
      useWorkingHours: input.useWorkingHours ?? true,
      ...planningFreeTimeOptions(context.profile, context.workouts),
    }),
  };
}

export function createEventTool(input: CreateEventInput): ToolResult<CreateEventInput> {
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  if (new Date(input.end).getTime() <= new Date(input.start).getTime()) {
    return { ok: false, error: "End must be after start." };
  }
  return { ok: true, data: input };
}

export function updateEventTool(
  context: ToolContext,
  id: string,
  patch: UpdateEventInput,
): ToolResult<{ id: string; patch: UpdateEventInput; before: CalendarEvent }> {
  const before = context.events.find((event) => event.id === id);
  if (!before) return { ok: false, error: `Event not found: ${id}` };
  return { ok: true, data: { id, patch, before } };
}

export function deleteEventTool(
  context: ToolContext,
  id: string,
): ToolResult<{ id: string; before: CalendarEvent }> {
  const before = context.events.find((event) => event.id === id);
  if (!before) return { ok: false, error: `Event not found: ${id}` };
  return { ok: true, data: { id, before } };
}

export function getTasks(context: ToolContext): ToolResult<Task[]> {
  return { ok: true, data: context.tasks };
}

export function createTaskTool(title: string): ToolResult<{ title: string }> {
  if (!title.trim()) return { ok: false, error: "Title is required." };
  return { ok: true, data: { title: title.trim() } };
}

export function getUserGoals(context: ToolContext): ToolResult<GoalRecord[]> {
  return {
    ok: true,
    data: context.profile.goals.map((text) => ({ text })),
  };
}

export function getTrainingPlan(context: ToolContext): ToolResult<TrainingPlanResult> {
  const goal = context.profile.trainingPreferences.goal;
  return {
    ok: true,
    data: {
      plan: null,
      goals: goal
        ? [{ id: "goal_training", title: "Training goal", description: goal }]
        : [],
    },
  };
}

export function getWeather(date: string): ToolResult<WeatherSnapshot> {
  return {
    ok: true,
    data: {
      date,
      condition: "unavailable",
      precipitationChance: 0,
      source: "none",
    },
  };
}

export function searchMeetingMemory(
  context: ToolContext,
  query: string,
): ToolResult<MeetingMemoryHit[]> {
  if (!query.trim() || context.meetings.length === 0) {
    return { ok: true, data: [] };
  }
  return { ok: true, data: [] };
}
