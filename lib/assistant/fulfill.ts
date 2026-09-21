import { suggestMoveWindows } from "../calendar/moveSuggestions";
import { findFreeTime, totalOpenMinutes } from "../calendar/freeTime";
import { hoursForEvent, resolveFocusBlockMinutes, resolveScheduleHours } from "../calendar/hours";
import { diagnoseMissingSlot } from "../calendar/noSlot";
import { durationSlotsFromWindows } from "../calendar/slotOptions";
import {
  describeWorkoutBufferAvailability,
  findPlanningConflict,
  isRecognizedWorkout,
  planningConflicts,
  planningFreeTimeOptions,
  resolveAfterWorkoutBufferMinutes,
} from "../calendar/transitionBuffer";
import { firstSnappedSlot } from "../calendar/snap";
import {
  createEventAlreadyExists,
  exactWorkoutStart,
  recommendWorkoutSlots,
  recommendedWorkoutMessage,
  resolveWorkoutDuration,
} from "../calendar/workoutSchedule";
import {
  eventDurationMinutes,
  formatClock,
  formatDuration,
  formatOpenHours,
  formatRange,
  formatShortDay,
  formatSuggestionSlot,
  indefiniteDurationAdjective,
} from "../format";
import { createId } from "../id";
import { presentEventRow } from "../present/event";
import { nextEligibleMeeting, sampleMeetingNote } from "../calendar/meetings";
import { nextUpcomingEvent } from "../present/status";
import { trainingGoalCopy, trainingPriorityReason } from "../present/training";
import { buildPreparation, linkedMeeting, linkedWorkout, preparationCopy } from "../prepare/content";
import { addDays, addMinutes, sameZonedDay, startOfZonedDay } from "../time";
import { sanitizeEventTitle, stripDanglingScheduleTokens } from "./title";
import type {
  AssistantAction,
  AssistantChoice,
  AssistantContext,
  AssistantFollowUp,
  AssistantResponse,
  ModelIntent,
  TimeHint,
} from "../types/assistant";
import type { CalendarEvent } from "../types/event";
import type { HourKind } from "../types/profile";
import type { Sport } from "../types/training";
import {
  applyDestinationToCreateInput,
  formatGoogleDestinationLabel,
  resolveCreateDestinationFromContext,
  type WriteDestination,
} from "../calendar/destination";
import { dayEventsFor } from "../calendar/dayAgenda";
import { buildDaySummaryMessage, calendarReadFailed } from "./daySummary";
import { capabilityAvailable, capabilityCopy } from "./capabilities";
import {
  defaultSearchWhen,
  describeTemporalBound,
  hasHardTemporalBound,
  isFixedTiming,
  rangeDurationMinutes,
  searchMayWiden,
} from "./parseSchedule";
import { clipRangeToNow, resolveAnchorDay, resolveExactStart, resolveSearchRange } from "./resolveTime";

function createDestination(context: AssistantContext): WriteDestination {
  return resolveCreateDestinationFromContext({
    connections: context.connections,
    googleWriteEnabled: context.googleWriteEnabled,
  });
}

function eventDestination(event: CalendarEvent, context: AssistantContext): WriteDestination {
  if (event.source === "google" && event.calendarId) {
    const summary =
      context.connections?.google.calendars?.find((calendar) => calendar.id === event.calendarId)?.summary ??
      event.calendarId;
    return { provider: "google", calendarId: event.calendarId, label: formatGoogleDestinationLabel(summary) };
  }
  return { provider: "local", label: "Atlas · Local" };
}

function createEventTitle(intent: ModelIntent): string {
  const raw =
    sanitizeEventTitle(intent.title, intent.title ?? "") ||
    intent.title?.trim() ||
    (intent.sport ? intent.sport.charAt(0).toUpperCase() + intent.sport.slice(1) : "Event");
  return stripDanglingScheduleTokens(raw) || raw;
}

function proposalAddMessage(title: string, minutes: number, start: string, timezone: string): string {
  return `I can add ${indefiniteDurationAdjective(minutes)} ${title.toLowerCase()} at ${formatClock(start, timezone)}.`;
}

function boundNoSlotFollowUps(when: TimeHint | undefined, hoursKind: HourKind): AssistantFollowUp[] {
  const hoursLabel =
    hoursKind === "workout" ? "workout hours" : hoursKind === "meeting" ? "meeting hours" : "focus hours";
  const items: AssistantFollowUp[] = [
    {
      id: "outside-hours",
      label: `Show times outside my ${hoursLabel}`,
      text: `Show times outside my ${hoursLabel}`,
    },
  ];
  if (
    when?.bound === "tonight" ||
    when?.bound === "today" ||
    when?.bound === "evening" ||
    when?.bound === "afternoon" ||
    when?.bound === "morning"
  ) {
    items.push({ id: "tomorrow", label: "Try tomorrow", text: "Try tomorrow" });
  }
  if (when?.bound === "weekday" || when?.bound === "week") {
    items.push({ id: "next-week", label: "Try next week", text: "Try next week" });
  }
  if (hoursKind === "workout") {
    items.push({ id: "settings-hours", label: "Change workout hours", href: "/settings" });
  }
  return items;
}

