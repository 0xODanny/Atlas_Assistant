import { formatDuration, formatSuggestionSlot } from "../format";
import { addMinutes } from "../time";
import type { AssistantChoice, FreeWindow } from "../types/assistant";
import { firstSnappedSlot } from "./snap";

const DIVERSE_GAP_MINUTES = 90;

export function durationSlotsFromWindows(input: {
  windows: FreeWindow[];
  durationMinutes: number;
  timezone: string;
  now: Date;
  limit?: number;
  offset?: number;
}): AssistantChoice[] {
  const slots: AssistantChoice[] = [];
  for (const window of input.windows) {
    let cursor = window.start;
    while (true) {
      const slot = firstSnappedSlot(cursor, window.end, input.durationMinutes, input.timezone);
      if (!slot) break;
      if (new Date(slot.start).getTime() < input.now.getTime()) {
        cursor = addMinutes(new Date(slot.start), 30).toISOString();
        continue;
      }
      if (slots.some((item) => item.start === slot.start)) {
        cursor = addMinutes(new Date(slot.start), 30).toISOString();
        continue;
      }
      slots.push({
        id: `slot:${slot.start}`,
        label: `${formatSuggestionSlot(slot.start, slot.end, input.timezone, input.now)} · ${formatDuration(input.durationMinutes)}`,
        start: slot.start,
        end: slot.end,
      });
      cursor = addMinutes(new Date(slot.start), DIVERSE_GAP_MINUTES).toISOString();
    }
  }
  const offset = input.offset ?? 0;
  return slots.slice(offset, offset + (input.limit ?? 3));
}
