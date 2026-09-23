"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { calendarTabHref, subscribeCalendarLocation } from "@/lib/navigation/back";
import { AssistantIcon, CalendarIcon, TodayIcon, YouIcon } from "./NavIcons";

const ITEMS: Array<{ path: string; label: string; icon: ReactNode }> = [
  { path: "/today", label: "Today", icon: <TodayIcon /> },
  { path: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
  { path: "/assistant", label: "Assistant", icon: <AssistantIcon /> },
  { path: "/settings", label: "You", icon: <YouIcon /> },
];

function isActive(pathname: string, path: string): boolean {
  if (path === "/settings") return pathname === path || pathname.startsWith("/settings/");
  return pathname === path || pathname.startsWith(`${path}/`);
}

function itemHref(path: string, calendarHref: string): string {
  return path === "/calendar" ? calendarHref : path;
}

export function AppNav({ variant }: { variant: "side" | "bottom" }) {
  const pathname = usePathname();
  const calendarHref = useSyncExternalStore(subscribeCalendarLocation, calendarTabHref, () => "/calendar");

  return (
    <nav
      className={variant === "side" ? "atlas-nav-side" : "atlas-nav-bottom"}
      aria-label={variant === "side" ? "Primary" : "Main"}
    >
      {ITEMS.map((item) => {
        const href = itemHref(item.path, calendarHref);
        const active = isActive(pathname, item.path);
        return (
          <Link
            key={item.path}
            href={href}
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
