import { startOfZonedDay } from "../time";

export function readClockNow(): Date {
  return new Date();
}

export function isInstantInPast(iso: string, now: Date): boolean {
  return new Date(iso).getTime() < now.getTime();
}

export function laterInstant(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

/** Availability and suggestions search from now, never from earlier on the same zoned day. */
export function availabilitySearchStart(now: Date, timezone: string): Date {
  return laterInstant(now, startOfZonedDay(timezone, now));
}
