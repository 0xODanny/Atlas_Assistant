import { Suspense } from "react";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export default function AssistantPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Opening assistant…</p>}>
      <AssistantChat />
    </Suspense>
  );
}
