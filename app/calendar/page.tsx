import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/CalendarView";

export default function CalendarPage() {
  return (
    <Suspense fallback={<p className="text-[var(--atlas-muted)]">Loading calendar…</p>}>
      <CalendarView />
    </Suspense>
  );
}
