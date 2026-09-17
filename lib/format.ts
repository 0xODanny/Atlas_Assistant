import { addDays, minutesBetween, pad, sameZonedDay, startOfZonedDay, zonedParts } from "./time";
import type { CalendarEvent } from "./types/event";

export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDayHeading(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(date);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone,
  }).format(date);
  return `${weekday}, ${monthDay}`;
}

export function formatShortDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatWeekdayMonthDay(iso: string, timeZone: string): string {
  return formatShortDay(iso, timeZone).replace(",", "");
}

export function formatRelativeDayDate(iso: string, timeZone: string, now: Date): string {
  const date = formatWeekdayMonthDay(iso, timeZone);
  if (sameZonedDay(now, new Date(iso), timeZone)) return `Today, ${date}`;
  if (sameZonedDay(addDays(startOfZonedDay(timeZone, now), 1), new Date(iso), timeZone)) {
    return `Tomorrow, ${date}`;
  }
  return date;
}

export function formatSuggestionSlot(startIso: string, endIso: string, timeZone: string, now: Date): string {
  return `${formatRelativeDayDate(startIso, timeZone, now)} · ${formatRange(startIso, endIso, timeZone)}`;
}

export function formatTimezoneLabel(timeZone: string, now: Date): string {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  return short ? `${timeZone} (${short})` : timeZone;
}

export function formatScheduledEventWhen(
  event: Pick<CalendarEvent, "allDay" | "start" | "end">,
  timeZone: string,
  now: Date,
): string {
  const when = event.allDay
    ? `${formatRelativeDayDate(event.start, timeZone, now)} · ${formatAllDayLabel(event.start, event.end, timeZone)}`
    : `${formatRelativeDayDate(event.start, timeZone, now)} · ${formatRange(event.start, event.end, timeZone)}`;
  const inProgress = !event.allDay && now.getTime() >= new Date(event.start).getTime() && now.getTime() < new Date(event.end).getTime();
  return inProgress ? `${when} · In progress` : when;
}

export function formatRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatClock(startIso, timeZone)}–${formatClock(endIso, timeZone)}`;
}

export function formatClockNatural(iso: string, timeZone: string): string {
  const { hour, minute } = zonedParts(timeZone, new Date(iso));
  const mer = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 || 12;
  if (minute === 0) return `${hour12} ${mer}`;
  return `${hour12}:${pad(minute)} ${mer}`;
}

export function formatRangeNatural(startIso: string, endIso: string, timeZone: string): string {
  const start = zonedParts(timeZone, new Date(startIso));
  const end = zonedParts(timeZone, new Date(endIso));
  const startMer = start.hour < 12 ? "AM" : "PM";
  const endMer = end.hour < 12 ? "AM" : "PM";
  const startHour12 = start.hour % 12 || 12;
  const endHour12 = end.hour % 12 || 12;
  const startClock = start.minute === 0 ? `${startHour12}` : `${startHour12}:${pad(start.minute)}`;
  const endClock = end.minute === 0 ? `${endHour12}` : `${endHour12}:${pad(end.minute)}`;
  if (startMer === endMer) return `${startClock}–${endClock} ${endMer}`;
  return `${startClock} ${startMer}–${endClock} ${endMer}`;
}

export function allDaySpanDays(startIso: string, endIso: string, timeZone: string): number {
  const start = startOfZonedDay(timeZone, new Date(startIso));
  const end = startOfZonedDay(timeZone, new Date(endIso));
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  return days;
}

export function formatAllDayLabel(startIso: string, endIso: string, timeZone: string): string {
  const days = allDaySpanDays(startIso, endIso, timeZone);
  return days <= 1 ? "All day" : `${days}-day event`;
}

export function formatAllDayRange(startIso: string, endIso: string, timeZone: string): string {
  const days = allDaySpanDays(startIso, endIso, timeZone);
  if (days <= 1) return "All day";
  const start = new Date(startIso);
  const last = addDays(startOfZonedDay(timeZone, new Date(endIso)), -1);
  const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone }).format(last);
  const endDay = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone }).format(last);
  const startMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone }).format(start);
  const endLabel = startMonth === endMonth ? endDay : `${endMonth} ${endDay}`;
  return `${startLabel}–${endLabel}`;
}

export function formatEventWhen(event: Pick<CalendarEvent, "allDay" | "start" | "end">, timeZone: string): string {
  return event.allDay ? formatAllDayLabel(event.start, event.end, timeZone) : formatClock(event.start, timeZone);
}

/** Always minutes: "60 minutes". Use for workout and event details. */
export function formatDurationMinutes(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Hour-aware descriptive durations: "1 hour", "3 hours", "45 minutes". */
export function formatDuration(minutes: number): string {
  if (minutes % 60 === 0 && minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return formatDurationMinutes(minutes);
}

/** Compact event-row durations: "60 min". */
export function formatMinutesShort(minutes: number): string {
  return `${minutes} min`;
}

/** Adjectival duration: "3-hour", "45-minute". */
export function formatDurationAdjective(minutes: number): string {
  if (minutes % 60 === 0) {
    return `${minutes / 60}-hour`;
  }
  return `${minutes}-minute`;
}

export function indefiniteDurationAdjective(minutes: number): string {
  return `a ${formatDurationAdjective(minutes)}`;
}

export function formatOpenHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 10) return `${Math.round(hours)} hours`;
  const rounded = Math.round(hours * 2) / 2;
  return `${rounded} hours`;
}

export function formatCompactHours(minutes: number): string {
  const hours = minutes / 60;
  const rounded = hours >= 10 ? Math.round(hours) : Math.round(hours * 2) / 2;
  return `${rounded}h`;
}

export function greetingForNow(nowIso: string, timeZone: string, name: string): string {
  const hour = zonedParts(timeZone, new Date(nowIso)).hour;
  const first = name.split(" ")[0] || name;
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export function greetingOnly(nowIso: string, timeZone: string): string {
  const hour = zonedParts(timeZone, new Date(nowIso)).hour;
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function eventDurationMinutes(start: string, end: string): number {
  return Math.max(0, minutesBetween(new Date(start), new Date(end)));
}

export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function formatStartsIn(now: Date, startIso: string, timeZone: string): string | null {
  const start = new Date(startIso);
  if (!sameZonedDay(now, start, timeZone)) return null;
  const minutes = minutesBetween(now, start);
  if (minutes < 0) return null;
  if (minutes === 0) return "Starting now";
  if (minutes < 60) return `Starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "Starts in 1 hour" : `Starts in ${hours} hours`;
  return `Starts in ${hours}h ${rest}m`;
}

export function formatEventTiming(
  now: Date,
  startIso: string,
  endIso: string,
  timeZone: string,
  allDay = false,
): string | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (now.getTime() < start.getTime()) {
    return allDay ? formatAllDayLabel(startIso, endIso, timeZone) : formatStartsIn(now, startIso, timeZone);
  }
  if (now.getTime() < end.getTime()) {
    if (allDay) return formatAllDayLabel(startIso, endIso, timeZone);
    const remaining = Math.max(1, minutesBetween(now, end));
    return `In progress · ${remaining} min remaining`;
  }
  return null;
}
