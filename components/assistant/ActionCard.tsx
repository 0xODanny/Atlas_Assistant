"use client";

import { describeAddedWorkout } from "@/lib/calendar/workoutSchedule";
import { useAppState } from "@/lib/state/provider";
import { readClockNow } from "@/lib/time/clock";
import type { AssistantAction } from "@/lib/types/assistant";
import { EventPreview } from "./EventPreview";

export function ActionCard({
  action,
  timezone,
  onApply,
  onDismiss,
  onView,
  onMove,
  applying,
}: {
  action: AssistantAction;
  timezone: string;
  onApply: () => void;
  onDismiss: () => void;
  onView?: (eventId: string) => void;
  onMove?: (eventId: string) => void;
  applying?: boolean;
}) {
  const { state } = useAppState();
  const colorOverrides = state.profile.eventColorOverrides;
  if (action.kind === "read") {
    return (
      <p className="mt-3 text-[13px] text-[var(--atlas-muted)]">
        {action.label} · {action.summary}
      </p>
    );
  }

  if (action.status === "applied" && action.payload?.type === "createEvent") {
    const added = describeAddedWorkout({
      title: action.payload.event.title,
      start: action.payload.event.start,
      end: action.payload.event.end,
      timezone,
      now: readClockNow(),
    });
    return (
      <EventPreview
        action={{ ...action, summary: added }}
        timezone={timezone}
        now={readClockNow()}
        applying={applying}
        onApply={onApply}
        onDismiss={onDismiss}
        onView={onView}
        onMove={onMove}
        colorOverrides={colorOverrides}
      />
    );
  }

  return (
    <EventPreview
      action={action}
      timezone={timezone}
      now={readClockNow()}
      applying={applying}
      onApply={onApply}
      onDismiss={onDismiss}
      onView={onView}
      onMove={onMove}
      colorOverrides={colorOverrides}
    />
  );
}
