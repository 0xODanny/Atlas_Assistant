import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASSISTANT_PRIMARY_CHIPS } from "../lib/assistant/chips";
import { applyActionLabel, destinationCaption } from "../lib/assistant/applyLabel";
import { splitEditorial } from "../lib/assistant/editorial";
import { dayTimelineItems, todaySubtitle } from "../lib/calendar/timeline";
import { nextActiveEvent } from "../lib/present/status";
import type { AssistantAction } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const ROOT = join(process.cwd());


function event(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "title" | "start" | "end">): CalendarEvent {
  return {
    description: "",
    location: "",
    participants: [],
    privacy: "private",
    preparationRequired: false,
    preparationMinutes: 0,
    source: "google",
    category: "work",
    status: "confirmed",
    createdAt: partial.start,
    updatedAt: partial.start,
    ...partial,
  };
}

test("selected calendar date uses the filled circle, not an underline", () => {
  const strip = readFileSync(join(ROOT, "components/calendar/DateStrip.tsx"), "utf8");
  assert.match(strip, /date-selected/);
  assert.match(strip, /data-atlas-date-selected/);
  assert.doesNotMatch(strip, /h-\[2px\] w-4 bg-\[var\(--atlas-plum\)\]/);
});

test("bottom navigation active state uses the dot, not an underline", () => {
  const nav = readFileSync(join(ROOT, "components/shell/AppNav.tsx"), "utf8");
  assert.match(nav, /nav-dot/);
  assert.match(nav, /data-atlas-nav-dot/);
  assert.doesNotMatch(nav, /h-\[2px\] w-3 bg-\[var\(--atlas-plum\)\]/);
});

test("today timeline renders synchronized events and useful free gaps", () => {
  const items = dayTimelineItems([
    event({
      id: "catchup",
      title: "Product catch-up",
      start: "2026-09-21T14:30:00.000Z",
      end: "2026-09-21T15:00:00.000Z",
      category: "meeting",
    }),
    event({
      id: "lunch",
      title: "Lunch",
      start: "2026-09-21T16:00:00.000Z",
      end: "2026-09-21T17:00:00.000Z",
      category: "personal",
    }),
  ]);
  assert.equal(items[0]?.kind === "event" ? items[0].event.title : "", "Product catch-up");
  assert.equal(items[1]?.kind, "gap");
  assert.equal(items[1]?.kind === "gap" ? items[1].minutes : 0, 60);
  const timeline = readFileSync(join(ROOT, "components/today/TodayTimeline.tsx"), "utf8");
  const today = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  const schedule = readFileSync(join(ROOT, "components/calendar/DaySchedule.tsx"), "utf8");
  assert.match(timeline, /TodayTimeline/);
  assert.match(today, /TodayTimeline/);
  assert.match(timeline, /formatFreeSpan/);
  assert.match(schedule, /formatFreeSpan/);
  assert.match(timeline, /href=\{\`\/events\/\$\{encodeURIComponent\(event\.id\)\}`\}/);
});

test("empty today does not duplicate its message", () => {
  const today = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  assert.equal(todaySubtitle({ eventCount: 0, status: "ready" }), "A clear start.");
  assert.doesNotMatch(today, /Next is /);
  assert.match(today, /Your day is open/);
  assert.match(today, /No events scheduled yet/);
  assert.doesNotMatch(today, /Nothing scheduled today/);
  assert.equal((today.match(/Your day is open/g) ?? []).length, 1);
});

