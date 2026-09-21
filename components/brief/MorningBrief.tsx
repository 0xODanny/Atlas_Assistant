"use client";

import { generateBrief } from "@/lib/brief/generateBrief";
import { formatFullDateUpper } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { actionLabelForCategory } from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";
import { PageHeading } from "../ui/PageHeading";

export function MorningBriefView() {
  const { state, openSheet } = useAppState();
  const now = useNow();
  const brief = generateBrief({
    now,
    profile: state.profile,
    events: state.events,
    tasks: state.tasks,
    workouts: state.workouts,
    meetings: state.meetings,
  });

  return (
    <article className="page-column-brief">
      <PageHeading kicker={formatFullDateUpper(now.toISOString(), state.profile.timezone)} title="Morning brief">
        <p className="mt-2 text-[16px] leading-7 text-[var(--atlas-muted)]">{brief.summary}</p>
      </PageHeading>

      <div className="mt-6">
        {brief.timeline.map((item) => (
          <section key={`${item.kind}-${item.start}-${item.eventId ?? "focus"}`} className="border-t border-[var(--atlas-line)] py-4">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--atlas-kicker)]">
              {item.kind === "event" ? "Scheduled" : "Free time"}
            </p>
            <p className="mt-1 text-[15px]">
              {item.timeLabel} — {item.heading}
            </p>
            {item.meta ? <p className="mt-0.5 text-[14px] text-[var(--atlas-muted)]">{item.meta}</p> : null}
            {item.lines.map((line) => (
              <p key={line} className="mt-0.5 text-[13px] text-[var(--atlas-muted)]">
                {line}
              </p>
            ))}
            {item.action === "prepare" && item.eventId ? (
              <button
                type="button"
                className="btn-quiet mt-1"
                onClick={() => openSheet({ name: "prepare", eventId: item.eventId! })}
              >
                {actionLabelForCategory("meeting")}
              </button>
            ) : null}
          </section>
        ))}
      </div>

      {brief.important.length ? (
        <section className="mt-4 border-t border-[var(--atlas-line)] pt-4">
          <p className="section-kicker">Important</p>
          <ul className="mt-2 space-y-1">
            {brief.important.map((task) => (
              <li key={task.id} className="text-[14px] leading-6">
                {task.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <a href="/assistant?prompt=Reorganize%20tomorrow." className="btn-quiet mt-6">
        Reorganize tomorrow
      </a>
    </article>
  );
}
