import type { EventCategory } from "../types/event";
import type { EventColorOverrides, SemanticEventKind } from "../types/profile";
import type { Sport } from "../types/training";

export type EventColorInput = {
  category?: EventCategory;
  title?: string;
  description?: string;
  workoutId?: string;
  sport?: Sport | string;
};

export const EVENT_KIND_LABELS: Record<SemanticEventKind, string> = {
  call: "Calls",
  meeting: "Meetings",
  workout: "Workouts",
  focus: "Focus / work",
  personal: "Personal",
  relax: "Relax / recovery",
  travel: "Travel",
  other: "Other",
};

export const EVENT_KIND_FILL: Record<SemanticEventKind, string> = {
  call: "var(--atlas-call)",
  meeting: "var(--atlas-meeting)",
  workout: "var(--atlas-workout)",
  focus: "var(--atlas-focus)",
  personal: "var(--atlas-personal)",
  relax: "var(--atlas-relax)",
  travel: "var(--atlas-travel)",
  other: "var(--atlas-other)",
};

export const EVENT_KIND_ORDER: SemanticEventKind[] = [
  "call",
  "meeting",
  "workout",
  "focus",
  "personal",
  "relax",
  "travel",
  "other",
];

export const EVENT_COLOR_PRESETS = [
  "var(--atlas-call)",
  "var(--atlas-meeting)",
  "var(--atlas-workout)",
  "var(--atlas-focus)",
  "var(--atlas-personal)",
  "var(--atlas-relax)",
  "var(--atlas-travel)",
  "var(--atlas-other)",
] as const;

const CALL_RE = /\b(phone\s+call|call|facetime|phone)\b/i;
const MEETING_RE = /\b(meeting|appointment|standup|stand-up|sync|1\s*:\s*1|one-on-one|interview)\b/i;
const WORKOUT_RE =
  /\b(workout|swim(?:ming)?|bike|cycling|cycle|gym|strength|training|triathlon|yoga|pilates|ride)\b/i;
const RUN_RE = /\b(run|running|jog|jogging)\b/i;
const ERRAND_RE =
  /\b(grocery|groceries|errand|errands|store|shop(?:ping)?|pharmacy|dry\s*clean|post office|bank|pickup|pick up)\b/i;
const FOCUS_RE = /\b(focus(?:\s+block)?|deep work|work block)\b/i;
const PERSONAL_RE = /\b(errand|chores|dentist|haircut|personal)\b/i;
const RELAX_RE =
  /\b(recovery|recover|relax|rest day|social|hangout|movie|brunch|dinner with|lunch with|coffee with|drinks with)\b/i;
const TRAVEL_RE = /\b(flight|fly(?:ing)?|airport|travel|travell?ing|train to|drive to)\b/i;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'");
}

function combinedText(input: EventColorInput): string {
  return normalize([input.title, input.description].filter(Boolean).join(" "));
}

function isErrandRun(text: string): boolean {
  return ERRAND_RE.test(text) && RUN_RE.test(text);
}

export function resolveEventKind(input: EventColorInput): SemanticEventKind {
  const text = combinedText(input);

  if (input.sport || input.workoutId || input.category === "training") return "workout";
  if (input.category === "travel") return "travel";
  if (input.category === "focus" || input.category === "work") return "focus";
  if (input.category === "meeting") return CALL_RE.test(text) ? "call" : "meeting";
  if (input.category === "personal") return RELAX_RE.test(text) ? "relax" : "personal";

  if (CALL_RE.test(text)) return "call";
  if (TRAVEL_RE.test(text)) return "travel";
  if (isErrandRun(text)) return "personal";
  if (WORKOUT_RE.test(text) || (RUN_RE.test(text) && !ERRAND_RE.test(text))) return "workout";
  if (MEETING_RE.test(text)) return "meeting";
  if (FOCUS_RE.test(text)) return "focus";
  if (RELAX_RE.test(text)) return "relax";
  if (PERSONAL_RE.test(text) || ERRAND_RE.test(text)) return "personal";
  if (input.category === "personal") return "personal";
  return "other";
}

export function eventKindFill(kind: SemanticEventKind, overrides?: EventColorOverrides): string {
  return overrides?.[kind] ?? EVENT_KIND_FILL[kind];
}

export function eventFill(input: EventColorInput | EventCategory | undefined, overrides?: EventColorOverrides): string {
  const resolved =
    typeof input === "string" || input === undefined
      ? resolveEventKind({ category: input })
      : resolveEventKind(input);
  return eventKindFill(resolved, overrides);
}
