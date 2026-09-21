"use client";

import { useState } from "react";
import { splitEditorial } from "@/lib/assistant/editorial";
import type { AssistantTurn } from "@/lib/assistant/workspace";
import { eventDurationMinutes, formatDuration, formatRangeCompact, formatRelativeDay } from "@/lib/format";
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
  const [showMoreTimes, setShowMoreTimes] = useState(false);
  const meetingOrFocus =
    turn.intentType === "find_time" ||
    turn.intentType === "create_focus_block" ||
    turn.intentType === "reorganize_day";
  const rawEditorial = splitEditorial(turn.content);
  const suggestedMinutes = turn.pending?.durationMinutes;
  const durationLine =
    suggestedMinutes && !applied ? `Suggested duration: ${suggestedMinutes} minutes.` : null;
  const editorial =
    durationLine && /^suggested duration/i.test(rawEditorial.title.trim()) && rawEditorial.body
      ? splitEditorial(rawEditorial.body)
      : rawEditorial;
  const allChoices = turn.choices ?? [];
  const visibleChoices = showMoreTimes ? allChoices : allChoices.slice(0, 2);

  return (
    <div>
      {turn.prompt ? <p className="user-note">{turn.prompt}</p> : null}
      {durationLine ? <p className="body-copy mt-5">{durationLine}</p> : null}
      <h2 className="result-title mt-4" data-atlas-assistant-heading>
        {editorial.title}
      </h2>
      {editorial.body ? <p className="body-copy mt-3 whitespace-pre-wrap">{editorial.body}</p> : null}
      {turn.error ? <p className="mt-2 text-[15px] text-[var(--atlas-muted)]">Nothing was changed.</p> : null}

      {pendingOpen && visibleChoices.length ? (
        <div className="mt-4">
          {visibleChoices.map((choice) => {
            const selectedChoice = turn.selectedChoiceId === choice.id;
            const minutes = eventDurationMinutes(choice.start, choice.end);
            const recommended = Boolean(choice.recommended);
            const context =
              recommended && (!choice.reason || /^You have an open /.test(choice.reason))
                ? "Best uninterrupted opening"
                : choice.reason;
            return (
              <button
                key={choice.id}
                type="button"
                aria-pressed={selectedChoice}
                className="choice-row"
                data-atlas-choice-recommended={recommended ? "true" : "false"}
                onClick={() => onSelectChoice?.(choice)}
              >
                <span aria-hidden className={`choice-radio${selectedChoice ? " is-on" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[18px] font-medium leading-6">
                    {formatRangeCompact(choice.start, choice.end, timezone)}
                  </span>
                  <span className="mt-1 block text-[14px] text-[var(--atlas-muted)]">
                    {formatRelativeDay(choice.start, timezone, new Date())} · {formatDuration(minutes)}
                  </span>
                  {context ? (
                    <span className="mt-0.5 block text-[14px] text-[var(--atlas-meta)]">{context}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
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

      {scheduling && !applied ? (
        <div className="mt-3">
          {turn.pending?.durationRequested ? null : (
            <label className="field w-full">
              <span>Duration</span>
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
            <div className="assistant-alts">
              <button type="button" className="btn-quiet" onClick={() => setShowCustom((open) => !open)}>
                Explore another day
              </button>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => {
                  if (!showMoreTimes && allChoices.length > 2) {
                    setShowMoreTimes(true);
                    return;
                  }
                  onBrowse?.("more");
                }}
              >
                Show more times
              </button>
              <button type="button" className="btn-quiet" onClick={() => onBrowse?.("next_week")}>
                Try next week
              </button>
            </div>
          ) : (
            <div className="assistant-alts">
              <button type="button" className="btn-quiet" onClick={() => setShowCustom((open) => !open)}>
                Explore another day
              </button>
            </div>
          )}
          {showCustom ? (
            <form
              className="mt-2 flex w-full flex-col gap-3"
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
    </div>
  );
}
