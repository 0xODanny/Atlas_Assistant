"use client";

import { useState } from "react";
import {
  EVENT_COLOR_PRESETS,
  EVENT_KIND_FILL,
  EVENT_KIND_LABELS,
  EVENT_KIND_ORDER,
  eventKindFill,
} from "@/lib/present/eventColor";
import type { EventColorOverrides, SemanticEventKind } from "@/lib/types/profile";

export function EventColorLegend({
  overrides,
  onChange,
}: {
  overrides?: EventColorOverrides;
  onChange: (next: EventColorOverrides | undefined) => void;
}) {
  const [open, setOpen] = useState<SemanticEventKind | null>(null);

  function setKind(kind: SemanticEventKind, value: string) {
    const next = { ...overrides };
    if (value === EVENT_KIND_FILL[kind]) delete next[kind];
    else next[kind] = value;
    onChange(Object.keys(next).length ? next : undefined);
  }

  return (
    <div className="event-color-list" data-atlas-event-colors>
      <p className="setting-note">Automatic colors stay on unless you pick another swatch.</p>
      {EVENT_KIND_ORDER.map((kind) => {
        const color = eventKindFill(kind, overrides);
        return (
          <div key={kind}>
            <button
              type="button"
              className="event-color-row"
              aria-expanded={open === kind}
              onClick={() => setOpen((current) => (current === kind ? null : kind))}
            >
              <span aria-hidden className="event-color-swatch" style={{ background: color }} />
              <span className="setting-row-label">{EVENT_KIND_LABELS[kind]}</span>
            </button>
            {open === kind ? (
              <div className="event-color-presets" role="group" aria-label={`${EVENT_KIND_LABELS[kind]} color`}>
                {EVENT_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`event-color-preset${preset === color ? " is-on" : ""}`}
                    style={{ background: preset }}
                    aria-label={`Use ${preset}`}
                    aria-pressed={preset === color}
                    onClick={() => setKind(kind, preset)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
