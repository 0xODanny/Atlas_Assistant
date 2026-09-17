"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: Array<{ href: string; label: string; primary?: boolean }> = [
  { href: "/today", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/assistant", label: "Assistant", primary: true },
  { href: "/brief", label: "Brief" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant }: { variant: "side" | "bottom" }) {
  const pathname = usePathname();

  return (
    <nav
      className={
        variant === "side"
          ? "flex flex-col gap-1"
          : "grid grid-cols-5 items-end"
      }
      aria-label="Main"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-[11px] tracking-wide",
              variant === "side" ? "min-h-12 flex-row justify-start gap-3 rounded-lg px-3 text-sm" : "",
              item.primary && variant === "bottom" ? "-mt-2" : "",
              active ? "text-[var(--foreground)]" : "text-[var(--muted)]",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium",
                item.primary
                  ? active
                    ? "bg-[var(--accent)] text-[var(--background)]"
                    : "bg-[var(--foreground)]/10 text-[var(--foreground)]"
                  : "",
                variant === "side" && !item.primary ? "hidden" : "",
              ].join(" ")}
            >
              {item.primary ? "A" : variant === "bottom" ? item.label.slice(0, 1) : null}
            </span>
            <span className={item.primary && variant === "bottom" ? "font-medium" : ""}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
