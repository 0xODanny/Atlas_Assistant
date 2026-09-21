"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ASSISTANT_PRIMARY_CHIPS } from "@/lib/assistant/chips";
import { resolveChoiceFromText } from "@/lib/assistant/followUp";
import { actionFromCreateChoice, actionFromMoveChoice } from "@/lib/assistant/fulfill";
import { addMinutes } from "@/lib/time";
import { describeAddedWorkout } from "@/lib/calendar/workoutSchedule";
import { canSubmitAssistant } from "@/lib/assistant/submit";
import {
  emptyWorkspace,
  keepActiveWithError,
  replaceActiveResponse,
  restoreHistoryTurn,
  selectActiveChoice,
  updateActiveAction,
  type AssistantWorkspace,
} from "@/lib/assistant/workspace";
import { createId } from "@/lib/id";
import { useNow } from "@/lib/hooks/useNow";
import { useAppState } from "@/lib/state/provider";
import { readClockNow } from "@/lib/time/clock";
import type { AssistantChoice, AssistantResponse } from "@/lib/types/assistant";
import { useVisualMode } from "@/lib/hooks/useVisualMode";
import { visualAssistantTurn } from "@/lib/present/visualFixture";
import { useRouter } from "next/navigation";
import { useSpeechDictation } from "@/lib/hooks/useSpeechDictation";
import { useShellBack } from "../shell/ShellChrome";
import { AssistantResult } from "./AssistantResult";

