"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { atlasBack, routeBackFallback } from "@/lib/navigation/back";
import { useAppState } from "@/lib/state/provider";
import { AvatarButton } from "../ui/AvatarButton";
import { Wordmark } from "../ui/Wordmark";
import { EventSheet } from "../sheets/EventSheet";
import { MoveSheet } from "../sheets/MoveSheet";
import { PrepareSheet } from "../sheets/PrepareSheet";
import { useVisualViewportInsets } from "@/lib/hooks/useVisualViewport";
import { AppNav } from "./AppNav";
import { BackControl } from "./BackControl";
import { ShellChromeProvider, useShellChrome } from "./ShellChrome";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellChromeProvider>
      <AppShellFrame>{children}</AppShellFrame>
    </ShellChromeProvider>
  );
}

function AppShellFrame({ children }: { children: ReactNode }) {
  useVisualViewportInsets();
  const { ready, sheet, state } = useAppState();
  const pathname = usePathname();
  const router = useRouter();
  const { back } = useShellChrome();
  const routeFallback = routeBackFallback(pathname);
  const fallback = back?.fallback ?? routeFallback;
  const showBack = Boolean(back || routeFallback);

  function onBack() {
    if (back?.onBack) {
      back.onBack();
      return;
    }
    atlasBack(router, fallback ?? "/today");
  }

  return (
    <div className="min-h-dvh bg-[var(--atlas-canvas)] md:px-3 md:py-4">
      <div className="atlas-shell mx-auto flex max-w-[var(--atlas-shell-max)] flex-col md:min-h-[calc(100dvh-2rem)] md:flex-row md:overflow-hidden md:border md:border-[var(--atlas-line)] md:shadow-[0_10px_36px_rgba(20,20,22,0.06)]">
        <aside className="hidden border-r border-[var(--atlas-line)] px-5 py-7 md:flex md:w-[var(--atlas-sidebar)] md:shrink-0 md:flex-col">
          <Wordmark />
          <div className="mt-8 flex-1">
            <AppNav variant="side" />
            <Link
              href="/brief"
              className="mt-5 inline-flex min-h-11 items-center text-[15px] text-[var(--atlas-ink)]"
            >
              Morning brief
            </Link>
          </div>
          <AvatarButton name={state.profile.displayName} />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="atlas-header md:hidden">
            {showBack ? <BackControl onClick={onBack} /> : <Wordmark />}
            <AvatarButton name={state.profile.displayName} />
          </header>
          <main data-atlas-main className="atlas-main flex-1">
            {ready ? children : <p className="text-[var(--atlas-muted)]">Loading your day…</p>}
          </main>
        </div>

        {sheet ? null : (
          <div data-atlas-bottom-nav className="atlas-nav-chrome md:hidden">
            <AppNav variant="bottom" />
          </div>
        )}

        {sheet?.name === "event" ? <EventSheet /> : null}
        {sheet?.name === "move" ? <MoveSheet /> : null}
        {sheet?.name === "prepare" ? <PrepareSheet /> : null}
      </div>
    </div>
  );
}
