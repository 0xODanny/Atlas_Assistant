import { rematchPersistedEvents } from "../calendar/busy";
import { normalizeProfileHours } from "../calendar/hours";
import { stampSeedDemoFlags } from "./sample";
import type { AppState } from "./state";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state);
}

export function deserializeState(raw: string): AppState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (!isRecord(parsed.profile) || typeof parsed.profile.id !== "string") return null;
    if (!isRecord(parsed.connections)) return null;
    if (!Array.isArray(parsed.events) || !Array.isArray(parsed.tasks)) return null;
    if (!Array.isArray(parsed.workouts) || !Array.isArray(parsed.meetings)) return null;
    const state = parsed as unknown as AppState;
    return stampSeedDemoFlags({
      ...state,
      profile: normalizeProfileHours(state.profile),
      events: rematchPersistedEvents(state.events),
    });
  } catch {
    return null;
  }
}
