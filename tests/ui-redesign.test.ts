import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyActionLabel, destinationCaption } from "../lib/assistant/applyLabel";
import { hoursInRange, layoutTimedEvents, visibleHourRange } from "../lib/calendar/dayLayout";
import { dayTimelineItems, todaySubtitle } from "../lib/calendar/timeline";
import { createSeedState } from "../lib/data/seed";
import { nextActiveEvent } from "../lib/present/status";
import { eventJoinAction, eventPlaceLabel } from "../lib/present/link";
import { formatUninterruptedSpan, greetingEditorial, remainingOpenLabel } from "../lib/format";
import type { AssistantAction } from "../lib/types/assistant";
import type { CalendarEvent } from "../lib/types/event";

const ROOT = join(process.cwd());

const TZ = "America/New_York";

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

test("editorial greeting uses first name and a period", () => {
  assert.equal(greetingEditorial("2026-09-21T13:00:00.000Z", TZ, "Daniel Alvarez"), "Morning, Daniel.");
  assert.equal(greetingEditorial("2026-09-21T18:00:00.000Z", TZ, "Daniel"), "Afternoon, Daniel.");
  assert.equal(greetingEditorial("2026-09-21T23:00:00.000Z", TZ, "Daniel"), "Evening, Daniel.");
});

test("today subtitle stays factual and never invents events", () => {
  assert.equal(todaySubtitle({ eventCount: 0, status: "ready" }), "A clear start.");
  assert.equal(
    todaySubtitle({
      status: "ready",
      timezone: TZ,
      events: [
        {
          start: "2026-09-21T21:30:00.000Z",
          end: "2026-09-21T22:30:00.000Z",
          allDay: false,
          category: "training",
        },
      ],
    }),
    "A clear morning. Training this evening.",
  );
  assert.equal(todaySubtitle({ eventCount: 0, status: "loading" }), "Loading your calendar.");
  assert.doesNotMatch(
    todaySubtitle({
      status: "ready",
      timezone: TZ,
      events: [
        {
          start: "2026-09-21T21:30:00.000Z",
          end: "2026-09-21T22:30:00.000Z",
          allDay: false,
          category: "training",
        },
      ],
    }),
    /Swim|Bike|Next is/,
  );
});

