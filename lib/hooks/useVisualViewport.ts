"use client";

import { useEffect } from "react";

const KEYBOARD_OPEN_PX = 80;

function applyVisualViewportInsets() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  if (!viewport) {
    root.style.setProperty("--atlas-keyboard-inset", "0px");
    root.classList.remove("is-keyboard-open");
    return;
  }
  const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  root.style.setProperty("--atlas-keyboard-inset", `${Math.round(inset)}px`);
  root.classList.toggle("is-keyboard-open", inset > KEYBOARD_OPEN_PX);
  if (window.matchMedia("(display-mode: standalone)").matches) {
    root.dataset.surface = "pwa";
  }
}

export function useVisualViewportInsets() {
  useEffect(() => {
    applyVisualViewportInsets();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", applyVisualViewportInsets);
    viewport?.addEventListener("scroll", applyVisualViewportInsets);
    window.addEventListener("focusin", applyVisualViewportInsets);
    window.addEventListener("focusout", applyVisualViewportInsets);
    return () => {
      viewport?.removeEventListener("resize", applyVisualViewportInsets);
      viewport?.removeEventListener("scroll", applyVisualViewportInsets);
      window.removeEventListener("focusin", applyVisualViewportInsets);
      window.removeEventListener("focusout", applyVisualViewportInsets);
    };
  }, []);
}