function proposeCreateEvent(
  context: AssistantContext,
  input: {
    title: string;
    start: string;
    end: string;
    durationMinutes: number;
    category?: CalendarEvent["category"];
    sport?: Sport;
    description?: string;
    location?: string;
    privacy?: CalendarEvent["privacy"];
    label?: string;
  },
): AssistantAction {
  const tz = context.timezone;
  const destination = createDestination(context);
  return action({
    kind: "propose",
    tool: "createEvent",
    label: input.label ?? `Schedule ${input.title}`,
    summary: `${input.title} · ${formatShortDay(input.start, tz)} · ${formatRange(input.start, input.end, tz)} · ${formatDuration(input.durationMinutes)}`,
    destinationLabel: destination.label,
    destination,
    payload: {
      type: "createEvent",
      workoutSport: input.sport,
      event: applyDestinationToCreateInput(
        {
          title: input.title,
          description: input.description,
          start: input.start,
          end: input.end,
          category: input.category ?? (input.sport ? "training" : "personal"),
          privacy: input.privacy ?? "busy-only",
          location: input.location,
        },
        destination,
      ),
    },
  });
}


function describeConflict(
  start: string,
  end: string,
  context: AssistantContext,
  timezone: string,
): string {
  const conflict = findPlanningConflict(start, end, others(context), planning(context));
  if (conflict?.kind === "event") {
    return `${conflict.event.title} (${formatRange(conflict.event.start, conflict.event.end, timezone)})`;
  }
  if (conflict?.kind === "workout_buffer") {
    return `the post-workout buffer after ${conflict.workout.title} (through ${formatClock(new Date(conflict.bufferEnd).toISOString(), timezone)})`;
  }
  return "another event";
}

function fulfillWorkoutCreate(
  context: AssistantContext,
  intent: ModelIntent,
  now: Date,
  timezone: string,
  title: string,
  sport: Sport | undefined,
): AssistantResponse {
  const rangeMinutes = rangeDurationMinutes(intent.when);
  if (
    rangeMinutes !== undefined &&
    intent.durationRequested &&
    intent.durationMinutes !== undefined &&
    intent.durationMinutes !== rangeMinutes
  ) {
    return {
      intentType: "clarify",
      message: `You asked for ${formatDuration(rangeMinutes)} from the time range and ${formatDuration(intent.durationMinutes)} as the duration. Which should I use?`,
      actions: [],
      pending: intent,
    };
  }
  const duration = resolveWorkoutDuration({
    requestedMinutes: rangeMinutes ?? intent.durationMinutes,
    durationRequested: rangeMinutes !== undefined || intent.durationRequested,
    profile: context.profile,
    events: context.events,
    workouts: context.workouts,
    timezone,
    sport,
  });
  const pending: ModelIntent = {
    ...intent,
    title,
    sport,
    category: "training",
    durationMinutes: duration.minutes,
    durationRequested: intent.durationRequested,
  };
  const exact = exactWorkoutStart(intent.when, timezone, now);
  if (exact && isFixedTiming(intent)) {
    const start = exact.toISOString();
    const end = addMinutes(exact, duration.minutes).toISOString();
    if (createEventAlreadyExists(context.events, title, start)) {
      return {
        intentType: "create_event",
        message: `${title} is already on the calendar at that time.`,
        actions: [],
        pending,
      };
    }
    if (planningConflicts(start, end, others(context), planning(context))) {
      const options = recommendWorkoutSlots({
        now,
        timezone,
        profile: context.profile,
        events: context.events,
        workouts: context.workouts,
        duration,
        when: { ...intent.when, hour: undefined, minute: undefined, endHour: undefined, endMinute: undefined },
        sport,
        relaxHours: intent.relaxHours,
      });
      return {
        intentType: "create_event",
        message: `The requested ${formatRange(start, end, timezone)} conflicts with ${describeConflict(start, end, context, timezone)}. I will not book over that event, and I will not change that start time.${
          options.length ? " Nearby conflict-free options:" : " I could not find another open window."
        }`,
        actions: [],
        choices: options.map((option) => ({
          id: `slot:${option.start}`,
          label: option.label,
          start: option.start,
          end: option.end,
          reason: option.reason,
          recommended: option.recommended,
        })),
        pending,
      };
    }
    return {
      intentType: "create_event",
      message: proposalAddMessage(title, duration.minutes, start, timezone),
      actions: [
        proposeCreateEvent(context, {
          title,
          start,
          end,
          durationMinutes: duration.minutes,
          category: "training",
          sport,
          location: intent.location,
          label: `Suggested ${title.toLowerCase()}`,
        }),
      ],
      pending,
    };
  }

  const when = defaultSearchWhen(intent.when);
  const options = recommendWorkoutSlots({
    now,
    timezone,
    profile: context.profile,
    events: context.events,
    workouts: context.workouts,
    duration,
    when,
    sport,
    relaxHours: intent.relaxHours,
  });
  if (!options.length) {
    const hours = resolveScheduleHours(context.profile, "workout");
    const range = clipRangeToNow(resolveSearchRange(when, timezone, now, hours), now);
    const diagnosis = diagnoseMissingSlot({
      start: range.start,
      end: range.end.getTime() <= range.start.getTime() ? range.start : range.end,
      durationMinutes: duration.minutes,
      events: context.events,
      timezone,
      hours,
      useHours: !intent.relaxHours,
      profile: context.profile,
      workouts: context.workouts,
      kindLabel: "workout hours",
      boundLabel: describeTemporalBound(when.bound),
      now,
      bufferMinutes: resolveAfterWorkoutBufferMinutes(context.profile),
    });
    return {
      intentType: "create_event",
      message: diagnosis.message || `I couldn't find a ${formatDuration(duration.minutes)} opening ${describeTemporalBound(when.bound)} within your workout hours.`,
      actions: [],
      followUps: hasHardTemporalBound(when) || !intent.relaxHours ? boundNoSlotFollowUps(when, "workout") : [],
      pending,
    };
  }
  const recommended = options.find((option) => option.recommended) ?? options[0];
  return {
    intentType: "create_event",
    message: recommendedWorkoutMessage({
      title,
      slot: recommended,
      duration,
      timezone,
      now,
      bufferMinutes: resolveAfterWorkoutBufferMinutes(context.profile),
    }),
    actions: [
      proposeCreateEvent(context, {
        title,
        start: recommended.start,
        end: recommended.end,
        durationMinutes: duration.minutes,
        category: "training",
        sport,
        label: `Suggested ${title.toLowerCase()}`,
      }),
    ],
    choices: options.map((option) => ({
      id: `slot:${option.start}`,
      label: option.label,
      start: option.start,
      end: option.end,
      reason: option.reason,
      recommended: option.recommended,
    })),
    pending,
  };
}