test("preferred display name is read from the profile, not hardcoded in views", () => {
  const seed = createSeedState(new Date("2026-09-21T16:00:00.000Z"));
  assert.equal(seed.profile.displayName, "Danny");
  const today = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  const settings = readFileSync(join(ROOT, "components/settings/SettingsView.tsx"), "utf8");
  assert.match(today, /profile\.displayName/);
  assert.match(settings, /profile\.displayName/);
  assert.doesNotMatch(today, /["']Danny["']/);
  assert.doesNotMatch(settings, /["']Danny["']/);
});

test("open remainder to midnight is rest of day, and brief hours are not rounded up", () => {
  assert.equal(remainingOpenLabel("2026-09-21T16:20:00.000Z", "2026-09-22T04:00:00.000Z", TZ), "Rest of day open");
  assert.match(remainingOpenLabel("2026-09-21T16:00:00.000Z", "2026-09-21T20:00:00.000Z", TZ), /–|-/);
  assert.equal(formatUninterruptedSpan(700), "11 hours 40 minutes uninterrupted");
  assert.equal(formatUninterruptedSpan(180), "3 uninterrupted hours");
});

test("shell and copy stay constrained, contrast-forward, and non-technical", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  const assistant = readFileSync(join(ROOT, "components/assistant/AssistantChat.tsx"), "utf8");
  const settings = readFileSync(join(ROOT, "components/settings/SettingsView.tsx"), "utf8");
  const week = readFileSync(join(ROOT, "components/calendar/WeekView.tsx"), "utf8");
  const brief = readFileSync(join(ROOT, "components/brief/MorningBrief.tsx"), "utf8");
  assert.match(css, /--atlas-shell-max:\s*80rem/);
  assert.match(css, /--atlas-sidebar:\s*12\.5rem/);
  assert.match(css, /--atlas-page:\s*50rem/);
  assert.match(css, /--atlas-ink:\s*#141416/i);
  assert.match(css, /font-weight:\s*450/);
  assert.match(shell, /atlas-shell/);
  assert.match(shell, /--atlas-canvas/);
  assert.match(assistant, /starter-row/);
  assert.match(assistant, /I’ll ask before changing your calendar/);
  assert.doesNotMatch(assistant, /silently edit/);
  assert.doesNotMatch(settings, /server-side key/);
  assert.doesNotMatch(week, /HourRail/);
  assert.doesNotMatch(week, /TimeGrid/);
  assert.match(week, /snap-x/);
  assert.match(week, /week-panel/);
  assert.match(brief, /formatFullDateUpper/);
  assert.doesNotMatch(brief, /brief\.greeting/);
});

test("timeline lists events first and only inserts useful free gaps", () => {
  const items = dayTimelineItems([
    event({
      id: "bike",
      title: "Bike",
      start: "2026-09-21T19:45:00.000Z",
      end: "2026-09-21T21:15:00.000Z",
      category: "training",
    }),
    event({
      id: "focus",
      title: "Focus",
      start: "2026-09-21T21:45:00.000Z",
      end: "2026-09-21T23:15:00.000Z",
      category: "focus",
    }),
  ]);
  assert.equal(items[0]?.kind, "event");
  assert.equal(items[0]?.kind === "event" ? items[0].event.title : "", "Bike");
  assert.equal(items[1]?.kind, "gap");
  assert.equal(items[1]?.kind === "gap" ? items[1].minutes : 0, 30);
  assert.equal(items[2]?.kind === "event" ? items[2].event.title : "", "Focus");
});

test("up next uses the active or future event, never an ended one", () => {
  const bike = event({
    id: "bike",
    title: "Bike",
    start: "2026-09-21T19:45:00.000Z",
    end: "2026-09-21T21:15:00.000Z",
  });
  const later = event({
    id: "later",
    title: "Dinner",
    start: "2026-09-21T23:00:00.000Z",
    end: "2026-09-22T00:00:00.000Z",
  });
  assert.equal(nextActiveEvent([bike, later], new Date("2026-09-21T20:00:00.000Z"))?.title, "Bike");
  assert.equal(nextActiveEvent([bike, later], new Date("2026-09-21T21:16:00.000Z"))?.title, "Dinner");
  assert.equal(nextActiveEvent([bike], new Date("2026-09-21T21:16:00.000Z")), undefined);
});

test("join actions appear only when a real link exists", () => {
  assert.equal(eventJoinAction({ location: "Equinox", description: "" }), undefined);
  assert.equal(eventPlaceLabel({ location: "Equinox" }), "Equinox");
  assert.deepEqual(eventJoinAction({ location: "https://meet.google.com/abc-defg-hij", description: "" }), {
    href: "https://meet.google.com/abc-defg-hij",
    label: "Join",
  });
});

test("calendar layout stacks overlapping events and keeps hour range readable", () => {
  const day = new Date("2026-09-21T12:00:00.000Z");
  const laid = layoutTimedEvents(
    [
      event({
        id: "a",
        title: "Standup",
        start: "2026-09-21T15:00:00.000Z",
        end: "2026-09-21T15:30:00.000Z",
        category: "meeting",
      }),
      event({
        id: "b",
        title: "Overlap",
        start: "2026-09-21T15:15:00.000Z",
        end: "2026-09-21T16:00:00.000Z",
        category: "work",
      }),
    ],
    TZ,
    day,
    7,
    22,
  );
  assert.equal(laid.length, 2);
  assert.ok(laid.some((item) => item.columns >= 2));
  const range = visibleHourRange([], TZ, day);
  assert.equal(range.startHour, 7);
  assert.deepEqual(hoursInRange(7, 9), [7, 8]);
});

test("apply labels stay context-aware and destination text matches the action", () => {
  const create: AssistantAction = {
    id: "a1",
    kind: "propose",
    tool: "createEvent",
    label: "Suggested focus",
    summary: "90 minutes",
    status: "proposed",
    destination: { provider: "google", calendarId: "primary", label: "Google Calendar · Personal" },
    payload: {
      type: "createEvent",
      event: {
        title: "Focus",
        start: "2026-09-21T21:45:00.000Z",
        end: "2026-09-21T23:15:00.000Z",
      },
    },
  };
  assert.equal(applyActionLabel(create), "Add to calendar");
  assert.equal(applyActionLabel(create, true), "Adding…");
  assert.equal(destinationCaption(create), "Google Calendar · Personal");
  assert.equal(
    applyActionLabel({
      ...create,
      payload: { type: "updateEvent", id: "evt", patch: { start: create.payload && "event" in create.payload ? create.payload.event.start : "" } },
    }),
    "Move event",
  );
  assert.equal(applyActionLabel({ ...create, payload: { type: "deleteEvent", id: "evt" } }), "Delete event");
});

test("timeline axis uses one shared token for the line and marker track", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.match(css, /--atlas-timeline-axis:/);
  assert.match(css, /\.timeline::before[\s\S]*left:\s*var\(--atlas-timeline-axis\)/);
  assert.match(css, /\.timeline-dot[\s\S]*justify-self:\s*center/);
  assert.doesNotMatch(css, /left:\s*5\.15rem/);
  const today = readFileSync(join(ROOT, "components/today/TodayTimeline.tsx"), "utf8");
  const day = readFileSync(join(ROOT, "components/calendar/DaySchedule.tsx"), "utf8");
  assert.match(today, /className="timeline /);
  assert.match(day, /className="timeline"/);
  assert.match(today, /timeline-dot is-event/);
  assert.match(day, /timeline-dot is-event/);
});

test("assistant composer keeps focus on the outer pill and includes a microphone", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const chat = readFileSync(join(ROOT, "components/assistant/AssistantChat.tsx"), "utf8");
  const hook = readFileSync(join(ROOT, "lib/hooks/useSpeechDictation.ts"), "utf8");
  assert.match(css, /\.composer-shell:focus-within/);
  assert.match(css, /\.composer-shell textarea:focus-visible[\s\S]*outline:\s*none/);
  assert.match(css, /\.composer-input[\s\S]*max-height:\s*calc\(1\.45em \* 4/);
  assert.match(css, /\.composer-controls[\s\S]*flex:\s*0 0 auto/);
  assert.match(chat, /<textarea/);
  assert.match(chat, /className="composer-input"/);
  assert.match(chat, /composer-controls/);
  assert.match(css, /\.composer-input[\s\S]*overflow-x:\s*hidden/);
  assert.match(css, /\.composer-input[\s\S]*min-width:\s*0/);
  assert.match(chat, /composer-mic/);
  assert.match(chat, /Dictate/);
  assert.match(chat, /Voice input isn’t supported in this browser/);
  assert.match(chat, /Waiting for microphone access/);
  assert.doesNotMatch(chat, /placeholder=\{dictation\.listening \? "Listening/);
  assert.match(hook, /webkitSpeechRecognition|SpeechRecognition/);
  assert.match(hook, /not-allowed/);
  assert.match(hook, /requesting-permission/);
  assert.match(hook, /onstart/);
  assert.match(hook, /setStatus\("listening"\)/);
  assert.doesNotMatch(hook, /recognition\.start\(\);\s*setStatus\("listening"\)/);
});

test("settings groups existing controls without dropping values", () => {
  const settings = readFileSync(join(ROOT, "components/settings/SettingsView.tsx"), "utf8");
  assert.match(settings, />Calendar</);
  assert.match(settings, />Scheduling</);
  assert.match(settings, />Training</);
  assert.match(settings, />Appearance</);
  assert.match(settings, /Event colors/);
  assert.match(settings, />Account & integrations</);
  assert.match(settings, /morningBriefTime/);
  assert.match(settings, /afterWorkoutBufferMinutes/);
  assert.match(settings, /privacyDefault/);
  assert.match(settings, /eventColorOverrides/);
});
