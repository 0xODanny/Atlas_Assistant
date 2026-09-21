export const ATLAS_ROOTS = ["/today", "/calendar", "/assistant", "/settings"] as const;

export function routeBackFallback(pathname: string): string | null {
  if (pathname === "/brief") return "/today";
  if (pathname.startsWith("/events/")) return "/calendar";
  if (pathname.startsWith("/settings/") && pathname !== "/settings") return "/settings";
  return null;
}

export function hasAtlasHistory(): boolean {
  if (typeof window === "undefined") return false;
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === "number" && idx > 0) return true;
  const referrer = document.referrer;
  return Boolean(referrer && referrer.startsWith(window.location.origin) && window.history.length > 1);
}

export function atlasBack(
  router: { back: () => void; push: (href: string) => void },
  fallback: string,
): void {
  if (hasAtlasHistory()) {
    router.back();
    return;
  }
  router.push(fallback);
}
