"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ShellBackConfig = {
  fallback: string;
  onBack?: () => void;
} | null;

type ShellChromeValue = {
  back: ShellBackConfig;
  setBack: (back: ShellBackConfig) => void;
};

const ShellChromeContext = createContext<ShellChromeValue>({
  back: null,
  setBack: () => {},
});

export function ShellChromeProvider({ children }: { children: ReactNode }) {
  const [back, setBack] = useState<ShellBackConfig>(null);
  const value = useMemo(() => ({ back, setBack }), [back]);
  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

export function useShellChrome(): ShellChromeValue {
  return useContext(ShellChromeContext);
}

export function useShellBack(back: ShellBackConfig): void {
  const { setBack } = useShellChrome();
  const fallback = back?.fallback ?? "";
  const onBack = back?.onBack;
  useEffect(() => {
    if (!fallback) {
      setBack(null);
      return;
    }
    setBack({ fallback, onBack });
    return () => setBack(null);
  }, [fallback, onBack, setBack]);
}
