import { eventDurationMinutes, formatRange, indefiniteDurationAdjective } from "../format";
import type { AssistantAction } from "../types/assistant";

export function proposedEventTimes(action: AssistantAction): { start: string; end: string } | null {
  const payload = action.payload;
  if (!payload) return null;
  if (payload.type === "createEvent") {
    return { start: payload.event.start, end: payload.event.end };
  }
  if (payload.type === "updateEvent" && payload.patch.start && payload.patch.end) {
    return { start: payload.patch.start, end: payload.patch.end };
  }
  return null;
}

export function describeProposedFocusBlock(action: AssistantAction, timezone: string): string | null {
  const times = proposedEventTimes(action);
  if (!times) return null;
  const minutes = eventDurationMinutes(times.start, times.end);
  return `${formatRange(times.start, times.end, timezone)} as ${indefiniteDurationAdjective(minutes)} focus block`;
}
