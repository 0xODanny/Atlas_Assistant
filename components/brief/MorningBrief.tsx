"use client";

import { generateBrief } from "@/lib/brief/generateBrief";
import { useNow } from "@/lib/hooks/useNow";
import { actionLabelForCategory } from "@/lib/prepare/content";
import { useAppState } from "@/lib/state/provider";

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
    <article className="mx-auto max-w-xl md:max-w-3xl">
      <p className="section-kicker">{brief.greeting}</p>
      <p className="mt-2 text-[17px] leading-7">{brief.summary}</p>

      <div className="mt-6 space-y-4">
        {brief.timeline.map((item) => (
          <section key={`${item.kind}-${item.start}-${item.eventId ?? "focus"}`}>
            <p className="text-[13px] text-[var(--muted)]">
              {item.timeLabel} — {item.heading}
            </p>
            {item.meta ? <p className="mt-0.5 text-[15px]">{item.meta}</p> : null}
            {item.lines.map((line) => (
              <p key={line} className="mt-0.5 text-[13px] text-[var(--muted)]">
                {line}
              </p>
            ))}
            {item.action === "prepare" && item.eventId ? (
              <button
                type="button"
                className="btn-quiet mt-2"
                onClick={() => openSheet({ name: "prepare", eventId: item.eventId! })}
              >
                {actionLabelForCategory("meeting")}
              </button>
            ) : null}
          </section>
        ))}
      </div>

      {brief.important.length ? (
        <section className="mt-6">
          <p className="section-kicker">Important</p>
          <ul className="mt-1.5 space-y-1">
            {brief.important.map((task) => (
              <li key={task.id} className="text-[14px] leading-6">
                {task.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <a href="/assistant?prompt=Reorganize%20tomorrow." className="btn-quiet">
          Reorganize Day
        </a>
      </div>
    </article>
  );
}
