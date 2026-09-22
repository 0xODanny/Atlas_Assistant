import type { ModelIntent } from "../types/assistant";
import type { Sport } from "../types/training";
import { isAvailabilityRequest, isDayOverviewRequest } from "./dayQuery";
import { parseScheduleFromText } from "./parseSchedule";
import { titleFromRequest } from "./title";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").trim();
}

export function sportFromText(text: string): Sport | undefined {
  if (/\bswim/.test(text)) return "swim";
  if (/\bbike|ride/.test(text)) return "bike";
  if (/\brun/.test(text)) return "run";
  if (/\bstrength/.test(text)) return "strength";
  if (/\brecovery/.test(text)) return "recovery";
  return undefined;
}

export function eventHintFromText(text: string): string | undefined {
  if (/\bbike|ride/.test(text)) return "bike";
  if (/\bswim/.test(text)) return "swim";
  if (/\bmarcus|meeting|pepinho/.test(text)) return "meeting";
  if (/\bworkout|training/.test(text)) return "workout";
  return undefined;
}

export function durationFromText(text: string, fallback?: number): number | undefined {
  return parseScheduleFromText(text).durationMinutes ?? fallback;
}

export function classifyIntent(text: string, pending?: ModelIntent): ModelIntent {
  const raw = normalize(text);
  const schedule = parseScheduleFromText(text);
  const sport = sportFromText(raw);
  const when = schedule.when;
  const eventHint = eventHintFromText(raw);
  const spokenDuration = schedule.durationMinutes;

  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  const startsNewRequest =
    /^(schedule|find|move|prepare|reorganize|re-organize|what'?s|what is|give|book|add|put|can i|how much|am i)/.test(raw);

  if (pending && /outside (?:my )?(?:workout |working |focus |meeting )?hours/.test(raw)) {
    return { ...pending, relaxHours: true };
  }
  if (pending && /^try tomorrow\b/.test(raw)) {
    return { ...pending, when: { day: "tomorrow", bound: "tomorrow" }, slotOffset: 0 };
  }
  if (pending && /^try next week\b/.test(raw)) {
    return { ...pending, when: { ...pending.when, week: "next", bound: "week" }, slotOffset: 0 };
  }
  if ((pending?.type === "create_event" || pending?.type === "create_focus_block") && !startsNewRequest) {
    const duration = spokenDuration;
    if (duration || when) {
      return {
        ...pending,
        durationMinutes: duration ?? pending.durationMinutes,
        durationRequested: duration ? true : pending.durationRequested,
        when: when ? { ...pending.when, ...when } : pending.when,
        timingMode: schedule.timingMode ?? pending.timingMode,
        location: schedule.location ?? pending.location,
      };
    }
  }
  if (pending?.type === "find_time" && !startsNewRequest) {
    const duration = spokenDuration;
    if (/more times|more options/.test(raw)) {
      return { ...pending, slotOffset: (pending.slotOffset ?? 0) + 3 };
    }
    if (/next week/.test(raw)) {
      return { ...pending, when: { ...pending.when, week: "next" }, slotOffset: 0 };
    }
    if (duration || when) {
      return {
        ...pending,
        durationMinutes: duration ?? pending.durationMinutes,
        durationRequested: duration ? true : pending.durationRequested,
        when: when ? { ...pending.when, ...when } : pending.when,
        timingMode: schedule.timingMode ?? pending.timingMode,
        location: schedule.location ?? pending.location,
        slotOffset: 0,
      };
    }
  }
  if (pending && !startsNewRequest && wordCount <= 5) {
    const duration = spokenDuration;
    if (pending.type === "create_event" && !pending.sport && sport) {
      return { ...pending, sport, when: pending.when ?? when };
    }
    if (pending.type === "move_event" && (when || eventHint)) {
      return { ...pending, eventHint: pending.eventHint ?? eventHint, when: when ?? pending.when };
    }
    if (pending.type === "clarify" && sport) {
      return { type: "create_event", sport, when: pending.when ?? when, durationMinutes: pending.durationMinutes };
    }
    if (pending.type === "clarify" && duration && /how much time/i.test(pending.question ?? "")) {
      return { type: "find_time", durationMinutes: duration, when: pending.when ?? when };
    }
    if (pending.type === "clarify" && eventHint && /which event/i.test(pending.question ?? "")) {
      return { type: "move_event", eventHint, when: pending.when ?? when ?? { part: "later" } };
    }
  }

  if (/\bweather\b|\brain\b|\bforecast\b/.test(raw)) {
    return { type: "answer", capability: "weather" };
  }
  if (/last meeting|what happened|meeting memory|transcript|what did we (decide|discuss)/.test(raw)) {
    return { type: "answer", capability: "memory" };
  }
  if (/prepare/.test(raw)) {
    return { type: "prepare_meeting", eventHint };
  }
  if (/reorganize|re-organize|reshuffle/.test(raw)) {
    return { type: "reorganize_day", when: when ?? { day: "tomorrow" } };
  }
  if (/\bmove\b/.test(raw) && /everything|every event|all events/.test(raw)) {
    return { type: "reorganize_day", when: when ?? { hour: 12 }, eventHint: "everything" };
  }
  if (/\bmove\b/.test(raw) && (eventHint || /event|workout|ride|meeting/.test(raw))) {
    const avoid = /too close|away from|not (near|next to)/.test(raw)
      ? eventHintFromText(raw.replace(/bike|ride/, ""))
      : undefined;
    return {
      type: "move_event",
      eventHint,
      when,
      avoidEventHint: /swim/.test(raw) && eventHint !== "swim" ? "swim" : avoid,
    };
  }
  if (/\bmove\b/.test(raw) && /\bit\b|later|this/.test(raw)) {
    return { type: "move_event", when: when ?? { part: "later" } };
  }
  if (/\bmove\b/.test(raw)) {
    const named = raw
      .replace(/^.*\bmove(?:\s+my)?\s+/, "")
      .replace(/\s+to\s+.*$/, "")
      .replace(/\s+later.*$/, "")
      .trim();
    if (named && named !== "it") {
      return { type: "move_event", eventHint: eventHint ?? named, when: when ?? { part: "later" } };
    }
  }
  if (/\bdelete\b/.test(raw)) {
    const named = raw.replace(/^.*\bdelete(?:\s+the|\s+my)?\s+/, "").replace(/\s+event\s*$/, "").trim();
    return { type: "delete_event", eventHint: named || eventHint };
  }
  if (/schedule|add|book/.test(raw) && /train/.test(raw) && !sport) {
    return {
      type: "clarify",
      question: "What kind of training — swim, bike, run, or strength?",
      when,
      durationMinutes: spokenDuration ?? 60,
    };
  }
  if (
    (/schedule|add|book|put/.test(raw) || (schedule.timingMode === "fixed" && schedule.when?.hour !== undefined)) &&
    (sport || /swim|bike|run|workout|yoga|pilates|training/.test(raw))
  ) {
    const named = titleFromRequest(text);
    return {
      type: "create_event",
      sport: sport ?? (/yoga|pilates/.test(raw) ? undefined : "swim"),
      category: "training",
      when: when ?? (/tomorrow/.test(raw) ? { day: "tomorrow", bound: "tomorrow" } : undefined),
      durationMinutes: spokenDuration ?? schedule.rangeMinutes,
      durationRequested: Boolean(spokenDuration ?? schedule.rangeMinutes),
      timingMode: schedule.timingMode,
      location: schedule.location,
      title: named ?? (sport === "bike" ? "Bike" : sport === "run" ? "Run" : sport === "strength" ? "Strength" : sport === "recovery" ? "Recovery" : /yoga/.test(raw) ? "Yoga" : /pilates/.test(raw) ? "Pilates" : "Swim"),
    };
  }
  if (/\b(schedule|add|book|create|put)\b/.test(raw) && !/train/.test(raw)) {
    const named = titleFromRequest(text);
    const meetingRequested = /\bmeeting\b/.test(raw);
    return {
      type: "create_event",
      title: named ?? (meetingRequested ? "Meeting" : undefined),
      when: when ?? (/tomorrow/.test(raw) ? { day: "tomorrow", bound: "tomorrow" } : undefined),
      durationMinutes: spokenDuration,
      durationRequested: Boolean(spokenDuration),
      timingMode: schedule.timingMode,
      location: schedule.location,
      category: meetingRequested ? "meeting" : "personal",
    };
  }
  if (/some work time|some time to work|a bit of (work )?time|give me some (work )?time/.test(raw) && !spokenDuration) {
    return {
      type: "clarify",
      question: "How much time do you need?",
      when,
    };
  }
  if (/three hours|3 hours|deep work|focus|work on pepinho/.test(raw) && /give|block|protect|work on|nobody bothers/.test(raw)) {
    return {
      type: "create_focus_block",
      durationMinutes: spokenDuration ?? 180,
      when: when ?? { part: "working" },
      timingMode: schedule.timingMode,
      title: /pepinho/.test(raw) ? "Pepinho focus" : "Focus block",
    };
  }
  if (
    /find|give|block|when.*(free|meet|time)|90 minutes|can i (swim|train|bike)|time to train|before marcus/.test(raw)
  ) {
    return {
      type: "find_time",
      durationMinutes: spokenDuration ?? (/marcus|meet/.test(raw) ? 45 : /train|swim|bike|workout|yoga|pilates/.test(raw) ? 60 : 90),
      durationRequested: Boolean(spokenDuration),
      when: when ?? { part: "working" },
      timingMode: schedule.timingMode ?? "search",
      location: schedule.location,
      untilHint: /before marcus|before the meeting/.test(raw) ? "marcus" : undefined,
      eventHint: /marcus/.test(raw) ? "marcus" : eventHint ?? (/yoga/.test(raw) ? "yoga" : /workout/.test(raw) ? "workout" : undefined),
      title: /yoga/.test(raw) ? "Yoga" : /pilates/.test(raw) ? "Pilates" : undefined,
    };
  }
  if (/next meeting/.test(raw) && !/prepare/.test(raw)) return { type: "answer", topic: "next_meeting" };
  if (/next workout|anything athletic|athletic next/.test(raw)) return { type: "answer", topic: "next_workout" };
  if (isAvailabilityRequest(raw)) return { type: "answer", topic: "open_time" };
  if (/training goal|what am i training/.test(raw)) return { type: "answer", topic: "training_goal" };
  if (isDayOverviewRequest(raw) || /(what'?s|what is|how does|how is).*(day|today)|day looking|what'?s next/.test(raw)) {
    if (/next/.test(raw) && !/day/.test(raw) && !isDayOverviewRequest(raw)) {
      return { type: "answer", topic: "next" };
    }
    return { type: "answer", topic: "day", when };
  }

  return { type: "answer", topic: "day" };
}
