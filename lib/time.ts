export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function tzOffsetMs(timeZone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return asUtc - date.getTime();
}

export function zonedLocalToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = tzOffsetMs(timeZone, utcGuess);
  const first = new Date(utcGuess.getTime() - offset);
  const secondOffset = tzOffsetMs(timeZone, first);
  if (secondOffset !== offset) {
    return new Date(utcGuess.getTime() - secondOffset);
  }
  return first;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export function zonedParts(timeZone: string, date: Date): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    weekday: weekdayMap[read("weekday")] ?? 0,
  };
}

export function startOfZonedDay(timeZone: string, date: Date): Date {
  const parts = zonedParts(timeZone, date);
  return zonedLocalToUtc(timeZone, parts.year, parts.month, parts.day, 0, 0);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonths(date: Date, months: number, timeZone: string): Date {
  const parts = zonedParts(timeZone, date);
  const index = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return zonedLocalToUtc(timeZone, year, month, Math.min(parts.day, lastDay), 12, 0);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

export function parseHHMM(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

export function sameZonedDay(left: Date, right: Date, timeZone: string): boolean {
  const a = zonedParts(timeZone, left);
  const b = zonedParts(timeZone, right);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function zonedDateKey(timeZone: string, date: Date): string {
  const parts = zonedParts(timeZone, date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function atZonedTime(timeZone: string, date: Date, hour: number, minute: number): Date {
  const parts = zonedParts(timeZone, date);
  return zonedLocalToUtc(timeZone, parts.year, parts.month, parts.day, hour, minute);
}

export function toDateInputValue(timeZone: string, date: Date): string {
  return zonedDateKey(timeZone, date);
}

export function toTimeInputValue(timeZone: string, date: Date): string {
  const parts = zonedParts(timeZone, date);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function fromDateAndTimeInputs(
  timeZone: string,
  dateValue: string,
  timeValue: string,
): Date {
  const [year, month, day] = dateValue.split("-").map(Number);
  const { hour, minute } = parseHHMM(timeValue);
  return zonedLocalToUtc(timeZone, year, month, day, hour, minute);
}
