export {};

declare global {
  interface TelegramSafeArea {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  }

  interface TelegramWebApp {
    initData?: string;
    initDataUnsafe?: { user?: { id: number; first_name?: string } };
    platform?: string;
    ready: () => void;
    expand: () => void;
    safeAreaInset?: TelegramSafeArea;
    contentSafeAreaInset?: TelegramSafeArea;
  }

  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}