test("up next only renders for an active or future event", () => {
  const today = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  const ended = event({
    id: "ended",
    title: "Ended",
    start: "2026-09-21T12:00:00.000Z",
    end: "2026-09-21T13:00:00.000Z",
  });
  const later = event({
    id: "later",
    title: "Later",
    start: "2026-09-21T20:00:00.000Z",
    end: "2026-09-21T21:00:00.000Z",
  });
  assert.equal(nextActiveEvent([ended], new Date("2026-09-21T14:00:00.000Z")), undefined);
  assert.equal(nextActiveEvent([ended, later], new Date("2026-09-21T14:00:00.000Z"))?.title, "Later");
  assert.match(today, /\{next \? <UpNext/);
  assert.match(today, /data-atlas-up-next/);
});

test("assistant alternatives stay proposals until Apply", () => {
  const result = readFileSync(join(ROOT, "components/assistant/AssistantResult.tsx"), "utf8");
  const preview = readFileSync(join(ROOT, "components/assistant/EventPreview.tsx"), "utf8");
  assert.match(result, /Explore another day/);
  assert.match(result, /Show more times/);
  assert.match(result, /Try next week/);
  assert.match(preview, /action\.status === "proposed"/);
  assert.match(preview, /onApply/);
  assert.doesNotMatch(result, /onBrowse\?\.\("more"\).*onApply/);
});

test("event preview destination matches the Apply destination", () => {
  const preview = readFileSync(join(ROOT, "components/assistant/EventPreview.tsx"), "utf8");
  const create: AssistantAction = {
    id: "a1",
    kind: "propose",
    tool: "createEvent",
    label: "Suggested focus",
    summary: "90 minutes",
    status: "proposed",
    destination: { provider: "google", calendarId: "primary", label: "Work · Google Calendar" },
    payload: {
      type: "createEvent",
      event: {
        title: "Focus time",
        start: "2026-09-21T17:30:00.000Z",
        end: "2026-09-21T19:00:00.000Z",
      },
    },
  };
  assert.equal(applyActionLabel(create), "Add to calendar");
  assert.equal(destinationCaption(create), "Work · Google Calendar");
  assert.match(preview, /destinationCaption\(action\)/);
  assert.match(preview, /data-atlas-destination/);
});

test("settings rows stack long values and wrap emails", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const settings = readFileSync(join(ROOT, "components/settings/SettingsView.tsx"), "utf8");
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.setting-row/);
  assert.match(css, /flex-direction:\s*column/);
  assert.match(settings, /SettingRow/);
  assert.match(settings, /overflow-x-hidden/);
});

test("mobile content keeps bottom-navigation clearance", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  assert.match(css, /--atlas-bottom-inset/);
  assert.match(css, /\.atlas-main/);
  assert.match(shell, /atlas-main/);
});

test("preferred name stays authoritative in views", () => {
  const today = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  const settings = readFileSync(join(ROOT, "components/settings/SettingsView.tsx"), "utf8");
  assert.match(today, /profile\.displayName/);
  assert.match(settings, /profile\.displayName/);
  assert.doesNotMatch(today, /displayName === ["']Daniel["']/);
  assert.doesNotMatch(today, /["']Danny["']/);
});

test("mobile shell uses editorial scale from the reference", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.match(css, /--atlas-page-pad:\s*clamp\(/);
  assert.match(css, /--atlas-display:\s*clamp\(/);
  assert.match(css, /--atlas-display-cal:\s*clamp\(/);
  assert.match(css, /--atlas-wordmark-size:\s*clamp\(/);
  assert.match(css, /\.display-title[\s\S]*font-size:\s*var\(--atlas-display\)/);
  assert.match(css, /\.atlas-nav-item[\s\S]*font-size:\s*12px/);
  assert.match(css, /\.week-event[\s\S]*font-size:\s*16px/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.setting-row/);
  assert.match(css, /\.atlas-sheet/);
  assert.doesNotMatch(css, /max-width:\s*430px/);
});

test("assistant hides provider source and groups alternative actions", () => {
  const result = readFileSync(join(ROOT, "components/assistant/AssistantResult.tsx"), "utf8");
  assert.doesNotMatch(result, /Source ·|SOURCE ·|showSource/);
  assert.match(result, /formatRangeCompact/);
  assert.match(result, /assistant-alts/);
  assert.match(result, /Best uninterrupted opening/);
});

test("assistant primary starters are four editorial rows", () => {
  assert.equal(ASSISTANT_PRIMARY_CHIPS.length, 4);
  const chat = readFileSync(join(ROOT, "components/assistant/AssistantChat.tsx"), "utf8");
  const result = readFileSync(join(ROOT, "components/assistant/AssistantResult.tsx"), "utf8");
  assert.match(chat, /ASSISTANT_PRIMARY_CHIPS/);
  assert.match(chat, /Ask Atlas anything/);
  assert.match(chat, /is-landing/);
  assert.match(chat, /!active \?/);
  assert.match(result, /result-title/);
  assert.match(result, /slice\(0, 2\)/);
  const editorial = splitEditorial("You have two good openings. Both sit before the afternoon call.");
  assert.equal(editorial.title, "You have two good openings.");
  assert.equal(editorial.body, "Both sit before the afternoon call.");
});
