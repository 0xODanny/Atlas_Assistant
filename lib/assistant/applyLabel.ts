import type { AssistantAction } from "../types/assistant";

export function applyActionLabel(action: AssistantAction, applying = false): string {
  const type = action.payload?.type;
  if (applying) {
    if (type === "createEvent") return "Adding…";
    if (type === "deleteEvent") return "Deleting…";
    return "Applying…";
  }
  if (type === "createEvent") return "Add to calendar";
  if (type === "deleteEvent") return "Delete event";
  if (type === "updateEvent") {
    const patch = action.payload?.type === "updateEvent" ? action.payload.patch : undefined;
    if (patch?.start || patch?.end) return "Move event";
    return "Apply change";
  }
  return "Apply change";
}

export function destinationCaption(action: AssistantAction): string | undefined {
  if (action.destination?.label) return action.destination.label;
  if (action.destinationLabel) return action.destinationLabel;
  if (action.payload?.type === "createEvent" && action.payload.event.source === "google") {
    return action.payload.event.calendarId
      ? `Google Calendar · ${action.payload.event.calendarId}`
      : "Google Calendar";
  }
  if (action.payload?.type === "createEvent") return "Atlas · Local";
  return undefined;
}
