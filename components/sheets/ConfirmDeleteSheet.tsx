"use client";

import type { EventCategory } from "@/lib/types/event";
import { Sheet } from "./Sheet";

export function deleteNoun(category?: EventCategory): "meeting" | "workout" | "event" {
  if (category === "meeting") return "meeting";
  if (category === "training") return "workout";
  return "event";
}

export function ConfirmDeleteSheet({
  title,
  category,
  onCancel,
  onConfirm,
}: {
  title: string;
  category?: EventCategory;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const noun = deleteNoun(category);
  return (
    <Sheet title={`Delete ${noun}?`} onClose={onCancel}>
      <p className="text-[16px] leading-6">
        Are you sure you want to delete
        <br />
        “{title}”?
      </p>
      <div className="event-actions mt-6 max-w-none" data-atlas-delete-confirm>
        <button type="button" className="event-action is-secondary" onClick={onCancel}>
          <span className="event-action-label">Cancel</span>
        </button>
        <button type="button" className="event-action is-danger" onClick={onConfirm}>
          <span className="event-action-label">Delete</span>
        </button>
      </div>
    </Sheet>
  );
}
