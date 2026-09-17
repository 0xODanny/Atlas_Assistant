import type { EventCategory } from "@/lib/types/event";

const COLORS: Record<EventCategory, string> = {
  meeting: "var(--cat-meeting)",
  work: "var(--cat-work)",
  training: "var(--cat-training)",
  focus: "var(--cat-focus)",
  travel: "var(--cat-travel)",
  personal: "var(--cat-personal)",
};

export function CategoryMark({ category }: { category: EventCategory }) {
  return (
    <span
      aria-hidden
      className="mt-1 inline-block h-6 w-[3px] shrink-0 rounded-full"
      style={{ background: COLORS[category] }}
    />
  );
}
