"use client";

import { useState, type FormEvent } from "react";
import { allDayMoveControls, moveAllDayEvent } from "@/lib/calendar/allDayMove";
import { defaultEventTimes } from "@/lib/events/defaults";
import { fromDateAndTimeInputs, toDateInputValue, toTimeInputValue } from "@/lib/time";
import { useAppState } from "@/lib/state/provider";
import type { EventCategory, PrivacyLevel } from "@/lib/types/event";
import { Sheet } from "./Sheet";

const CATEGORIES: EventCategory[] = ["meeting", "work", "training", "focus", "travel", "personal"];
const PRIVACY: PrivacyLevel[] = ["private", "busy-only", "shared"];

export function EventSheet() {
  const { state, sheet, closeSheet, createEvent, updateEvent } = useAppState();
  const timezone = state.profile.timezone;
  const editing = sheet?.name === "event" && sheet.mode === "edit" ? state.events.find((event) => event.id === sheet.eventId) : undefined;
  const selectedStart = sheet?.name === "event" && sheet.start ? new Date(sheet.start) : undefined;
  const defaults = defaultEventTimes(new Date(), timezone, selectedStart);
  const initialStart = editing ? new Date(editing.start) : defaults.start;
  const initialEnd = editing ? new Date(editing.end) : defaults.end;

  const editingAllDay = Boolean(editing?.allDay);
  const allDayControls = editing && editingAllDay ? allDayMoveControls(editing, timezone) : undefined;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(allDayControls?.startDate ?? toDateInputValue(timezone, initialStart));
  const [endDate, setEndDate] = useState(allDayControls?.endDate ?? "");
  const [startTime, setStartTime] = useState(editingAllDay ? "" : toTimeInputValue(timezone, initialStart));
  const [endTime, setEndTime] = useState(editingAllDay ? "" : toTimeInputValue(timezone, initialEnd));
  const [category, setCategory] = useState<EventCategory>(editing?.category ?? "personal");
  const [privacy, setPrivacy] = useState<PrivacyLevel>(editing?.privacy ?? state.profile.privacyDefault);
  const [location, setLocation] = useState(editing?.location ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [preparationRequired, setPreparationRequired] = useState(editing?.preparationRequired ?? false);
  const [preparationMinutes, setPreparationMinutes] = useState(String(editing?.preparationMinutes || 15));
  const [participants, setParticipants] = useState(
    editing?.participants.map((person) => person.name).join(", ") ?? "",
  );

  if (sheet?.name !== "event") return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const people = participants
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name, index) => ({ id: `person_${index}_${name.toLowerCase()}`, name }));

    const moved =
      editingAllDay && editing
        ? moveAllDayEvent({
            event: editing,
            timezone,
            startDate: date,
            endDate: allDayControls?.mode === "range" ? endDate : undefined,
          })
        : undefined;
    const start =
      moved?.start ?? fromDateAndTimeInputs(timezone, date, startTime).toISOString();
    const end = moved?.end ?? fromDateAndTimeInputs(timezone, date, endTime).toISOString();

    const payload = {
      title,
      start,
      end,
      ...(editingAllDay ? { allDay: true as const } : {}),
      location,
      description,
      category,
      privacy,
      preparationRequired,
      preparationMinutes: preparationRequired ? Number(preparationMinutes) || 0 : 0,
      participants: people,
    };

    void (async () => {
      const result = editing ? await updateEvent(editing.id, payload) : await createEvent(payload);
      if (result.ok) closeSheet();
    })();
  }

  return (
    <Sheet
      title={editing ? "Edit event" : "New event"}
      onClose={closeSheet}
      footer={
        <button type="submit" form="atlas-event-form" className="btn-solid w-full">
          {editing ? "Save changes" : "Add event"}
        </button>
      }
    >
      <form id="atlas-event-form" className="flex flex-col gap-3" onSubmit={submit}>
        <label className="field">
          <span>Title</span>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        {editingAllDay && allDayControls?.mode === "range" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Start date</span>
              <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="field">
              <span>End date</span>
              <input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span>Date</span>
            <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        )}
        {editingAllDay ? (
          <p className="setting-note">Keep: All day</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Start</span>
              <input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label className="field">
              <span>End</span>
              <input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </div>
        )}
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as EventCategory)}>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Privacy</span>
          <select value={privacy} onChange={(event) => setPrivacy(event.target.value as PrivacyLevel)}>
            {PRIVACY.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Location</span>
          <input value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label className="field">
          <span>Participants</span>
          <input
            placeholder="Marcus, Ana"
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[16px]">
          <input
            type="checkbox"
            checked={preparationRequired}
            onChange={(event) => setPreparationRequired(event.target.checked)}
          />
          Preparation required
        </label>
        {preparationRequired ? (
          <label className="field">
            <span>Preparation minutes</span>
            <input
              type="number"
              min={5}
              value={preparationMinutes}
              onChange={(event) => setPreparationMinutes(event.target.value)}
            />
          </label>
        ) : null}
      </form>
    </Sheet>
  );
}
