import { calendarDateFromText } from "./dayQuery";
import type { ModelIntent, TemporalBound, TimeHint, TimingMode } from "../types/assistant";

export type ParsedSchedule = {
  timingMode?: TimingMode;
  when?: TimeHint;
  durationMinutes?: number;
  durationRequested?: boolean;
  location?: string;
  rangeMinutes?: number;
};

type DurationHit = {
  minutes: number;
  start: number;
  end: number;
};

type ClockHit = {
  index: number;
  end: number;
  rawHour: number;
  hour: number;
  minute: number;
  mer?: "am" | "pm";
  prep?: string;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const WORD_HOURS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

const DURATION_PATTERNS: Array<{
  re: RegExp;
  minutes: (match: RegExpExecArray) => number | undefined;
}> = [
  {
    re: /duration(?:\s+is)?\s+(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min)\b/gi,
    minutes: (match) => unitToMinutes(Number(match[1]), match[2]),
  },
  {
    re: /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min)\s+long\b/gi,
    minutes: (match) => unitToMinutes(Number(match[1]), match[2]),
  },
  {
    re: /\ban?\s+(\d+)[-\s]*(hours?|hrs?|h|minutes?|mins?|min)\b/gi,
    minutes: (match) => unitToMinutes(Number(match[1]), match[2]),
  },
  {
    re: /\bfor\s+(\d+)\s*(hours?|hrs?|h|minutes?|mins?|min)\b/gi,
    minutes: (match) => unitToMinutes(Number(match[1]), match[2]),
  },
  {
    re: /(\d+)[-\s]*(minutes?|mins?|min)\b/gi,
    minutes: (match) => Number(match[1]),
  },
  {
    re: /(\d+)\s+hours?\b/gi,
    minutes: (match) => Number(match[1]) * 60,
  },
  {
    re: /(\d+)[-\s]*(hours?|hrs?)\b/gi,
    minutes: (match) => Number(match[1]) * 60,
  },
];

const CLOCK_RE =
  /(?<![a-z0-9])(?:(at|from|after|around|by)\s+)?(\d{1,2})(?::(\d{2})|\.(\d{2})|h(\d{0,2}))?(?:\s*(a\.?m\.?|p\.?m\.?))?(?![a-z0-9])/gi;

const RANGE_GAP = /^\s*(?:to|until|through|–|—|-)\s*$/;

function unitToMinutes(value: number, unit: string): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return unit.toLowerCase().startsWith("h") ? value * 60 : value;
}

function normalizeMer(value: string): "am" | "pm" {
  return value.replace(/\./g, "").toLowerCase().startsWith("p") ? "pm" : "am";
}

function applyMeridiem(hour: number, mer?: "am" | "pm"): number {
  if (mer === "pm" && hour < 12) return hour + 12;
  if (mer === "am" && hour === 12) return 0;
  return hour;
}

function maskSpans(text: string, spans: Array<{ start: number; end: number }>): string {
  if (!spans.length) return text;
  const chars = text.split("");
  for (const span of spans) {
    for (let index = span.start; index < span.end && index < chars.length; index += 1) {
      chars[index] = " ";
    }
  }
  return chars.join("");
}

function collectDurations(text: string): DurationHit[] {
  const hits: DurationHit[] = [];
  if (/hour and a half|hour-and-a-half/.test(text)) {
    const match = text.match(/hour and a half|hour-and-a-half/i);
    if (match?.index != null) {
      hits.push({ minutes: 90, start: match.index, end: match.index + match[0].length });
    }
  }

  for (const pattern of DURATION_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const minutes = pattern.minutes(match);
      if (minutes === undefined) continue;
      const overlapping = hits.some((hit) => match!.index < hit.end && match!.index + match![0].length > hit.start);
      if (overlapping) continue;
      hits.push({ minutes, start: match.index, end: match.index + match[0].length });
    }
  }

  const word = text.match(/\b(one|two|three|four|five)\b/);
  if (word && word.index != null && /hour|hr|make it|actually/.test(text)) {
    const overlapping = hits.some((hit) => word.index! < hit.end && word.index! + word[0].length > hit.start);
    if (!overlapping) {
      hits.push({
        minutes: WORD_HOURS[word[1]] * 60,
        start: word.index,
        end: word.index + word[0].length,
      });
    }
  }

  return hits.sort((left, right) => left.start - right.start);
}

