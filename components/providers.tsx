"use client";

import type { ReactNode } from "react";
import { AppStateProvider } from "@/lib/state/provider";
import { AppShell } from "./shell/AppShell";
import { PwaRegister } from "./shell/PwaRegister";
import { TelegramReady } from "./shell/TelegramReady";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppStateProvider>
      <TelegramReady />
      <PwaRegister />
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  );
}
