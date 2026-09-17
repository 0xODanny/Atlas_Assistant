import { findFreeTime } from "../calendar/freeTime";
import { resolveScheduleHours } from "../calendar/hours";
import { planningFreeTimeOptions } from "../calendar/transitionBuffer";
import { formatClock, formatRange } from "../format";
import { availabilitySearchStart } from "../time/clock";
import { presentEventRow } from "../present/event";
import { nextEligibleMeeting, nextUpcomingEvent } from "../present/status";
import { dayEventsFor } from "../calendar/dayAgenda";
import { trainingGoalCopy } from "../present/training";
import { linkedMeeting, linkedWorkout } from "../prepare/content";
import { addDays, startOfZonedDay } from "../time";
import type { AssistantContext, ModelIntent } from "../types/assistant";
import { currentCapabilities } from "./capabilities";

function compactEvent(context: AssistantContext, eventId: string) {
  const event = context.events.find((item) => item.id === eventId);
  if (!event) return null;
  const workout = linkedWorkout(event, context.workouts);
  const meeting = linkedMeeting(event, context.meetings);
  const row = presentEventRow({
    event,
    timezone: context.timezone,
    workout,
    meeting,
    selfName: context.profile.displayName,
  });
  return {
    id: event.id,
    title: event.title,
    start: event.allDay ? "All day" : formatClock(event.start, context.timezone),
    range: event.allDay ? "All day" : formatRange(event.start, event.end, context.timezone),
    startIso: event.start,
    endIso: event.end,
    category: event.category,
    demo: Boolean(event.demo),
    meta: row.meta,
    detail: event.privacy === "private" && event.source !== "local" ? undefined : row.detail,
    preparationMinutes: event.preparationRequired ? event.preparationMinutes : 0,
  };
}

export function buildModelContext(context: AssistantContext, pending?: ModelIntent) {
  const now = new Date(context.now);
  const tz = context.timezone;
  const todayStart = startOfZonedDay(tz, now);
  const todayEnd = addDays(todayStart, 1);
  const nearbyEnd = addDays(todayStart, 2);
  const todays = dayEventsFor(context.events, now, tz);
  const nearby = context.events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => {
      const start = new Date(event.start).getTime();
      return start >= todayEnd.getTime() && start < nearbyEnd.getTime();
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const windows = findFreeTime({
    start: availabilitySearchStart(now, tz),
    end: todayEnd,
    durationMinutes: 30,
    events: context.events,
    timezone: tz,
    workingHours: resolveScheduleHours(context.profile, "focus"),
    useWorkingHours: true,
    ...planningFreeTimeOptions(context.profile, context.workouts),
  });
  const next = nextUpcomingEvent(todays, now);
  const nextWorkout = todays.find((event) => event.category === "training" && new Date(event.end) > now);
  const nextMeeting = nextEligibleMeeting(context.events, now);

  return {
    now: now.toISOString(),
    timezone: tz,
    workingHours: resolveScheduleHours(context.profile, "focus"),
    schedulingHours: context.profile.schedulingHours,
    trainingGoal: trainingGoalCopy(context.profile) || context.profile.trainingPreferences.goal || "",
    goals: context.profile.goals,
    capabilities: currentCapabilities().map((item) => ({
      id: item.id,
      available: item.available,
    })),
    today: todays.map((event) => compactEvent(context, event.id)),
    nearby: nearby.map((event) => compactEvent(context, event.id)),
    openWindowsToday: windows.slice(0, 6).map((window) => ({
      range: formatRange(window.start, window.end, tz),
      minutes: window.minutes,
    })),
    importantTasks: context.tasks.filter((task) => task.important && !task.completed).map((task) => task.title),
    nextEvent: next ? compactEvent(context, next.id) : null,
    nextWorkout: nextWorkout ? compactEvent(context, nextWorkout.id) : null,
    nextMeeting: nextMeeting ? compactEvent(context, nextMeeting.id) : null,
    selectedEvent: context.selectedEventId ? compactEvent(context, context.selectedEventId) : null,
    pending,
  };
}
