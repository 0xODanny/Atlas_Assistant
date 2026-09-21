import type { CalendarEvent } from "../types/event";

const URL_PATTERN = /https?:\/\/[^\s<>"]+/i;
const MEETING_HOST = /meet\.google|zoom\.us|teams\.microsoft|facetime|webex/i;

export function firstUrlIn(text: string): string | undefined {
  const match = text.match(URL_PATTERN);
  return match?.[0];
}

export function eventJoinAction(event: Pick<CalendarEvent, "location" | "description">): {
  href: string;
  label: "Join" | "Open";
} | undefined {
  const href = firstUrlIn(event.location) ?? firstUrlIn(event.description);
  if (!href) return undefined;
  return {
    href,
    label: MEETING_HOST.test(href) || /join/i.test(event.location) ? "Join" : "Open",
  };
}

export function eventPlaceLabel(event: Pick<CalendarEvent, "location">): string | undefined {
  const trimmed = event.location.trim();
  if (!trimmed || URL_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}
