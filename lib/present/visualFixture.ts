import { addDays, addMinutes, atZonedTime, startOfZonedDay } from "../time";
import type { CalendarEvent } from "../types/event";
import type { AssistantAction, AssistantChoice } from "../types/assistant";
import type { AssistantTurn } from "../assistant/workspace";

export type VisualMode = "off" | "busy" | "empty" | "assistant";

export const VISUAL_ID_PREFIX = "visual:";

export function readVisualMode(search = typeof window === "undefined" ? "" : window.location.search): VisualMode {
  if (process.env.NODE_ENV === "production") return "off";
  const value = new URLSearchParams(search).get("visual");
  if (value === "busy" || value === "empty" || value === "assistant") return value;
  return "off";
}

function visualEvent(
  id: string,
  title: string,
  start: Date,
  minutes: number,
  category: CalendarEvent["category"],
  location = "",
): CalendarEvent {
  const createdAt = start.toISOString();
  return {
    id: `${VISUAL_ID_PREFIX}${id}`,
    title,
    description: "",
    start: start.toISOString(),
    end: addMinutes(start, minutes).toISOString(),
    location,
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "local",
    category,
    status: "confirmed",
    demo: true,
    createdAt,
    updatedAt: createdAt,
  };
}

export function visualBusyEvents(now: Date, timezone: string): CalendarEvent[] {
  const today = startOfZonedDay(timezone, now);
  const tuesday = addDays(today, 1);
  const wednesday = addDays(today, 2);
  return [
    visualEvent("marcus", "Call with Marcus", atZonedTime(timezone, today, 9, 0), 30, "meeting", "Phone"),
    visualEvent("catchup", "Product catch-up", atZonedTime(timezone, today, 10, 30), 30, "meeting", "Google Meet"),
    visualEvent("lunch", "Lunch with Alex", atZonedTime(timezone, today, 12, 0), 60, "personal", "Terra"),
    visualEvent("focus", "Focus time", atZonedTime(timezone, today, 14, 0), 120, "focus"),
    visualEvent("review", "Project review", atZonedTime(timezone, today, 16, 0), 60, "work", "Google Meet"),
    visualEvent("swim", "Swim", atZonedTime(timezone, today, 17, 30), 60, "training", "Community pool"),
    visualEvent("wrap", "Wrap-up", atZonedTime(timezone, today, 19, 0), 45, "work"),
    visualEvent("planning", "Planning", atZonedTime(timezone, tuesday, 9, 0), 60, "work"),
    visualEvent("design", "Design review", atZonedTime(timezone, wednesday, 9, 30), 65, "meeting"),
    visualEvent("team", "Team lunch", atZonedTime(timezone, wednesday, 12, 0), 60, "personal"),
  ];
}

export function applyVisualEvents(
  events: CalendarEvent[],
  mode: VisualMode,
  now: Date,
  timezone: string,
): CalendarEvent[] {
  if (mode === "empty") return [];
  if (mode === "busy" || mode === "assistant") return visualBusyEvents(now, timezone);
  return events.filter((event) => !event.id.startsWith(VISUAL_ID_PREFIX));
}

export function visualAssistantTurn(now: Date, timezone: string): AssistantTurn {
  const start = atZonedTime(timezone, now, 13, 45);
  const end = addMinutes(start, 90);
  const later = addMinutes(start, 135);
  const latest = addMinutes(later, 90);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const choices: AssistantChoice[] = [
    {
      id: "visual:choice-1",
      label: "1:45–3:15 PM",
      start: startIso,
      end: endIso,
      reason: "Best uninterrupted opening",
      recommended: true,
    },
    {
      id: "visual:choice-2",
      label: "4:00–5:30 PM",
      start: later.toISOString(),
      end: addMinutes(later, 90).toISOString(),
      reason: "An uninterrupted finish",
    },
    {
      id: "visual:choice-3",
      label: "6:00–7:30 PM",
      start: latest.toISOString(),
      end: addMinutes(latest, 90).toISOString(),
    },
  ];
  const action: AssistantAction = {
    id: "visual:act-1",
    kind: "propose",
    tool: "createEvent",
    label: "Suggested focus",
    summary: "90 minutes",
    status: "proposed",
    destination: { provider: "google", calendarId: "primary", label: "Work · Google Calendar" },
    payload: {
      type: "createEvent",
      event: {
        title: "Focus time",
        start: startIso,
        end: endIso,
        category: "focus",
      },
    },
  };
  return {
    id: "visual:turn",
    prompt: "Find 90 minutes to focus tomorrow afternoon.",
    content: "You have two good openings. Both sit before the afternoon call.",
    intentType: "find_time",
    selectedChoiceId: choices[0]?.id,
    choices,
    actions: [action],
    pending: { type: "find_time", durationMinutes: 90, durationRequested: true },
  };
}
