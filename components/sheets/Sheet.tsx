"use client";

import type { ReactNode } from "react";

type SheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface)] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom)+var(--tg-safe-bottom,0px))] pt-4 md:max-w-md md:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">{title}</h2>
          <button type="button" className="btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
