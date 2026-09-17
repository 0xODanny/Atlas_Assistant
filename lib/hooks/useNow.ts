"use client";

import { useCallback, useEffect, useState } from "react";
import { readClockNow } from "../time/clock";

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => readClockNow());
  const refresh = useCallback(() => setNow(readClockNow()), []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    const onResume = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refresh();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [intervalMs, refresh]);

  return now;
}
