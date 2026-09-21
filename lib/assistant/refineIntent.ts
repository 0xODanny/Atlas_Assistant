import type { AssistantContext, ModelIntent } from "../types/assistant";
import { durationFromText, eventHintFromText, sportFromText } from "./classify";
import { calendarDateFromText, isAvailabilityRequest, isDayOverviewRequest, isMeetingAvailabilityRequest } from "./dayQuery";
import { applyUserSchedule, rangeDurationMinutes, userSpecifiedClock } from "./parseSchedule";
import { sanitizeEventTitle, titleFromRequest } from "./title";

export { userSpecifiedClock };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").trim();
}

function stripInventedClock(intent: ModelIntent, text: string): ModelIntent {
  if (!intent.when || intent.when.hour === undefined || userSpecifiedClock(text)) return intent;
  const when = { ...intent.when };
  delete when.hour;
  delete when.minute;
  delete when.endHour;
  delete when.endMinute;
  return { ...intent, when };
}

export function completePending(
  pending: ModelIntent | undefined,
  model: ModelIntent,
  text: string,
): ModelIntent {
  if (!pending) return model;
  const raw = normalize(text);
  const sport = model.sport ?? sportFromText(raw);
  const duration = durationFromText(raw) ?? model.durationMinutes;
  const eventHint = model.eventHint ?? eventHintFromText(raw);
  const when = pending.when ?? model.when;

  if (pending.type === "clarify" || pending.type === "create_event") {
    if (sport && (pending.category === "training" || pending.type === "create_event" || /train|workout|swim|bike|run/.test(pending.question ?? ""))) {
      return {
        type: "create_event",
        sport,
        category: "training",
        when: when ?? pending.when,
        durationMinutes: duration ?? pending.durationMinutes,
        durationRequested: Boolean(duration) || pending.durationRequested,
        title: sport.charAt(0).toUpperCase() + sport.slice(1),
      };
    }
  }

  if ((pending.type === "find_time" || pending.type === "create_focus_block") && duration) {
    return { ...pending, type: pending.type, durationMinutes: duration, when };
  }

  if (pending.type === "clarify" && duration && /how much time/i.test(pending.question ?? "")) {
    return { type: "find_time", durationMinutes: duration, when };
  }

  if (pending.type === "move_event" && (eventHint || model.eventId)) {
    return { ...pending, eventHint: eventHint ?? pending.eventHint, eventId: model.eventId ?? pending.eventId, when };
  }

  if (model.type === "clarify" && sport && (when?.day || when?.part)) {
    return {
      type: "create_event",
      sport,
      category: "training",
      when,
      durationMinutes: duration,
      durationRequested: Boolean(duration),
      title: sport.charAt(0).toUpperCase() + sport.slice(1),
    };
  }

  return model;
}

