"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { BackControl } from "../shell/BackControl";

type SheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Sheet({ title, onClose, children, footer }: SheetProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="atlas-sheet" data-atlas-sheet>
      <button type="button" aria-label="Close" className="atlas-sheet-backdrop" onClick={onClose} />
      <div className="atlas-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="atlas-sheet-title">
        <header className="atlas-sheet-header">
          <div className="min-w-0">
            <BackControl onClick={onClose} />
            <h2 id="atlas-sheet-title" className="section-title mt-1">
              {title}
            </h2>
          </div>
        </header>
        <div className="atlas-sheet-scroll">{children}</div>
        {footer ? <div className="atlas-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
