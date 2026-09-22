import { Suspense } from "react";
import { EventDetails } from "@/components/events/EventDetails";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="text-[var(--atlas-muted)]">Loading event…</p>}>
      <EventDetails eventId={decodeURIComponent(id)} />
    </Suspense>
  );
}
