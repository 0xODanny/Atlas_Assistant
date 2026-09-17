import type { ModelIntent, ModelIntentType } from "../types/assistant";

const TYPES: ModelIntentType[] = [
  "answer",
  "find_time",
  "create_event",
  "move_event",
  "create_focus_block",
  "prepare_meeting",
  "reorganize_day",
  "delete_event",
  "clarify",
];

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseModelIntent(raw: unknown): ParseResult<ModelIntent> {
  const value = asRecord(raw);
  if (!value) return { ok: false, error: "Model output was not an object." };
  if (typeof value.type !== "string" || !TYPES.includes(value.type as ModelIntentType)) {
    return { ok: false, error: `Invalid intent type: ${String(value.type)}` };
  }

  const intent: ModelIntent = { type: value.type as ModelIntentType };

  const topics = ["day", "next", "next_workout", "training_goal", "open_time"] as const;
  const categories = ["work", "meeting", "personal", "training", "travel", "focus"] as const;
  const sports = ["swim", "bike", "run", "strength", "recovery"] as const;
  const capabilities = ["weather", "memory", "telegram"] as const;

  if (typeof value.topic === "string" && topics.includes(value.topic as (typeof topics)[number])) {
    intent.topic = value.topic as ModelIntent["topic"];
  }
  if (typeof value.eventId === "string") intent.eventId = value.eventId;
  if (typeof value.eventHint === "string") intent.eventHint = value.eventHint;
  if (typeof value.avoidEventHint === "string") intent.avoidEventHint = value.avoidEventHint;
  if (typeof value.durationMinutes === "number" && Number.isFinite(value.durationMinutes)) {
    intent.durationMinutes = Math.max(15, Math.round(value.durationMinutes));
  }
  if (typeof value.title === "string") intent.title = value.title;
  if (typeof value.category === "string" && categories.includes(value.category as (typeof categories)[number])) {
    intent.category = value.category as ModelIntent["category"];
  }
  if (typeof value.sport === "string" && sports.includes(value.sport as (typeof sports)[number])) {
    intent.sport = value.sport as ModelIntent["sport"];
  }
  if (typeof value.untilHint === "string") intent.untilHint = value.untilHint;
  if (typeof value.question === "string") intent.question = value.question;
  if (typeof value.capability === "string" && capabilities.includes(value.capability as (typeof capabilities)[number])) {
    intent.capability = value.capability as ModelIntent["capability"];
  }

  const when = asRecord(value.when);
  if (when) {
    intent.when = {};
    if (typeof when.day === "string") intent.when.day = when.day as NonNullable<ModelIntent["when"]>["day"];
    if (typeof when.weekday === "number") intent.when.weekday = when.weekday as NonNullable<ModelIntent["when"]>["weekday"];
    if (typeof when.part === "string") intent.when.part = when.part as NonNullable<ModelIntent["when"]>["part"];
    if (typeof when.hour === "number") intent.when.hour = when.hour;
    if (typeof when.minute === "number") intent.when.minute = when.minute;
  }

  if (intent.type === "clarify" && !intent.question?.trim()) {
    return { ok: false, error: "Clarify intent is missing a question." };
  }

  return { ok: true, data: intent };
}

export const MODEL_INTENT_SCHEMA = {
  name: "atlas_intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "type",
      "topic",
      "eventId",
      "eventHint",
      "avoidEventHint",
      "durationMinutes",
      "title",
      "category",
      "sport",
      "untilHint",
      "question",
      "capability",
      "when",
    ],
    properties: {
      type: { type: "string", enum: TYPES },
      topic: { type: ["string", "null"], enum: ["day", "next", "next_workout", "training_goal", "open_time", null] },
      eventId: { type: ["string", "null"] },
      eventHint: { type: ["string", "null"] },
      avoidEventHint: { type: ["string", "null"] },
      durationMinutes: { type: ["number", "null"] },
      title: { type: ["string", "null"] },
      category: {
        type: ["string", "null"],
        enum: ["work", "meeting", "personal", "training", "travel", "focus", null],
      },
      sport: { type: ["string", "null"], enum: ["swim", "bike", "run", "strength", "recovery", null] },
      untilHint: { type: ["string", "null"] },
      question: { type: ["string", "null"] },
      capability: { type: ["string", "null"], enum: ["weather", "memory", "telegram", null] },
      when: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["day", "weekday", "part", "hour", "minute"],
        properties: {
          day: { type: ["string", "null"], enum: ["today", "tomorrow", "weekday", null] },
          weekday: { type: ["number", "null"] },
          part: { type: ["string", "null"], enum: ["morning", "afternoon", "evening", "later", "working", null] },
          hour: { type: ["number", "null"] },
          minute: { type: ["number", "null"] },
        },
      },
    },
  },
} as const;
