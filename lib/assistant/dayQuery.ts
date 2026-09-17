import type { TimeHint } from "../types/assistant";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function normalizeAssistantText(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").trim();
}

export function isAvailabilityRequest(text: string): boolean {
  const raw = normalizeAssistantText(text);
  if (isMeetingAvailabilityRequest(raw)) return false;
  return /breathing room|how (open|free) is|open working time|remaining (open|free)|how much (open|free) time/.test(
    raw,
  );
}

export function isMeetingAvailabilityRequest(text: string): boolean {
  const raw = normalizeAssistantText(text);
  return (
    /\bwhen can\b.+\bmeet\b/.test(raw) ||
    /\bmeet with\b/.test(raw) ||
    /\bwhen can \w+ and i\b/.test(raw)
  );
}

export function isDayOverviewRequest(text: string): boolean {
  const raw = normalizeAssistantText(text);
  if (isAvailabilityRequest(raw)) return false;
  if (/^find me\b|give me \d+|90 minutes to work|time to (work|train)/.test(raw)) return false;
  return (
    /(what'?s|what is|how does|how is|how'?s).*(day|today|schedule|calendar)/.test(raw) ||
    /day looking|looking like/.test(raw) ||
    /what do i have/.test(raw) ||
    /what'?s on (my )?(calendar|schedule|thursday|friday|saturday|sunday|monday|tuesday|wednesday)/.test(raw) ||
    /what (is|does) (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d+/.test(
      raw,
    )
  );
}

export function calendarDateFromText(text: string): Pick<TimeHint, "year" | "month" | "dayOfMonth"> | undefined {
  const raw = normalizeAssistantText(text);
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), dayOfMonth: Number(iso[3]) };
  }
  const named = raw.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/,
  );
  if (!named) return undefined;
  const month = MONTHS[named[1]];
  const dayOfMonth = Number(named[2]);
  if (!month || dayOfMonth < 1 || dayOfMonth > 31) return undefined;
  return {
    month,
    dayOfMonth,
    year: named[3] ? Number(named[3]) : undefined,
  };
}
