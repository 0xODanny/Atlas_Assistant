"use client";

import { useEffect, useMemo, useState } from "react";
import { allDayMoveControls, moveAllDayEvent } from "@/lib/calendar/allDayMove";
import { hoursForEvent } from "@/lib/calendar/hours";
import { suggestMoveWindows } from "@/lib/calendar/moveSuggestions";
import { validateTimedMove } from "@/lib/calendar/moveValidate";
import { planningFreeTimeOptions } from "@/lib/calendar/transitionBuffer";
import { eventDurationMinutes, formatDurationAdjective, formatScheduledEventWhen, formatTimezoneLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { useAppState } from "@/lib/state/provider";
import { fromDateAndTimeInputs, toDateInputValue, toTimeInputValue } from "@/lib/time";
import { isInstantInPast, readClockNow } from "@/lib/time/clock";
import { Sheet } from "./Sheet";

export function MoveSheet() {
  const { state, sheet, closeSheet, updateEvent } = useAppState();
  const now = useNow();
  const event = sheet?.name === "move" ? state.events.find((item) => item.id === sheet.eventId) : undefined;
  const timezone = state.profile.timezone;
  const eventId = event?.id;
  const eventStart = event?.start;
  const eventEnd = event?.end;
  const allDay = Boolean(event?.allDay);
  const allDayControls = event && allDay ? allDayMoveControls(event, timezone) : undefined;

  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("");
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [allowPast, setAllowPast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!eventId || !eventStart || !eventEnd) return;
    const controls = allDay ? allDayMoveControls({ start: eventStart, end: eventEnd }, timezone) : undefined;
    setDate(controls?.startDate ?? toDateInputValue(timezone, new Date(eventStart)));
    setEndDate(controls?.endDate ?? "");
    setTime(allDay ? "" : toTimeInputValue(timezone, new Date(eventStart)));
    setSelectedStart(null);
    setAllowPast(false);
    setError(null);
  }, [allDay, eventEnd, eventId, eventStart, timezone]);

  const duration = event && !allDay ? eventDurationMinutes(event.start, event.end) : 45;
  const suggestions = useMemo(() => {
    if (!event || allDay) return [];
    return suggestMoveWindows({
      event,
      events: state.events,
      timezone,
      workingHours: hoursForEvent(state.profile, event),
      after: now,
      ...planningFreeTimeOptions(state.profile, state.workouts),
      limit: 3,
    });
  }, [allDay, event, now, state.events, state.profile, state.workouts, timezone]);

  if (!event || sheet?.name !== "move") return null;
  const moving = event;
  const proposedStart = date && time ? fromDateAndTimeInputs(timezone, date, time) : undefined;
  const proposedIsPast = Boolean(proposedStart && isInstantInPast(proposedStart.toISOString(), now));

  function selectSuggestion(startIso: string) {
    const start = new Date(startIso);
    setSelectedStart(startIso);
    setDate(toDateInputValue(timezone, start));
    setTime(toTimeInputValue(timezone, start));
    setAllowPast(false);
    setError(null);
  }

  async function applyTimed() {
    const current = state.events.find((item) => item.id === moving.id);
    if (!current) {
      setError("That event is no longer on the calendar.");
      return;
    }
    const start = fromDateAndTimeInputs(timezone, date, time);
    const result = validateTimedMove({
      event: current,
      start,
      now: readClockNow(),
      events: state.events,
      ...planningFreeTimeOptions(state.profile, state.workouts),
      allowPast,
    });
    if (!result.ok) {
      if (result.reason === "past") {
        setError("That start time is in the past. Confirm you want to schedule it anyway.");
        return;
      }
      if (result.reason === "conflict") {
        setError("That time conflicts with another event or a workout buffer.");
        return;
      }
      setError("Choose a valid date and time.");
      return;
    }
    setSubmitting(true);
    const written = await updateEvent(current.id, { start: result.start, end: result.end });
    setSubmitting(false);
    if (!written.ok) {
      setError(written.error ?? "Could not move this event.");
      return;
    }
    closeSheet();
  }

  function applyAllDay() {
    const patch = moveAllDayEvent({
      event: moving,
      timezone,
      startDate: date,
      endDate: allDayControls?.mode === "range" ? endDate : undefined,
    });
    void updateEvent(moving.id, patch);
    closeSheet();
  }

  return (
    <Sheet title="Move event" onClose={closeSheet}>
      <p className="text-[17px] font-medium tracking-tight">{moving.title}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Current: {formatScheduledEventWhen(moving, timezone, now)}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">Times in {formatTimezoneLabel(timezone, now)}</p>
      {!allDay ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Move the full {formatDurationAdjective(duration)} event.</p>
      ) : null}

      {allDay ? (
        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            applyAllDay();
          }}
        >
          <p className="section-kicker">Move to</p>
          {allDayControls?.mode === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(change) => setDate(change.target.value)}
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(change) => setEndDate(change.target.value)}
                />
              </label>
            </div>
          ) : (
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(change) => setDate(change.target.value)} />
            </label>
          )}
          <p className="text-sm text-[var(--muted)]">Keep: All day</p>
          <button type="submit" className="btn-solid">
            Move event
          </button>
        </form>
      ) : (
        <>
          {suggestions.length ? (
            <section className="mt-6">
              <p className="section-kicker">Suggested times</p>
              <div className="mt-3 flex flex-col gap-2">
                {suggestions.map((suggestion) => {
                  const selected = selectedStart === suggestion.start;
                  return (
                    <button
                      key={suggestion.start}
                      type="button"
                      aria-pressed={selected}
                      className={selected ? "btn-solid justify-between" : "btn-quiet justify-between"}
                      onClick={() => selectSuggestion(suggestion.start)}
                    >
                      <span>{suggestion.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <p className="section-kicker mt-8">Or</p>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              void applyTimed();
            }}
          >
            <p className="text-[15px]">Choose another time</p>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(change) => {
                  setDate(change.target.value);
                  setSelectedStart(null);
                  setError(null);
                }}
              />
            </label>
            <label className="field">
              <span>Start</span>
              <input
                type="time"
                value={time}
                onChange={(change) => {
                  setTime(change.target.value);
                  setSelectedStart(null);
                  setError(null);
                }}
              />
            </label>
            {proposedIsPast ? (
              <label className="flex items-start gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allowPast}
                  onChange={(change) => {
                    setAllowPast(change.target.checked);
                    setError(null);
                  }}
                />
                <span>
                  This start time is in the past. I want to move the entire event there anyway.
                </span>
              </label>
            ) : null}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button type="submit" className="btn-solid" disabled={submitting}>
              Move event
            </button>
          </form>
        </>
      )}
    </Sheet>
  );
}
