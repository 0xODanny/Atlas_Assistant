"use client";

import type { ReactNode } from "react";
import { APP_DISPLAY_NAME } from "@/lib/config";
import { useAppState } from "@/lib/state/provider";
import { EventSheet } from "../sheets/EventSheet";
import { MoveSheet } from "../sheets/MoveSheet";
import { PrepareSheet } from "../sheets/PrepareSheet";
import { AppNav } from "./AppNav";

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, sheet } = useAppState();

  return (
    <div className="flex h-dvh flex-col md:h-auto md:min-h-dvh md:flex-row">
      <aside className="hidden border-r border-[var(--line)] px-5 py-8 md:flex md:w-56 md:flex-col">
        <p className="font-[family-name:var(--font-display)] text-3xl leading-none">{APP_DISPLAY_NAME}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Personal daybook</p>
        <div className="mt-10">
          <AppNav variant="side" />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 px-5 pt-[calc(1rem+env(safe-area-inset-top)+var(--tg-safe-top,0px))] md:hidden">
          <p className="font-[family-name:var(--font-display)] text-2xl">{APP_DISPLAY_NAME}</p>
        </header>
        <main
          data-atlas-main
          className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-5 pb-[var(--atlas-bottom-inset)] pt-4 md:max-w-5xl md:overflow-visible md:px-8 md:pb-8 md:pt-6"
        >
          {ready ? children : <p className="text-[var(--muted)]">Loading your day…</p>}
        </main>
      </div>

      <div
        data-atlas-bottom-nav
        className="fixed inset-x-0 bottom-0 min-h-[var(--atlas-bottom-nav-height)] border-t border-[var(--line)] bg-[var(--background)] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px))] md:hidden"
      >
        <AppNav variant="bottom" />
      </div>

      {sheet?.name === "event" ? <EventSheet /> : null}
      {sheet?.name === "move" ? <MoveSheet /> : null}
      {sheet?.name === "prepare" ? <PrepareSheet /> : null}
    </div>
  );
}
