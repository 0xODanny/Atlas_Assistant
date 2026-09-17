"use client";

import { useState } from "react";
import type { AssistantTurn } from "@/lib/assistant/workspace";
import { fromDateAndTimeInputs, toDateInputValue, toTimeInputValue } from "@/lib/time";
import type { AssistantChoice } from "@/lib/types/assistant";
import { ActionCard } from "./ActionCard";

export function AssistantResult({
  turn,
  timezone,
  onApply,
  onDismiss,
  onSelectChoice,
  onDurationChange,
  onCustomTime,
  onBrowse,
  onView,
  onMove,
  applying,
}: {
  turn: AssistantTurn;
  timezone: string;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  onSelectChoice?: (choice: AssistantChoice) => void;
  onDurationChange?: (minutes: number) => void;
  onCustomTime?: (start: Date) => void;
  onBrowse?: (kind: "more" | "next_week" | "date", date?: string) => void;
  onView?: (eventId: string) => void;
  onMove?: (eventId: string) => void;
  applying?: boolean;
}) {
  const showSource = process.env.NODE_ENV === "development" && turn.source;
  const sourceLabel = turn.source === "openai" ? "OpenAI" : turn.source === "local" ? "Local" : "Error";
  const pendingOpen = turn.actions.some((item) => item.kind === "propose" && item.status === "proposed");
  const applied = turn.actions.some((item) => item.kind === "propose" && item.status === "applied");
  const scheduling =
    pendingOpen &&
    (turn.intentType === "create_event" ||
      turn.intentType === "find_time" ||
      turn.intentType === "create_focus_block" ||
      turn.intentType === "reorganize_day");
  const selected = turn.actions.find((item) => item.payload?.type === "createEvent" && item.status === "proposed");
  const selectedStart =
    selected?.payload?.type === "createEvent" ? new Date(selected.payload.event.start) : undefined;
  const [date, setDate] = useState(
    selectedStart ? toDateInputValue(timezone, selectedStart) : toDateInputValue(timezone, new Date()),
  );
  const [time, setTime] = useState(selectedStart ? toTimeInputValue(timezone, selectedStart) : "");
  const [duration, setDuration] = useState(String(turn.pending?.durationMinutes ?? 60));
  const [showCustom, setShowCustom] = useState(false);
  const meetingOrFocus = turn.intentType === "find_time" || turn.intentType === "create_focus_block" || turn.intentType === "reorganize_day";

  return (
    <div>
      {showSource ? <p className="section-kicker">Source · {sourceLabel}</p> : null}
      <p className={`${showSource ? "mt-1.5 " : ""}text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]`}>{turn.prompt}</p>
      <p className="mt-2 whitespace-pre-wrap text-[16px] leading-7">{turn.content}</p>
      {turn.error ? <p className="mt-2 text-sm text-[var(--muted)]">Nothing was changed.</p> : null}

      {pendingOpen && turn.choices?.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {turn.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={turn.selectedChoiceId === choice.id}
              className={turn.selectedChoiceId === choice.id ? "btn-solid justify-start" : "btn-quiet justify-start"}
              onClick={() => onSelectChoice?.(choice)}
            >
              <span className="flex flex-col items-start text-left">
                <span>{choice.label}</span>
                {choice.reason ? <span className="mt-0.5 text-[13px] font-normal text-[var(--muted)]">{choice.reason}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {scheduling && !applied ? (
        <div className="mt-4 flex flex-col gap-3">
          {turn.pending?.durationRequested ? null : (
            <label className="field">
              <span>Suggested duration</span>
              <input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                onBlur={() => {
                  const minutes = Number(duration);
                  if (Number.isFinite(minutes) && minutes >= 15 && minutes !== turn.pending?.durationMinutes) {
                    onDurationChange?.(Math.round(minutes));
                  }
                }}
              />
            </label>
          )}
          {meetingOrFocus ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-quiet" onClick={() => onBrowse?.("more")}>
                More times
              </button>
              <button type="button" className="btn-quiet" onClick={() => setShowCustom((open) => !open)}>
                Choose a date
              </button>
              <button type="button" className="btn-quiet" onClick={() => onBrowse?.("next_week")}>
                Next week
              </button>
            </div>
          ) : (
            <button type="button" className="btn-quiet justify-start" onClick={() => setShowCustom((open) => !open)}>
              Choose another time
            </button>
          )}
          {showCustom ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (meetingOrFocus && date && !time) {
                  onBrowse?.("date", date);
                  return;
                }
                onCustomTime?.(fromDateAndTimeInputs(timezone, date, time));
              }}
            >
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(change) => setDate(change.target.value)} />
              </label>
              <label className="field">
                <span>Start</span>
                <input type="time" value={time} onChange={(change) => setTime(change.target.value)} />
              </label>
              <button type="submit" className="btn-quiet">
                Use this time
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {turn.actions.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          timezone={timezone}
          onApply={() => onApply(action.id)}
          onDismiss={() => onDismiss(action.id)}
          onView={onView}
          onMove={onMove}
          applying={applying}
        />
      ))}
    </div>
  );
}
