import { eventFill } from "@/lib/present/eventColor";
import type { EventColorInput } from "@/lib/present/eventColor";
import type { EventColorOverrides } from "@/lib/types/profile";

export function CategoryMark({
  event,
  overrides,
}: {
  event: EventColorInput;
  overrides?: EventColorOverrides;
}) {
  return (
    <span
      aria-hidden
      className="mt-1.5 inline-block h-7 w-[3px] shrink-0"
      style={{ background: eventFill(event, overrides) }}
    />
  );
}