export function AssistantChat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { state, applyAction, googleWriteEnabled, openSheet } = useAppState();
  const now = useNow();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [workspace, setWorkspace] = useState<AssistantWorkspace>(emptyWorkspace);
  const dictation = useSpeechDictation(setInput);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const visualMode = useVisualMode();

  useEffect(() => {
    if (visualMode !== "assistant" || workspaceRef.current.active) return;
    setWorkspace(replaceActiveResponse(emptyWorkspace(), visualAssistantTurn(now, state.profile.timezone)));
  }, [now, state.profile.timezone, visualMode]);

  const context = useMemo(
    () => ({
      now: now.toISOString(),
      timezone: state.profile.timezone,
      profile: state.profile,
      events: state.events,
      tasks: state.tasks,
      workouts: state.workouts,
      meetings: state.meetings,
      connections: state.connections,
      googleWriteEnabled: googleWriteEnabled || Boolean(state.connections.google.writeEnabled),
      selectedEventId: searchParams.get("eventId") ?? undefined,
    }),
    [googleWriteEnabled, now, searchParams, state],
  );

  function applyChoice(choice: AssistantChoice) {
    const current = workspaceRef.current.active;
    if (!current) return;
    const nextAction = current.targetEventId
      ? actionFromMoveChoice(context, current.targetEventId, choice)
      : actionFromCreateChoice(context, current.pending ?? current.resume, choice);
    if (!nextAction) return;
    setWorkspace((value) => selectActiveChoice(value, choice.id, nextAction));
  }

  async function send(text: string, continuePending = false) {
    const trimmed = text.trim();
    if (!canSubmitAssistant(pending, trimmed)) return;
    dictation.stop();

    if (continuePending && workspaceRef.current.active?.choices?.length) {
      const matched = resolveChoiceFromText(trimmed, workspaceRef.current.active.choices);
      if (matched) {
        setInput("");
        applyChoice(matched);
        return;
      }
    }

    setInput("");
    setPending(true);
    setShowHistory(false);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: trimmed }],
          context: { ...context, now: readClockNow().toISOString() },
          pending: continuePending
            ? workspaceRef.current.active?.pending ?? workspaceRef.current.active?.resume
            : undefined,
        }),
      });
      const data = (await response.json()) as AssistantResponse;
      if (!response.ok || data.source === "error" || data.error) {
        if (data.source === "error" || data.error) {
          if (workspaceRef.current.active) {
            setWorkspace((current) =>
              keepActiveWithError(current, data.message || "The assistant could not complete that request. Nothing was changed."),
            );
            return;
          }
        }
        if (!response.ok) throw new Error("bad_request");
      }
      const next = {
        id: createId("turn"),
        prompt: trimmed,
        content: data.message,
        actions: data.actions ?? [],
        intentType: data.intentType,
        choices: data.choices,
        selectedChoiceId: data.choices?.[0]?.id,
        pending: data.pending,
        resume: data.resume,
        targetEventId: data.targetEventId,
        windows: data.windows,
        error: data.error,
        source: data.source,
      };
      setWorkspace((current) => replaceActiveResponse(current, next));
    } catch {
      setWorkspace((current) =>
        current.active
          ? keepActiveWithError(current, "I could not reach the assistant runtime. Nothing was changed.")
          : replaceActiveResponse(current, {
              id: createId("turn"),
              prompt: trimmed,
              content: "I could not reach the assistant runtime. Nothing was changed.",
              actions: [],
              error: "unavailable",
              source: "error",
            }),
      );
    } finally {
      setPending(false);
    }
  }

  const startedFromQuery = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt && !startedFromQuery.current) {
      startedFromQuery.current = true;
      void sendRef.current(prompt, false);
    }
  }, [searchParams]);

  const active = workspace.active;

  const clearToLanding = useCallback(() => {
    setWorkspace(emptyWorkspace());
    setShowHistory(false);
    if (searchParams.get("prompt") || searchParams.get("visual")) {
      router.replace("/assistant");
    }
  }, [router, searchParams]);

  useShellBack(active ? { fallback: "/assistant", onBack: clearToLanding } : null);

  function selectChoice(choice: AssistantChoice) {
    applyChoice(choice);
  }

  return (
    <div className={`assistant-workspace page-column ${active ? "is-result" : "is-landing"}`}>
      {!active ? (
        <div>
          <p className="section-kicker">Assistant</p>
          <h1 className="display-title-assistant mt-2" data-atlas-assistant-heading>
            Make room for what matters.
          </h1>
          <p className="body-copy mt-5 max-w-md">I’ll ask before changing your calendar.</p>
        </div>
      ) : workspace.history.length ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn-quiet shrink-0"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            History
          </button>
        </div>
      ) : null}
      {showHistory ? (
        <ul className="mt-3 space-y-1">
          {workspace.history.map((turn) => (
            <li key={turn.id}>
              <button
                type="button"
                className="text-left text-[15px] text-[var(--muted)] underline-offset-2 hover:underline"
                onClick={() => {
                  setWorkspace((current) => restoreHistoryTurn(current, turn.id));
                  setShowHistory(false);
                }}
              >
                {turn.prompt}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mt-4 min-h-0 flex-1" aria-live="polite" data-testid="assistant-active">
        {pending ? (
          <p className="min-h-5 text-[16px] text-[var(--atlas-muted)]">Thinking…</p>
        ) : (
          <p className="min-h-5 text-[16px] text-[var(--atlas-muted)]">{workspace.lastError ?? ""}</p>
        )}
        {!active ? (
          <div>
            {ASSISTANT_PRIMARY_CHIPS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="starter-row"
                disabled={pending}
                onClick={() => void send(prompt, false)}
              >
                <span>{prompt}</span>
                <span className="starter-arrow" aria-hidden>→</span>
              </button>
            ))}
          </div>
        ) : (
          <AssistantResult
            key={active.id}
            turn={active}
            timezone={state.profile.timezone}
            onSelectChoice={selectChoice}
            onDurationChange={(minutes) => {
              void send(`make it ${minutes} minutes`, true);
            }}
            onCustomTime={(start) => {
              const minutes = active.pending?.durationMinutes ?? 60;
              applyChoice({
                id: `slot:${start.toISOString()}`,
                label: "Custom time",
                start: start.toISOString(),
                end: addMinutes(start, minutes).toISOString(),
              });
            }}
            onBrowse={(kind, date) => {
              if (kind === "more") void send("more times", true);
              else if (kind === "next_week") void send("next week", true);
              else if (kind === "date" && date) void send(date, true);
            }}
            onView={(eventId) => openSheet({ name: "event", mode: "edit", eventId })}
            onMove={(eventId) => openSheet({ name: "move", eventId })}
            applying={applying}
            onApply={(id) => {
              const current = active.actions.find((item) => item.id === id);
              if (!current || applying || pending) return;
              setApplying(true);
              void applyAction(current)
                .then((result) => {
                  setWorkspace((value) => {
                    const next = updateActiveAction(value, id, result);
                    if (result.status === "applied" && result.payload?.type === "createEvent" && next.active) {
                      return {
                        ...next,
                        active: {
                          ...next.active,
                          content: describeAddedWorkout({
                            title: result.payload.event.title,
                            start: result.payload.event.start,
                            end: result.payload.event.end,
                            timezone: state.profile.timezone,
                            now: readClockNow(),
                          }),
                          choices: undefined,
                        },
                      };
                    }
                    return next;
                  });
                })
                .finally(() => setApplying(false));
            }}
            onDismiss={(id) => {
              const current = active.actions.find((item) => item.id === id);
              if (!current) return;
              setWorkspace((value) => updateActiveAction(value, id, { ...current, status: "dismissed" }));
            }}
          />
        )}
      </section>

      <form
        className="atlas-composer-dock mt-auto shrink-0"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input, true);
        }}
      >
        <label className="sr-only" htmlFor="assistant-input">
          Message
        </label>
        <div className="composer-shell">
          <input
            id="assistant-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={dictation.listening ? "Listening…" : "Ask Atlas anything…"}
            disabled={pending}
          />
          <button
            type="button"
            className={`composer-mic${dictation.listening ? " is-listening" : ""}`}
            aria-label={dictation.listening ? "Stop voice input" : "Dictate"}
            aria-pressed={dictation.listening}
            disabled={pending || dictation.status === "unsupported"}
            onClick={() => dictation.toggle(input)}
          >
            <MicIcon />
          </button>
          <button type="submit" className="composer-send" disabled={pending} aria-label="Send">
            →
          </button>
        </div>
        {dictation.status === "unsupported" ? (
          <p className="composer-voice-note">Voice input isn’t supported in this browser.</p>
        ) : dictation.status === "denied" ? (
          <p className="composer-voice-note">Microphone access was denied. You can still type.</p>
        ) : dictation.status === "error" ? (
          <p className="composer-voice-note">Voice input couldn’t start. Try again or type instead.</p>
        ) : dictation.listening ? (
          <p className="composer-voice-note">Listening… tap the microphone to stop.</p>
        ) : null}
      </form>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="6.25" y="2.25" width="5.5" height="8.5" rx="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 8.5a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 13.5v2.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
