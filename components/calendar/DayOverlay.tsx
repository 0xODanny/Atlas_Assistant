"use client";

import { useEffect, useId, useRef } from "react";
import { dayDetailsLabel, weekdayLong } from "@/lib/calendar/weekOverview";
import { formatMonthDay } from "@/lib/format";
import type { CalendarEvent } from "@/lib/types/event";
import type { EventColorOverrides } from "@/lib/types/profile";
import { BackControl } from "../shell/BackControl";
import { DaySchedule } from "./DaySchedule";

export function DayOverlay({
  date,
  events,
  timezone,
  onClose,
  onSelect,
  onAdd,
  returnFocus,
  covered = false,
  colorOverrides,
}: {
  date: Date;
  events: CalendarEvent[];
  timezone: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  returnFocus: HTMLElement | null;
  covered?: boolean;
  colorOverrides?: EventColorOverrides;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const heading = formatMonthDay(date.toISOString(), timezone);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!covered) closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      if (!covered) returnFocus?.focus();
    };
  }, [covered, returnFocus]);

  useEffect(() => {
    if (covered) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [covered, onClose]);

  return (
    <div className={`day-overlay${covered ? " is-covered" : ""}`} data-atlas-day-overlay hidden={covered || undefined}>
      <button
        type="button"
        className="day-overlay-backdrop"
        aria-label="Close day details"
        data-atlas-day-backdrop
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="day-overlay-panel"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="day-overlay-header">
          <div className="min-w-0">
            <BackControl onClick={onClose} />
            <p className="section-kicker mt-2">{weekdayLong(date, timezone)}</p>
            <h2 id={titleId} className="section-title mt-1">
              {heading}
            </h2>
          </div>
          <div className="flex items-center gap-0.5">
            {onAdd ? (
              <button type="button" className="add-round" aria-label="Add event" onClick={onAdd}>
                +
              </button>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              className="week-info"
              aria-label="Close day details"
              data-atlas-day-close
              onClick={onClose}
            >
              <InfoMark />
            </button>
          </div>
        </header>
        <div className="day-overlay-scroll" data-atlas-day-scroll>
          <p className="sr-only">{dayDetailsLabel(date, timezone)}</p>
          <DaySchedule events={events} timezone={timezone} onSelect={onSelect} colorOverrides={colorOverrides} />
        </div>
      </div>
    </div>
  );
}

export function InfoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.15" stroke="currentColor" strokeWidth="1.35" />
      <path d="M8 7.15v4.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="8" cy="5.15" r="0.7" fill="currentColor" />
    </svg>
  );
}

