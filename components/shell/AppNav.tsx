"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AssistantIcon, CalendarIcon, TodayIcon, YouIcon } from "./NavIcons";

const ITEMS: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: "/today", label: "Today", icon: <TodayIcon /> },
  { href: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
  { href: "/assistant", label: "Assistant", icon: <AssistantIcon /> },
  { href: "/settings", label: "You", icon: <YouIcon /> },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/settings") return pathname === href || pathname.startsWith("/settings/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant }: { variant: "side" | "bottom" }) {
  const pathname = usePathname();

  return (
    <nav
      className={variant === "side" ? "atlas-nav-side" : "atlas-nav-bottom"}
      aria-label={variant === "side" ? "Primary" : "Main"}
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            replace
            data-atlas-nav={item.label.toLowerCase()}
            data-atlas-nav-active={active ? "true" : "false"}
            className={["atlas-nav-item", active ? "is-active" : ""].join(" ")}
          >
            <span className="atlas-nav-icon">{item.icon}</span>
            <span className="leading-none">{item.label}</span>
            {active ? (
              <span aria-hidden className="nav-dot" data-atlas-nav-dot="true" />
            ) : variant === "bottom" ? (
              <span aria-hidden className="h-1 w-1" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