function action(partial: Omit<AssistantAction, "id" | "status">): AssistantAction {
  return { id: createId("act"), status: "proposed", ...partial };
}

function findEvent(context: AssistantContext, hint?: string, id?: string): CalendarEvent | undefined {
  if (id) return context.events.find((event) => event.id === id && event.status !== "cancelled");
  const selected = context.selectedEventId
    ? context.events.find((event) => event.id === context.selectedEventId)
    : undefined;
  if (selected && (!hint || selected.title.toLowerCase().includes(hint) || selected.category.includes(hint))) {
    return selected;
  }
  if (!hint) return undefined;
  const needle = hint.toLowerCase();
  if (needle === "meeting") {
    return nextEligibleMeeting(context.events, new Date(context.now));
  }
  return context.events
    .filter((event) => event.status !== "cancelled")
    .filter((event) => {
      if (event.title.toLowerCase().includes(needle)) return true;
      if (needle === "workout" && event.category === "training") return true;
      return event.participants.some((person) => person.name.toLowerCase().includes(needle));
    })
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

function others(context: AssistantContext, exceptId?: string): CalendarEvent[] {
  return context.events.filter((event) => event.id !== exceptId && event.status !== "cancelled");
}

function planning(context: AssistantContext) {
  return planningFreeTimeOptions(context.profile, context.workouts);
}

function findPlanningWindows(
  context: AssistantContext,
  input: {
    start: Date;
    end: Date;
    durationMinutes: number;
    events?: CalendarEvent[];
    useWorkingHours?: boolean;
    hoursKind?: "focus" | "meeting" | "workout";
  },
) {
  return findFreeTime({
    start: input.start,
    end: input.end,
    durationMinutes: input.durationMinutes,
    events: input.events ?? context.events,
    timezone: context.timezone,
    workingHours: resolveScheduleHours(context.profile, input.hoursKind ?? "focus"),
    useWorkingHours: input.useWorkingHours,
    ...planning(context),
  });
}

function meetingPartnerName(intent: { eventHint?: string }): string | undefined {
  const hint = intent.eventHint?.trim();
  if (!hint) return undefined;
  const generic = new Set(["meeting", "workout", "bike", "swim", "run", "everything", "all"]);
  if (generic.has(hint.toLowerCase())) return undefined;
  return hint.charAt(0).toUpperCase() + hint.slice(1);
}

function selfAvailabilityNote(partner?: string): string {
  if (!partner) return "";
  return ` Your availability; ${partner}'s not checked.`;
}

function tooClose(start: string, end: string, avoid: CalendarEvent, bufferMinutes = 30): boolean {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const avoidStart = new Date(avoid.start).getTime() - bufferMinutes * 60_000;
  const avoidEnd = new Date(avoid.end).getTime() + bufferMinutes * 60_000;
  return endMs > avoidStart && startMs < avoidEnd;
}

function alternativeWindows(
  context: AssistantContext,
  durationMinutes: number,
  exceptId?: string,
): AssistantChoice[] {
  const now = new Date(context.now);
  const windows = findPlanningWindows(context, {
    start: now,
    end: addDays(startOfZonedDay(context.timezone, now), 2),
    durationMinutes,
    events: others(context, exceptId),
    useWorkingHours: false,
  });
  const choices: AssistantChoice[] = [];
  for (const window of windows) {
    const slot = firstSnappedSlot(window.start, window.end, durationMinutes, context.timezone);
    if (!slot) continue;
    if (planningConflicts(slot.start, slot.end, others(context, exceptId), planning(context))) continue;
    if (choices.some((choice) => choice.start === slot.start)) continue;
    choices.push({
      id: `slot:${slot.start}`,
      label: choiceLabel(slot.start, slot.end, context.timezone, context.now),
      start: slot.start,
      end: slot.end,
    });
    if (choices.length === 3) break;
  }
  return choices;
}

function choiceLabel(start: string, end: string, timezone: string, nowIso: string): string {
  return formatSuggestionSlot(start, end, timezone, new Date(nowIso));
}

function dayOverview(context: AssistantContext, intent?: ModelIntent): AssistantResponse {
  const dayStart = resolveAnchorDay(intent?.when, context.timezone, new Date(context.now));
  const list = dayEventsFor(context.events, dayStart, context.timezone);
  const important = context.tasks.filter((task) => task.important && !task.completed);
  const message = buildDaySummaryMessage({
    events: context.events,
    timezone: context.timezone,
    now: new Date(context.now),
    dayStart,
    workingHours: context.profile.workingHours,
    workouts: context.workouts,
    calendarError: calendarReadFailed(context),
    profile: context.profile,
  });
  const taskLine = important.length
    ? ` Important tasks: ${important.map((task) => task.title).join("; ")}.`
    : "";
  return {
    intentType: "answer",
    message: `${message}${taskLine}`,
    actions: [
      action({
        kind: "read",
        tool: "getCalendarEvents",
        label: "Day summary",
        summary: calendarReadFailed(context) && !list.length
          ? "Calendar read unavailable"
          : `${list.length} event${list.length === 1 ? "" : "s"} loaded from your calendar`,
      }),
    ],
  };
}

export function fulfillIntent(intent: ModelIntent, context: AssistantContext): AssistantResponse {
  const tz = context.timezone;
  const now = new Date(context.now);

  if (intent.capability === "weather" && !capabilityAvailable("weather")) {
    return { intentType: "answer", message: capabilityCopy("weather"), actions: [] };
  }
  if (intent.capability === "memory" && !capabilityAvailable("memory")) {
    return { intentType: "answer", message: capabilityCopy("memory"), actions: [] };
  }

  if (intent.type === "clarify") {
    return {
      intentType: "clarify",
      message: intent.question || "I need a bit more detail.",
      actions: [],
      pending: intent,
    };
  }

  if (intent.type === "answer") {
    if (intent.topic === "next_workout") {
      const workoutEvent = context.events
        .filter((event) => event.category === "training" && event.status !== "cancelled")
        .filter((event) => new Date(event.end) > now)
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      if (!workoutEvent) {
        return { intentType: "answer", message: "I do not see an upcoming workout on your calendar.", actions: [] };
      }
      const workout = linkedWorkout(workoutEvent, context.workouts);
      const row = presentEventRow({
        event: workoutEvent,
        timezone: tz,
        workout,
        selfName: context.profile.displayName,
      });
      return {
        intentType: "answer",
        message: `Your next workout is ${row.title} at ${row.time}. ${row.meta}${row.detail ? ` · ${row.detail}` : ""}.`,
        actions: [
          action({
            kind: "read",
            tool: "getTrainingPlan",
            label: "Next workout",
            summary: `${row.title} · ${row.time}`,
          }),
        ],
      };
    }
    if (intent.topic === "open_time") {
      const start = startOfZonedDay(tz, now);
      const windows = findPlanningWindows(context, {
        start: now.getTime() > start.getTime() ? now : start,
        end: addDays(start, 1),
        durationMinutes: 30,
        useWorkingHours: true,
      });
      const open = totalOpenMinutes(windows);
      return {
        intentType: "answer",
        message: open
          ? `You have about ${formatOpenHours(open)} of open working time today.`
          : "There is no remaining open working time today.",
        actions: [
          action({
            kind: "read",
            tool: "findFreeTime",
            label: "Open time",
            summary: open ? formatOpenHours(open) : "None remaining",
          }),
        ],
        windows: windows.slice(0, 3),
      };
    }
    if (intent.topic === "training_goal") {
      return {
        intentType: "answer",
        message: trainingGoalCopy(context.profile) || "No training goal is set.",
        actions: [],
      };
    }
    if (intent.topic === "next_meeting") {
      const meetingEvent = nextEligibleMeeting(context.events, now);
      if (!meetingEvent) {
        return { intentType: "answer", message: "There is no upcoming meeting.", actions: [] };
      }
      const row = presentEventRow({
        event: meetingEvent,
        timezone: tz,
        meeting: linkedMeeting(meetingEvent, context.meetings),
        selfName: context.profile.displayName,
      });
      const later = !sameZonedDay(new Date(meetingEvent.start), now, tz);
      const when = later
        ? `${formatShortDay(meetingEvent.start, tz)} at ${formatClock(meetingEvent.start, tz)}`
        : row.time;
      return {
        intentType: "answer",
        message: `Your next meeting is ${row.title} at ${when}.${sampleMeetingNote(meetingEvent)}`,
        actions: [
          action({
            kind: "read",
            tool: "getCalendarEvents",
            label: "Next meeting",
            summary: `${row.title} · ${when}`,
          }),
        ],
      };
    }
    if (intent.topic === "next") {
      const start = startOfZonedDay(tz, now);
      const todays = context.events.filter((event) => {
        const time = new Date(event.start).getTime();
        return event.status !== "cancelled" && time >= start.getTime() && time < addDays(start, 1).getTime();
      });
      const next = nextUpcomingEvent(todays, now);
      if (!next) return { intentType: "answer", message: "Nothing remaining on today's calendar.", actions: [] };
      const row = presentEventRow({
        event: next,
        timezone: tz,
        workout: linkedWorkout(next, context.workouts),
        meeting: linkedMeeting(next, context.meetings),
        selfName: context.profile.displayName,
      });
      return {
        intentType: "answer",
        message: `Next is ${row.title} at ${row.time}. ${row.meta}${row.detail ? ` · ${row.detail}` : ""}.`,
        actions: [
          action({
            kind: "read",
            tool: "getCalendarEvents",
            label: "Next event",
            summary: `${row.title} · ${row.time}`,
          }),
        ],
      };
    }
    return dayOverview(context, intent);
  }

  if (intent.type === "find_time") {
    if (!intent.durationMinutes) {
      return {
        intentType: "clarify",
        message: "How much time do you need?",
        actions: [],
        pending: { ...intent, question: "How much time do you need?" },
      };
    }
    const durationMinutes = intent.durationMinutes;
    const partner = meetingPartnerName(intent);
    const hoursKind =
      intent.sport || /workout|train|yoga|pilates|swim|bike|run/.test(`${intent.eventHint ?? ""} ${intent.title ?? ""}`)
        ? "workout"
        : partner || /meet/.test(intent.eventHint ?? "")
          ? "meeting"
          : "focus";
    const hours = resolveScheduleHours(context.profile, hoursKind);
    const range = clipRangeToNow(resolveSearchRange(intent.when, tz, now, hours), now);
    let end = range.end;
    if (intent.untilHint) {
      const until = findEvent(context, intent.untilHint);
      if (until && new Date(until.start) > range.start) {
        end = new Date(until.start);
      }
    }
    const useWorkingHours =
      !intent.relaxHours &&
      (hoursKind === "workout" || (intent.when?.part !== "morning" && intent.when?.part !== "evening"));
    let windows = findPlanningWindows(context, {
      start: range.start,
      end,
      durationMinutes,
      useWorkingHours,
      hoursKind,
    });
    if (!windows.length && searchMayWiden(intent.when) && intent.when?.week !== "next" && !intent.when?.hour) {
      const rest = clipRangeToNow(resolveSearchRange({ day: intent.when?.day, part: "working", week: intent.when?.week }, tz, now, hours), now);
      windows = findPlanningWindows(context, {
        start: rest.start,
        end: rest.end,
        durationMinutes,
        useWorkingHours: true,
        hoursKind,
      });
    }
    windows = windows.filter((window) => window.minutes >= durationMinutes);
    const choices = durationSlotsFromWindows({
      windows,
      durationMinutes,
      timezone: tz,
      now,
      limit: 3,
      offset: intent.slotOffset ?? 0,
    });
    const title =
      partner ? `Meeting with ${partner}` : intent.title ?? (hoursKind === "workout" ? "Workout" : "Focus block");
    const pending: ModelIntent = {
      ...intent,
      title,
      category: partner ? "meeting" : "focus",
      durationMinutes,
      slotOffset: intent.slotOffset ?? 0,
    };
    if (!choices.length) {
      const diagnosis = diagnoseMissingSlot({
        start: range.start,
        end,
        durationMinutes,
        events: context.events,
        timezone: tz,
        hours,
        useHours: useWorkingHours,
        profile: context.profile,
        workouts: context.workouts,
        kindLabel:
          hoursKind === "meeting" ? "meeting hours" : hoursKind === "workout" ? "workout hours" : "focus hours",
        boundLabel: describeTemporalBound(intent.when?.bound),
        now,
        bufferMinutes: resolveAfterWorkoutBufferMinutes(context.profile),
      });
      return {
        intentType: "find_time",
        message: diagnosis.message,
        actions: [],
        followUps: hasHardTemporalBound(intent.when) ? boundNoSlotFollowUps(intent.when, hoursKind) : [],
        pending,
      };
    }
    const leadingWorkout = context.events
      .filter((event) => isRecognizedWorkout(event, context.workouts))
      .sort((left, right) => left.end.localeCompare(right.end))
      .find((event) => {
        const bufferEnd = new Date(event.end).getTime() + resolveAfterWorkoutBufferMinutes(context.profile) * 60_000;
        return Math.abs(new Date(choices[0]!.start).getTime() - bufferEnd) <= 60_000;
      });
    const bufferNote =
      leadingWorkout
        ? `${describeWorkoutBufferAvailability({
            workout: leadingWorkout,
            bufferMinutes: resolveAfterWorkoutBufferMinutes(context.profile),
            windowStart: choices[0]!.start,
            windowEnd: choices[0]!.end,
            timezone: tz,
          })} `
        : "";
    const durationLead = intent.durationRequested
      ? ""
      : `Suggested duration: ${formatDuration(durationMinutes)}. `;
    const recommended = choices[0]!;
    return {
      intentType: "find_time",
      message: `${durationLead}${bufferNote}How about ${formatRange(recommended.start, recommended.end, tz)}?${selfAvailabilityNote(partner)}`,
      actions: [
        proposeCreateEvent(context, {
          title,
          start: recommended.start,
          end: recommended.end,
          durationMinutes,
          category: partner ? "meeting" : "focus",
          label: partner ? `Suggested meeting` : "Suggested focus block",
        }),
      ],
      choices: choices.map((choice, index) => ({
        ...choice,
        recommended: index === 0,
      })),
      pending,
    };
  }

  if (intent.type === "move_event") {
    if (intent.eventHint === "everything" || intent.eventHint === "all") {
      return {
        intentType: "move_event",
        message: "I cannot move every event to the same time. Atlas keeps one event per slot.",
        actions: [],
      };
    }
    const event = findEvent(context, intent.eventHint, intent.eventId);
    if (!event) {
      return {
        intentType: "clarify",
        message: "Which event should I move?",
        actions: [],
        pending: { type: "move_event", when: intent.when ?? { part: "later" }, question: "Which event should I move?" },
      };
    }
    const duration = eventDurationMinutes(event.start, event.end);
    const exact = resolveExactStart(intent.when, tz, now, new Date(event.start));
    if (exact) {
      const start = exact.toISOString();
      const end = addMinutes(exact, duration).toISOString();
      if (planningConflicts(start, end, others(context, event.id), planning(context))) {
        const choices = alternativeWindows(context, duration, event.id);
        return {
          intentType: "move_event",
          message: `${event.title} cannot move to ${formatClock(start, tz)} — that time conflicts with another event. Here are conflict-free options.`,
          actions: [],
          choices,
          targetEventId: event.id,
        };
      }
      return {
        intentType: "move_event",
        message: `Proposed move: ${event.title} from ${formatClock(event.start, tz)} to ${formatClock(start, tz)}. Nothing has changed yet.`,
        actions: [
          action({
            kind: "propose",
            tool: "updateEvent",
            label: `Move ${event.title}`,
            summary: `${formatClock(event.start, tz)} → ${formatClock(start, tz)}`,
            destinationLabel: eventDestination(event, context).label,
            destination: eventDestination(event, context),
            payload: {
              type: "updateEvent",
              id: event.id,
              patch: { start, end },
              before: event,
            },
          }),
        ],
      };
    }

    const avoid = intent.avoidEventHint ? findEvent(context, intent.avoidEventHint) : undefined;
    const suggestions = suggestMoveWindows({
      event,
      events: context.events,
      timezone: tz,
      workingHours: hoursForEvent(context.profile, event),
      limit: 6,
      after: now,
      ...planning(context),
    }).filter((suggestion) => (avoid ? !tooClose(suggestion.start, suggestion.end, avoid) : true));
    const choices: AssistantChoice[] = suggestions.slice(0, 3).map((suggestion) => ({
      id: `slot:${suggestion.start}`,
      label: suggestion.label,
      start: suggestion.start,
      end: suggestion.end,
    }));
    return {
      intentType: "move_event",
      message: choices.length
        ? `I found ${choices.length} conflict-free option${choices.length === 1 ? "" : "s"}.`
        : "I could not find a conflict-free time to move that event.",
      actions: [],
      choices,
      targetEventId: event.id,
    };
  }

  if (intent.type === "delete_event") {
    const event = findEvent(context, intent.eventHint, intent.eventId);
    if (!event) {
      return {
        intentType: "clarify",
        message: "Which event should I delete?",
        actions: [],
        pending: { type: "delete_event", question: "Which event should I delete?" },
      };
    }
    const destination = eventDestination(event, context);
    return {
      intentType: "delete_event",
      message: `I will delete ${event.title} from ${destination.label}. Nothing has changed yet.`,
      actions: [
        action({
          kind: "propose",
          tool: "deleteEvent",
          label: `Delete ${event.title}`,
          summary: event.source === "google" ? "Remove from Google Calendar" : "Remove from Atlas",
          destinationLabel: destination.label,
          destination,
          payload: { type: "deleteEvent", id: event.id, before: event },
        }),
      ],
    };
  }

  if (intent.type === "create_event") {
    if (!intent.sport && intent.category === "training" && !intent.title) {
      return {
        intentType: "clarify",
        message: "What kind of training — swim, bike, run, or strength?",
        actions: [],
        pending: intent,
      };
    }
    const title = createEventTitle(intent);
    const sport = intent.sport;
    if (sport || intent.category === "training") {
      return fulfillWorkoutCreate(context, intent, now, tz, title, sport);
    }
    const rangeMinutes = rangeDurationMinutes(intent.when);
    if (
      rangeMinutes !== undefined &&
      intent.durationRequested &&
      intent.durationMinutes !== undefined &&
      intent.durationMinutes !== rangeMinutes
    ) {
      return {
        intentType: "clarify",
        message: `You asked for ${formatDuration(rangeMinutes)} from the time range and ${formatDuration(intent.durationMinutes)} as the duration. Which should I use?`,
        actions: [],
        pending: intent,
      };
    }
    const durationMinutes = rangeMinutes ?? intent.durationMinutes ?? 60;
    const exact = resolveExactStart(intent.when, tz, now, now);
    if (exact && isFixedTiming(intent)) {
      const start = exact.toISOString();
      const end = addMinutes(exact, durationMinutes).toISOString();
      if (planningConflicts(start, end, others(context), planning(context))) {
        return {
          intentType: "create_event",
          message: `The requested ${formatRange(start, end, tz)} conflicts with ${describeConflict(start, end, context, tz)}. I will not book over that event, and I will not change that start time. Here are conflict-free options.`,
          actions: [],
          choices: alternativeWindows(context, durationMinutes),
          pending: { ...intent, title, durationMinutes },
        };
      }
      return {
        intentType: "create_event",
        message: proposalAddMessage(title, durationMinutes, start, tz),
        actions: [
          proposeCreateEvent(context, {
            title,
            start,
            end,
            durationMinutes,
            category: intent.category ?? "personal",
            location: intent.location,
          }),
        ],
        pending: { ...intent, title, durationMinutes },
      };
    }
    const when = defaultSearchWhen(intent.when);
    const range = clipRangeToNow(resolveSearchRange(when, tz, now, context.profile.workingHours), now);
    const searchEnd =
      range.end.getTime() <= range.start.getTime() && searchMayWiden(when)
        ? addDays(range.start, 1)
        : range.end;
    const windows = findPlanningWindows(context, {
      start: range.start,
      end: searchEnd,
      durationMinutes,
      useWorkingHours: !intent.relaxHours && (when.part === "working" || !when.part),
    });
    const slot = windows[0];
    if (!slot || searchEnd.getTime() <= range.start.getTime()) {
      const hours = resolveScheduleHours(context.profile, "focus");
      const diagnosis = diagnoseMissingSlot({
        start: range.start,
        end: searchEnd.getTime() <= range.start.getTime() ? range.start : searchEnd,
        durationMinutes,
        events: context.events,
        timezone: tz,
        hours,
        useHours: !intent.relaxHours,
        profile: context.profile,
        workouts: context.workouts,
        kindLabel: "focus hours",
        boundLabel: describeTemporalBound(when.bound),
        now,
      });
      return {
        intentType: "create_event",
        message:
          diagnosis.message ||
          `I could not find a free ${formatDuration(durationMinutes)} window for that. I can try a different day or duration.`,
        actions: [],
        followUps: hasHardTemporalBound(when) ? boundNoSlotFollowUps(when, "focus") : [],
        pending: { ...intent, title, durationMinutes },
      };
    }
    const snapped = firstSnappedSlot(slot.start, slot.end, durationMinutes, tz);
    const start = snapped?.start ?? slot.start;
    const end = snapped?.end ?? addMinutes(new Date(slot.start), durationMinutes).toISOString();
    if (planningConflicts(start, end, others(context), planning(context))) {
      return {
        intentType: "create_event",
        message: "That time conflicts with another event, so I did not propose it.",
        actions: [],
        choices: alternativeWindows(context, durationMinutes),
        pending: { ...intent, title, durationMinutes },
      };
    }
    return {
      intentType: "create_event",
      message: proposalAddMessage(title, durationMinutes, start, tz),
      actions: [
        proposeCreateEvent(context, {
          title,
          start,
          end,
          durationMinutes,
          category: intent.category ?? "personal",
        }),
      ],
      pending: { ...intent, title, durationMinutes },
    };
  }

  if (intent.type === "create_focus_block") {
    const saved = resolveFocusBlockMinutes(context.profile);
    const durationMinutes = intent.durationRequested && intent.durationMinutes
      ? intent.durationMinutes
      : intent.durationMinutes ?? saved.minutes;
    const exact = resolveExactStart(intent.when, tz, now, now);
    if (exact && intent.when?.hour !== undefined) {
      const start = exact.toISOString();
      const end = addMinutes(exact, durationMinutes).toISOString();
      if (planningConflicts(start, end, others(context), planning(context))) {
        return {
          intentType: "create_focus_block",
          message: `A ${formatDuration(durationMinutes)} block starting at ${formatClock(start, tz)} conflicts with another event. Here are open windows instead.`,
          actions: [],
          choices: alternativeWindows(context, durationMinutes),
          pending: { ...intent, durationMinutes, title: intent.title || "Focus block" },
        };
      }
      return {
        intentType: "create_focus_block",
        message: `I recommend protecting ${formatRange(start, end, tz)} as ${indefiniteDurationAdjective(durationMinutes)} focus block.`,
        actions: [
          proposeCreateEvent(context, {
            title: intent.title || "Focus block",
            start,
            end,
            durationMinutes,
            category: "focus",
            description: "Protected deep work.",
            label: "Protect focus block",
          }),
        ],
      };
    }
    const range = clipRangeToNow(
      resolveSearchRange(intent.when ?? { part: "working" }, tz, now, resolveScheduleHours(context.profile, "focus")),
      now,
    );
    const windows = findPlanningWindows(context, {
      start: range.start,
      end: range.end,
      durationMinutes,
      useWorkingHours: true,
      hoursKind: "focus",
    });
    const slot = windows[0];
    if (!slot) {
      const diagnosis = diagnoseMissingSlot({
        start: range.start,
        end: range.end,
        durationMinutes,
        events: context.events,
        timezone: tz,
        hours: resolveScheduleHours(context.profile, "focus"),
        useHours: true,
        profile: context.profile,
        workouts: context.workouts,
        kindLabel: "focus hours",
      });
      return {
        intentType: "create_focus_block",
        message: diagnosis.message,
        actions: [],
        pending: { ...intent, durationMinutes, title: intent.title || "Focus block", durationRequested: intent.durationRequested },
      };
    }
    const snapped = firstSnappedSlot(slot.start, slot.end, durationMinutes, tz);
    const start = snapped?.start ?? slot.start;
    const end = snapped?.end ?? addMinutes(new Date(slot.start), durationMinutes).toISOString();
    const proposed = proposeCreateEvent(context, {
      title: intent.title || "Focus block",
      start,
      end,
      durationMinutes,
      category: "focus",
      description: "Protected deep work.",
      label: "Protect focus block",
    });
    return {
      intentType: "create_focus_block",
      message: `I recommend protecting ${formatRange(start, end, tz)} as ${indefiniteDurationAdjective(durationMinutes)} focus block.`,
      actions: [proposed],
    };
  }

  if (intent.type === "prepare_meeting") {
    const meetingEvent =
      (intent.eventId ? findEvent(context, intent.eventHint, intent.eventId) : undefined) ??
      nextEligibleMeeting(context.events, now, intent.eventHint === "meeting" ? undefined : intent.eventHint);
    if (!meetingEvent) {
      return { intentType: "prepare_meeting", message: "I do not see an upcoming meeting to prepare for.", actions: [] };
    }
    const meeting = linkedMeeting(meetingEvent, context.meetings);
    const prep = buildPreparation({ event: meetingEvent, meeting });
    const prepMinutes = Math.max(meetingEvent.preparationMinutes, 15);
    const prepStart = addMinutes(new Date(meetingEvent.start), -prepMinutes);
    const localNotes = preparationCopy(prep);
    const later = !sameZonedDay(new Date(meetingEvent.start), now, tz);
    const when = later
      ? `${formatShortDay(meetingEvent.start, tz)} at ${formatClock(meetingEvent.start, tz)}`
      : formatClock(meetingEvent.start, tz);
    return {
      intentType: "prepare_meeting",
      message: `${meetingEvent.title} is at ${when}. Set aside ${prepMinutes} minutes using the agenda and notes already on this event.\n${localNotes}${sampleMeetingNote(meetingEvent)}`,
      actions: [
        action({
          kind: "read",
          tool: "getCalendarEvents",
          label: "Meeting details",
          summary: `${meetingEvent.title} · ${formatClock(meetingEvent.start, tz)}`,
        }),
        proposeCreateEvent(context, {
          title: `Prep: ${meetingEvent.title}`,
          start: prepStart.toISOString(),
          end: meetingEvent.start,
          durationMinutes: prepMinutes,
          category: "focus",
          privacy: "private",
          description: prep.sections.flatMap((section) => section.items).join(" · "),
          label: "Schedule preparation",
        }),
      ],
    };
  }

  if (intent.type === "reorganize_day") {
    const stacked = intent.eventHint === "everything" || intent.when?.hour !== undefined;
    const focusHours = resolveScheduleHours(context.profile, "focus");
    const range = resolveSearchRange(
      stacked ? { day: intent.when?.day ?? "tomorrow", part: "working" } : (intent.when ?? { day: "tomorrow", part: "working" }),
      tz,
      now,
      focusHours,
    );
    const dayStart = startOfZonedDay(tz, range.start);
    const dayEnd = addDays(dayStart, 1);
    const list = context.events.filter((event) => {
      if (event.status === "cancelled") return false;
      const start = new Date(event.start).getTime();
      return start >= dayStart.getTime() && start < dayEnd.getTime();
    });
    const existingFocus = list.find((event) => event.category === "focus" && event.status !== "cancelled");
    const saved = resolveFocusBlockMinutes(context.profile);
    const durationMinutes =
      intent.durationRequested && intent.durationMinutes ? intent.durationMinutes : saved.minutes;
    const scheduledTraining = list.some((event) => isRecognizedWorkout(event, context.workouts));
    const priorityNote = trainingPriorityReason(context.profile, scheduledTraining);
    if (existingFocus) {
      return {
        intentType: "reorganize_day",
        message: `${stacked ? "I cannot move every event to the same time. " : ""}Tomorrow already has a focus block from ${formatRange(existingFocus.start, existingFocus.end, tz)}. I would leave existing events as they are.`,
        actions: [
          action({
            kind: "read",
            tool: "getCalendarEvents",
            label: "Tomorrow",
            summary: `${list.length} events`,
          }),
        ],
        pending: { ...intent, durationMinutes, durationRequested: intent.durationRequested },
      };
    }
    const windows = findPlanningWindows(context, {
      start: dayStart,
      end: dayEnd,
      durationMinutes,
      useWorkingHours: true,
      hoursKind: "focus",
    });
    const focus = windows[0];
    if (!focus) {
      const diagnosis = diagnoseMissingSlot({
        start: dayStart,
        end: dayEnd,
        durationMinutes,
        events: context.events,
        timezone: tz,
        hours: focusHours,
        useHours: true,
        profile: context.profile,
        workouts: context.workouts,
        kindLabel: "focus hours",
      });
      return {
        intentType: "reorganize_day",
        message: `${stacked ? "I cannot move every event to the same time. " : ""}${diagnosis.message}${priorityNote ? ` ${priorityNote}` : ""}`,
        actions: [
          action({
            kind: "read",
            tool: "getCalendarEvents",
            label: "Tomorrow",
            summary: `${list.length} events`,
          }),
        ],
        pending: { ...intent, durationMinutes, durationRequested: intent.durationRequested },
      };
    }
    const snapped = firstSnappedSlot(focus.start, focus.end, durationMinutes, tz);
    const blockStart = snapped?.start ?? focus.start;
    const blockEnd = snapped?.end ?? addMinutes(new Date(focus.start), durationMinutes).toISOString();
    const proposed = proposeCreateEvent(context, {
      title: "Focus block",
      start: blockStart,
      end: blockEnd,
      durationMinutes,
      category: "focus",
      description: "Protected deep work.",
      label: "Suggested focus block",
    });
    const durationLead =
      saved.source === "user" || intent.durationRequested
        ? ""
        : `Suggested duration: ${formatDuration(durationMinutes)}. `;
    const existingNote =
      list.length === 0
        ? "Tomorrow has no events yet."
        : `Tomorrow already has ${list.length} event${list.length === 1 ? "" : "s"}. I would leave those in place and add a focus block.`;
    return {
      intentType: "reorganize_day",
      message: `${stacked ? "I cannot move every event to the same time. Atlas keeps one event per slot. " : ""}${durationLead}${existingNote} ${formatRange(blockStart, blockEnd, tz)} is open.${priorityNote ? ` ${priorityNote}` : ""}`,
      actions: [
        action({
          kind: "read",
          tool: "getCalendarEvents",
          label: "Tomorrow",
          summary: `${list.length} events`,
        }),
        proposed,
      ],
      pending: {
        type: "create_focus_block",
        title: "Focus block",
        category: "focus",
        durationMinutes,
        durationRequested: intent.durationRequested,
        when: intent.when ?? { day: "tomorrow" },
      },
    };
  }

  return dayOverview(context, intent);
}

export function actionFromMoveChoice(
  context: AssistantContext,
  eventId: string,
  choice: AssistantChoice,
): AssistantAction | undefined {
  const event = context.events.find((item) => item.id === eventId);
  if (!event) return undefined;
  if (planningConflicts(choice.start, choice.end, others(context, event.id), planning(context))) return undefined;
  return action({
    kind: "propose",
    tool: "updateEvent",
    label: `Move ${event.title}`,
    summary: `${formatClock(event.start, context.timezone)} → ${formatClock(choice.start, context.timezone)}`,
    destinationLabel: eventDestination(event, context).label,
    destination: eventDestination(event, context),
    payload: {
      type: "updateEvent",
      id: event.id,
      patch: { start: choice.start, end: choice.end },
      before: event,
    },
  });
}

export function actionFromCreateChoice(
  context: AssistantContext,
  intent: ModelIntent | undefined,
  choice: AssistantChoice,
): AssistantAction | undefined {
  const durationMinutes =
    intent?.durationMinutes ?? eventDurationMinutes(choice.start, choice.end) ?? 30;
  const start = choice.start;
  const end = choice.end || addMinutes(new Date(choice.start), durationMinutes).toISOString();
  if (planningConflicts(start, end, others(context), planning(context))) return undefined;
  const title = createEventTitle(intent ?? { type: "create_event" });
  const sport = intent?.sport;
  return proposeCreateEvent(context, {
    title,
    start,
    end,
    durationMinutes,
    category: intent?.category ?? (sport ? "training" : intent?.type === "create_focus_block" ? "focus" : "personal"),
    sport,
    description:
      intent?.type === "create_focus_block" || intent?.category === "focus" ? "Protected deep work." : undefined,
    label:
      intent?.type === "create_focus_block" || intent?.category === "focus"
        ? "Suggested focus block"
        : sport || intent?.category === "training"
          ? `Suggested ${title.toLowerCase()}`
          : intent?.category === "meeting"
            ? "Suggested meeting"
            : `Schedule ${title}`,
  });
}

export function eventIdFromHint(context: AssistantContext, hint?: string): string | undefined {
  return findEvent(context, hint)?.id;
}

export function sportTitle(sport: Sport): string {
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}