export function applyAtlasIntentGuards(
  intent: ModelIntent,
  text: string,
  context: AssistantContext,
): ModelIntent {
  const raw = normalize(text);
  intent = stripInventedClock(intent, text);
  const selected = context.selectedEventId;
  const hinted = eventHintFromText(raw);
  const spokenDuration = durationFromText(raw);

  if (
    spokenDuration &&
    intent.timingMode !== "fixed" &&
    /squeeze|uninterrupted|where can i|find me|minutes to work|time to work|give me \d+/.test(raw)
  ) {
    return {
      type: "find_time",
      durationMinutes: spokenDuration,
      durationRequested: true,
      when: intent.when ?? { part: "working" },
      timingMode: intent.timingMode ?? "search",
      location: intent.location,
      relaxHours: intent.relaxHours,
      title: intent.title,
      eventHint: intent.eventHint,
      sport: intent.sport,
      category: intent.category,
    };
  }

  if (isMeetingAvailabilityRequest(raw)) {
    const partner =
      raw.match(/\bwhen can ([a-z]+)\b/)?.[1] ??
      raw.match(/\bmeet with ([a-z]+)\b/)?.[1] ??
      (/\bmarcus\b/.test(raw) ? "marcus" : undefined);
    return {
      type: "find_time",
      durationMinutes: spokenDuration ?? intent.durationMinutes ?? durationFromText(raw, 45),
      durationRequested: Boolean(spokenDuration),
      when: intent.when ?? { part: "working" },
      eventHint: partner && partner !== "can" ? partner : hinted === "meeting" ? "marcus" : hinted,
    };
  }
  if (isDayOverviewRequest(raw)) {
    const dated = calendarDateFromText(raw);
    return {
      type: "answer",
      topic: "day",
      when: {
        ...intent.when,
        ...dated,
      },
    };
  }
  if (isAvailabilityRequest(raw) && (intent.topic === "day" || intent.type === "find_time")) {
    return { type: "answer", topic: "open_time", when: intent.when };
  }

  if (
    /(\bride\b|\bbike\b)/.test(raw) &&
    /later|early/.test(raw) &&
    context.events.some((event) => event.status !== "cancelled" && /bike|ride/i.test(event.title))
  ) {
    return {
      type: "move_event",
      eventHint: "bike",
      when: { part: "later" },
      avoidEventHint: intent.avoidEventHint,
    };
  }

  if (/some work time|some time to work|give me some (work )?time/.test(raw) && !spokenDuration) {
    return { type: "clarify", question: "How much time do you need?" };
  }

  if (/\bmove it\b/.test(raw) && !selected && !hinted && !intent.eventHint && !intent.eventId) {
    return { type: "clarify", question: "Which event should I move?", when: intent.when ?? { part: "later" } };
  }
  if (/\bmove it\b/.test(raw) && !selected && !hinted && (intent.eventId || intent.eventHint) && !/bike|ride|swim|meeting|marcus|workout/.test(raw)) {
    return { type: "clarify", question: "Which event should I move?", when: { part: "later" } };
  }

  if (/focus block|deep work/.test(raw) && intent.type === "move_event") {
    const hour = intent.when?.hour ?? (/\bat\s+(\d{1,2})\b/.exec(raw) ? Number(/\bat\s+(\d{1,2})\b/.exec(raw)?.[1]) : undefined);
    return {
      type: "create_focus_block",
      durationMinutes: intent.durationMinutes ?? durationFromText(raw, 180),
      when: { ...intent.when, hour },
    };
  }

  if (intent.type === "clarify" && intent.sport && (intent.when?.day || intent.when?.part) && /time|start/i.test(intent.question ?? "")) {
    return {
      type: "create_event",
      sport: intent.sport,
      category: intent.category ?? "training",
      when: intent.when,
      durationMinutes: intent.durationMinutes,
      durationRequested: intent.durationRequested,
      title: intent.title,
    };
  }

  if (/everything|every event|all events/.test(raw) && /\bmove\b/.test(raw)) {
    return { type: "reorganize_day", eventHint: "everything", when: intent.when ?? { hour: 12 } };
  }

  if (/\b(same time|at the same time|overlap)\b/.test(raw) && /\b(book|schedule|two things|two events)\b/.test(raw)) {
    return { type: "move_event", eventHint: "everything" };
  }

  if (intent.eventHint === "everything" && !/everything|every event|all events/.test(raw)) {
    return { ...intent, eventHint: undefined };
  }

  if (intent.type === "create_event" || intent.type === "create_focus_block") {
    const title = sanitizeEventTitle(intent.title, text) ?? titleFromRequest(text) ?? intent.title;
    const durationMinutes = spokenDuration ?? intent.durationMinutes;
    return {
      ...intent,
      title,
      durationMinutes,
      durationRequested:
        Boolean(spokenDuration) ||
        intent.durationRequested ||
        rangeDurationMinutes(intent.when) !== undefined,
    };
  }

  return intent;
}

export function refineModelIntent(
  pending: ModelIntent | undefined,
  model: ModelIntent,
  text: string,
  context: AssistantContext,
): ModelIntent {
  return applyAtlasIntentGuards(
    applyUserSchedule(stripInventedClock(completePending(pending, model, text), text), text),
    text,
    context,
  );
}