function parseClockHits(text: string): ClockHit[] {
  const hits: ClockHit[] = [];
  const re = new RegExp(CLOCK_RE.source, CLOCK_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const rawHour = Number(match[2]);
    if (!Number.isFinite(rawHour) || rawHour > 23) continue;
    const colon = match[3];
    const dot = match[4];
    const compact = match[5];
    const merRaw = match[6];
    const prep = match[1]?.toLowerCase();
    const minute = Number(colon ?? dot ?? (compact != null && compact !== "" ? compact : "0"));
    if (!Number.isFinite(minute) || minute > 59) continue;
    const mer = merRaw ? normalizeMer(merRaw) : undefined;
    const explicit = colon != null || dot != null || compact != null || Boolean(mer) || Boolean(prep) || rawHour >= 13;
    if (!explicit) continue;
    hits.push({
      index: match.index,
      end: match.index + match[0].length,
      rawHour,
      hour: applyMeridiem(rawHour, mer),
      minute,
      mer,
      prep,
    });
  }
  return hits;
}

function applyEveningHeuristic(text: string, hits: ClockHit[]): void {
  if (!/\btonight\b|\bthis evening\b/.test(text)) return;
  for (const hit of hits) {
    if (!hit.mer && hit.rawHour >= 1 && hit.rawHour <= 11) {
      hit.hour = hit.rawHour + 12;
    }
  }
}

function pairRange(text: string, hits: ClockHit[]): { start: ClockHit; end: ClockHit } | undefined {
  for (let index = 0; index < hits.length - 1; index += 1) {
    const start = hits[index];
    const end = hits[index + 1];
    const gap = text.slice(start.end, end.index);
    if (!RANGE_GAP.test(gap)) continue;
    if (!start.mer && end.mer) {
      start.hour = applyMeridiem(start.rawHour, end.mer);
      start.mer = end.mer;
    }
    if (start.mer && !end.mer) {
      end.hour = applyMeridiem(end.rawHour, start.mer);
      end.mer = start.mer;
    }
    return { start, end };
  }
  return undefined;
}

function inferTimingMode(text: string, hits: ClockHit[], ranged: boolean): TimingMode | undefined {
  const search =
    /\b(find(?:\s+me)?|when can i|sometime|anytime|what time can i|where can i)\b/.test(text) ||
    /\bschedule\b.+\b(sometime|anytime|whenever)\b/.test(text) ||
    /\b(recommend|suggest)\b/.test(text) ||
    /\bgood time\b|\bbest time\b/.test(text);
  const around =
    hits.some((hit) => hit.prep === "around") || /\b(around|approximately|preferably|\bish\b)\b/.test(text);
  const after = hits.some((hit) => hit.prep === "after") || /\bafter\b/.test(text);
  const pinned = ranged || hits.some((hit) => hit.prep === "at" || hit.prep === "from" || hit.prep === "by");

  if (pinned) return around ? "flexible" : "fixed";
  if (around) return "flexible";
  if (search || after) return hits.length || search ? "search" : undefined;
  if (hits.length) return "fixed";
  return undefined;
}

function whenFromParts(text: string, start?: ClockHit, end?: ClockHit): TimeHint | undefined {
  const when: TimeHint = {};
  if (/\btonight\b/.test(text)) {
    when.day = "today";
    when.part = "evening";
    when.bound = "tonight";
  } else if (/\btomorrow/.test(text)) {
    when.day = "tomorrow";
    when.bound = "tomorrow";
  } else if (/\btoday/.test(text)) {
    when.day = "today";
    when.bound = "today";
  }

  if (when.bound !== "tonight" && (/\bthis evening\b/.test(text) || /\bevening/.test(text))) {
    when.part = "evening";
    if (!when.bound) when.bound = "evening";
    if (!when.day && /\bthis evening\b/.test(text)) when.day = "today";
  } else if (/\bafternoon/.test(text)) {
    when.part = "afternoon";
    if (!when.bound) when.bound = "afternoon";
    if (!when.day && /\bthis afternoon\b/.test(text)) when.day = "today";
  } else if (/\bmorning/.test(text)) {
    when.part = "morning";
    if (!when.bound) when.bound = "morning";
    if (!when.day && /\bthis morning\b/.test(text)) when.day = "today";
  } else if (/\blater/.test(text) && !when.part) {
    when.part = "later";
  }

  const weekday = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekday && !when.bound) {
    when.day = "weekday";
    when.weekday = WEEKDAYS.indexOf(weekday[1] as (typeof WEEKDAYS)[number]) as TimeHint["weekday"];
    when.bound = "weekday";
  }
  if (/\bthis week\b/.test(text) && !when.bound) {
    when.week = "this";
    when.bound = "week";
  } else if (/\bnext week\b/.test(text) && !when.bound) {
    when.week = "next";
    when.bound = "week";
  }

  const dated = calendarDateFromText(text);
  if (dated) {
    when.month = dated.month;
    when.dayOfMonth = dated.dayOfMonth;
    if (dated.year) when.year = dated.year;
    if (!when.bound) when.bound = "date";
  }
  if (start) {
    when.hour = start.hour;
    when.minute = start.minute;
  }
  if (end) {
    when.endHour = end.hour;
    when.endMinute = end.minute;
  }
  return Object.keys(when).length ? when : undefined;
}

