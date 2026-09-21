"use client";

import { useEffect, useState } from "react";
import { applyVisualEvents, readVisualMode, type VisualMode } from "../present/visualFixture";
import type { CalendarEvent } from "../types/event";

export function useVisualMode(): VisualMode {
  const [mode, setMode] = useState<VisualMode>("off");
  useEffect(() => {
    setMode(readVisualMode());
  }, []);
  return mode;
}

export function useVisualEvents(events: CalendarEvent[], now: Date, timezone: string): CalendarEvent[] {
  const mode = useVisualMode();
  return applyVisualEvents(events, mode, now, timezone);
}
