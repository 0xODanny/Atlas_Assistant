export type AppSurface = "web" | "pwa" | "telegram";

function isTelegramUserAgent(): boolean {
  return typeof navigator !== "undefined" && /Telegram/i.test(navigator.userAgent);
}

export function detectSurface(): AppSurface {
  if (typeof window === "undefined") return "web";
  const telegram = window.Telegram?.WebApp;
  if (telegram && (telegram.initData || telegram.initDataUnsafe?.user)) {
    return "telegram";
  }
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return "pwa";
  }
  return "web";
}

function loadTelegramScript(): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve();
  if (!isTelegramUserAgent()) return Promise.resolve();

  return new Promise((resolve) => {
    const existing = document.querySelector("script[data-atlas-telegram]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.dataset.atlasTelegram = "true";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

function applyTelegramChrome(): boolean {
  const telegram = window.Telegram?.WebApp;
  if (!telegram) return false;

  telegram.ready();
  telegram.expand();

  const top = telegram.contentSafeAreaInset?.top ?? telegram.safeAreaInset?.top ?? 0;
  const bottom = telegram.contentSafeAreaInset?.bottom ?? telegram.safeAreaInset?.bottom ?? 0;
  const left = telegram.contentSafeAreaInset?.left ?? telegram.safeAreaInset?.left ?? 0;
  const right = telegram.contentSafeAreaInset?.right ?? telegram.safeAreaInset?.right ?? 0;

  const root = document.documentElement;
  root.style.setProperty("--tg-safe-top", `${top}px`);
  root.style.setProperty("--tg-safe-bottom", `${bottom}px`);
  root.style.setProperty("--tg-safe-left", `${left}px`);
  root.style.setProperty("--tg-safe-right", `${right}px`);
  root.dataset.surface = detectSurface();
  return Boolean(telegram.initData || telegram.initDataUnsafe?.user);
}

export async function initTelegramWebApp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  await loadTelegramScript();
  return applyTelegramChrome();
}