export function hasHardTemporalBound(when?: TimeHint): boolean {
  return Boolean(when?.bound);
}

export function searchMayWiden(when?: TimeHint): boolean {
  return !hasHardTemporalBound(when);
}

export function defaultSearchWhen(when?: TimeHint): TimeHint {
  if (
    when &&
    (when.bound ||
      when.day ||
      when.part ||
      when.weekday !== undefined ||
      when.week ||
      when.month ||
      when.dayOfMonth)
  ) {
    return when;
  }
  return { day: "tomorrow" };
}

export function describeTemporalBound(bound?: TemporalBound): string {
  if (bound === "tonight") return "tonight";
  if (bound === "today") return "today";
  if (bound === "tomorrow") return "tomorrow";
  if (bound === "evening") return "this evening";
  if (bound === "afternoon") return "this afternoon";
  if (bound === "morning") return "this morning";
  if (bound === "week") return "this week";
  if (bound === "weekday") return "that day";
  if (bound === "date") return "that date";
  return "that window";
}

export function locationFromText(text: string): string | undefined {
  const match = text.match(
    /\bat\s+(?!(?:\d{1,2}(?::\d{2}|\.\d{2}|h\d{0,2})?(?:\s*(?:a\.?m\.?|p\.?m\.?))?)\b)(?!noon|midnight|tonight|the\s+same\b)([^,.;]+?)(?=\s+(?:for\s+(?:today|tomorrow)|from\s+\d|today|tomorrow|duration|tonight|\d{1,2}\s*(?::|h|a\.?m|p\.?m))|\s*$|[,.])/i,
  );
  const place = match?.[1]?.replace(/\s+(?:for|from)$/i, "").trim();
  if (!place || /^\d/.test(place)) return undefined;
  return place.slice(0, 64);
}

export function parseScheduleFromText(text: string): ParsedSchedule {
  const raw = text.toLowerCase().replace(/[’']/g, "'");
  const durations = collectDurations(raw);
  const clocks = parseClockHits(maskSpans(raw, durations));
  applyEveningHeuristic(raw, clocks);
  const range = pairRange(raw, clocks);
  const start = range?.start ?? clocks[0];
  const end = range?.end;
  const when = whenFromParts(raw, start, end);
  const durationMinutes = durations[0]?.minutes;
  const rangeMinutes =
    start && end ? end.hour * 60 + end.minute - (start.hour * 60 + start.minute) : undefined;
  const location = locationFromText(text);

  return {
    timingMode: inferTimingMode(raw, clocks, Boolean(range)),
    when,
    durationMinutes,
    durationRequested: durationMinutes !== undefined,
    location,
    rangeMinutes: rangeMinutes !== undefined && rangeMinutes > 0 ? rangeMinutes : undefined,
  };
}

export function userSpecifiedClock(text: string): boolean {
  return parseScheduleFromText(text).when?.hour !== undefined;
}

export function isFixedTiming(intent: Pick<ModelIntent, "timingMode" | "when">): boolean {
  if (intent.when?.hour === undefined) return false;
  if (intent.timingMode === "search" || intent.timingMode === "flexible") return false;
  return true;
}

export function rangeDurationMinutes(when?: TimeHint): number | undefined {
  if (when?.hour === undefined || when.endHour === undefined) return undefined;
  const minutes = when.endHour * 60 + (when.endMinute ?? 0) - (when.hour * 60 + (when.minute ?? 0));
  return minutes > 0 ? minutes : undefined;
}

export function applyUserSchedule(intent: ModelIntent, text: string): ModelIntent {
  const parsed = parseScheduleFromText(text);
  const next: ModelIntent = { ...intent };
  if (parsed.when) {
    next.when = { ...intent.when, ...parsed.when };
  }
  if (parsed.timingMode) next.timingMode = parsed.timingMode;
  if (parsed.durationMinutes !== undefined) {
    next.durationMinutes = parsed.durationMinutes;
    next.durationRequested = true;
  } else if (parsed.rangeMinutes !== undefined && next.durationMinutes === undefined) {
    next.durationMinutes = parsed.rangeMinutes;
    next.durationRequested = true;
  }
  if (parsed.location) next.location = parsed.location;
  if (parsed.when?.hour === undefined && intent.when?.hour !== undefined && !userSpecifiedClock(text)) {
    const when = { ...next.when };
    delete when.hour;
    delete when.minute;
    delete when.endHour;
    delete when.endMinute;
    next.when = Object.keys(when).length ? when : undefined;
  }
  return next;
}
