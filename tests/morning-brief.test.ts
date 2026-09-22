import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { generateBrief } from "../lib/brief/generateBrief";
import { DEFAULT_WORKOUT_HOURS, resolveScheduleHours } from "../lib/calendar/hours";
import { DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES } from "../lib/calendar/transitionBuffer";
import { createSeedState } from "../lib/data/seed";
import { addMinutes, atZonedTime, zonedLocalToUtc, zonedParts } from "../lib/time";
import type { CalendarEvent } from "../lib/types/event";
import type { UserProfile } from "../lib/types/profile";
import type { Workout } from "../lib/types/training";

const LA = "America/Los_Angeles";
const ROOT = join(process.cwd());

function profile(now: Date): UserProfile {
  const state = createSeedState(now);
  return { ...state.profile, timezone: LA };
}

function event(
  id: string,
  title: string,
  start: Date,
  minutes: number,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title,
    description: extra.description ?? "",
    start: start.toISOString(),
    end: addMinutes(start, minutes).toISOString(),
    location: extra.location ?? "",
    participants: extra.participants ?? [],
    privacy: extra.privacy ?? "busy-only",
    preparationRequired: extra.preparationRequired ?? false,
    preparationMinutes: extra.preparationMinutes ?? 0,
    source: extra.source ?? "local",
    category: extra.category ?? "personal",
    status: extra.status ?? "confirmed",
    calendarId: extra.calendarId ?? "local-primary",
    timezone: LA,
    allDay: extra.allDay,
    blocksTime: extra.blocksTime,
    transparency: extra.transparency,
    workoutId: extra.workoutId,
    meetingId: extra.meetingId,
    providerEventId: extra.providerEventId,
    demo: false,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  };
}

function productionDay(now: Date) {
  const bikeStart = atZonedTime(LA, now, 7, 30);
  const meetingStart = atZonedTime(LA, now, 11, 0);
  const yogaStart = atZonedTime(LA, now, 17, 0);
  const swimStart = atZonedTime(LA, now, 17, 30);
  const events = [
    event("evt_bike", "Bike", bikeStart, 60, { category: "training", workoutId: "workout_bike" }),
    event("evt_pepinho", "Pepinho Meeting", meetingStart, 45, {
      category: "meeting",
      meetingId: "meet_pepinho",
      preparationRequired: true,
      preparationMinutes: 15,
    }),
    event("evt_yoga", "Yoga", yogaStart, 15, { category: "training" }),
    event("evt_swim", "Swim", swimStart, 60, { category: "training", workoutId: "workout_swim" }),
  ];
  const workouts: Workout[] = [
    {
      id: "workout_bike",
      eventId: "evt_bike",
      sport: "bike",
      duration: 60,
      intensity: "zone2",
      description: "Outdoor endurance ride",
      scheduledTime: bikeStart.toISOString(),
      completed: false,
      weatherDependent: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "workout_swim",
      eventId: "evt_swim",
      sport: "swim",
      duration: 60,
      intensity: "moderate",
      description: "Endurance + technique",
      scheduledTime: swimStart.toISOString(),
      completed: false,
      weatherDependent: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];
  return { events, workouts, profile: profile(now) };
}

function briefAt(hour: number, minute = 0, extra: { events?: CalendarEvent[]; workouts?: Workout[]; now?: Date } = {}) {
  const now = extra.now ?? zonedLocalToUtc(LA, 2026, 9, 21, hour, minute);
  const day = productionDay(now);
  return generateBrief({
    now,
    profile: day.profile,
    events: extra.events ?? day.events,
    tasks: [],
    workouts: extra.workouts ?? day.workouts,
    meetings: [],
  });
}

test("production morning brief facts for the Sep 21 LA day", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 7, 15);
  const day = productionDay(now);
  assert.equal(day.profile.afterWorkoutBufferMinutes, DEFAULT_AFTER_WORKOUT_BUFFER_MINUTES);
  assert.equal(resolveScheduleHours(day.profile, "workout").start, DEFAULT_WORKOUT_HOURS.start);
  const brief = briefAt(7, 15);
  assert.equal(brief.timezone, LA);
  assert.equal(zonedParts(LA, new Date(brief.date)).day, 21);
  assert.deepEqual(
    brief.events.map((item) => item.title),
    ["Bike", "Pepinho Meeting", "Yoga", "Swim"],
  );
  assert.equal(brief.events.find((item) => item.title === "Bike")?.training, true);
  assert.equal(brief.events.find((item) => item.title === "Yoga")?.training, true);
  assert.equal(brief.events.find((item) => item.title === "Swim")?.training, true);
  assert.equal(brief.events.find((item) => item.title === "Pepinho Meeting")?.category, "meeting");
  assert.equal(brief.workouts.length, 3);
  assert.equal(brief.nextEvent?.title, "Bike");
  assert.equal(brief.nextEvent?.status, "next");
  const longest = brief.openBlocks[0];
  assert.ok(longest);
  assert.equal(longest.minutes, 315);
  const start = zonedParts(LA, new Date(longest.start));
  const end = zonedParts(LA, new Date(longest.end));
  assert.equal(start.hour, 11);
  assert.equal(start.minute, 45);
  assert.equal(end.hour, 17);
  assert.equal(end.minute, 0);
  assert.equal(brief.openBlocks.filter((block) => block.start === longest.start).length, 1);
  assert.equal(brief.glance.eventCount, 4);
  assert.equal(brief.glance.workoutCount, 3);
  assert.equal(brief.glance.openMinutes, 735);
  assert.equal(brief.glance.meaningfulOpenMinutes, 735);
  assert.ok(brief.issues.some((issue) => issue.kind === "workout_buffer" && /Yoga/.test(issue.text) && /Swim/.test(issue.text)));
  assert.ok(brief.recommendations.some((note) => /after Yoga/.test(note.text)));
  assert.equal(brief.recommendations.some((note) => /after Bike/.test(note.text)), false);
  assert.equal(brief.recommendations.some((note) => /investor|deck|deadline/i.test(note.text)), false);
  assert.ok(brief.openBlocks.every((block) => zonedParts(LA, new Date(block.start)).day === 21));
});

test("brief evolves across 7:15 AM, 2:00 PM, and 6:45 PM", () => {
  const morning = briefAt(7, 15);
  assert.equal(morning.nextEvent?.title, "Bike");
  assert.equal(morning.events.filter((item) => item.phase === "upcoming").length, 4);
  assert.deepEqual(
    morning.openBlocks.map((block) => block.minutes).sort((a, b) => b - a),
    [315, 300, 120],
  );

  const midday = briefAt(14, 0);
  assert.equal(midday.nextEvent?.title, "Yoga");
  assert.equal(midday.glance.eventCount, 4);
  assert.equal(midday.glance.workoutCount, 3);
  assert.equal(midday.glance.openMinutes, 480);
  assert.equal(midday.events.find((item) => item.title === "Bike")?.phase, "completed");
  assert.equal(midday.events.find((item) => item.title === "Pepinho Meeting")?.phase, "completed");
  assert.ok(zonedParts(LA, new Date(midday.openBlocks[0]!.start)).hour >= 14);
  assert.ok(midday.glance.openMinutes < morning.glance.openMinutes);
  assert.deepEqual(
    midday.openBlocks.map((block) => block.minutes).sort((a, b) => b - a),
    [300, 180],
  );

  const evening = briefAt(18, 45);
  assert.equal(evening.nextEvent, undefined);
  assert.equal(evening.glance.eventCount, 4);
  assert.equal(evening.glance.openMinutes, 300);
  assert.equal(evening.events.find((item) => item.title === "Swim")?.phase, "completed");
  assert.ok(evening.openBlocks.every((block) => new Date(block.start).getTime() >= zonedLocalToUtc(LA, 2026, 9, 21, 18, 45).getTime()));
  assert.deepEqual(evening.openBlocks.map((block) => block.minutes), [300]);
  assert.equal(evening.recommendations.some((note) => /tightly scheduled/.test(note.text)), false);
});

test("next event is current while an event is happening", () => {
  const brief = briefAt(11, 20);
  assert.equal(brief.nextEvent?.title, "Pepinho Meeting");
  assert.equal(brief.nextEvent?.status, "now");
  assert.match(brief.nextEvent?.timeLabel ?? "", /until/);
});

test("empty day has no manufactured next event and reports remaining open time", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 7, 15);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [],
    tasks: [],
    workouts: [],
  });
  assert.equal(brief.eventCount, 0);
  assert.equal(brief.nextEvent, undefined);
  assert.equal(brief.workouts.length, 0);
  assert.match(brief.lead, /clear today/);
  assert.ok(brief.openMinutes > 0);
});

test("one-event day emphasizes the event and surrounding open time", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const only = event("evt_one", "Design review", atZonedTime(LA, now, 15, 0), 60, { category: "meeting" });
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [only],
    tasks: [],
    workouts: [],
  });
  assert.equal(brief.nextEvent?.title, "Design review");
  assert.equal(brief.workouts.length, 0);
  assert.ok(brief.openBlocks.some((block) => block.minutes >= 60));
  assert.ok(brief.openBlocks.some((block) => new Date(block.end).getTime() <= new Date(only.start).getTime()));
});

test("no-workout day omits training facts", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [event("evt_meet", "Standup", atZonedTime(LA, now, 10, 0), 30, { category: "meeting" })],
    tasks: [],
    workouts: [],
  });
  assert.equal(brief.workouts.length, 0);
  assert.equal(brief.glance.workoutCount, 0);
});

test("overlapping events become a calculated issue", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [
      event("evt_a", "Call", atZonedTime(LA, now, 10, 0), 60, { category: "meeting" }),
      event("evt_b", "Review", atZonedTime(LA, now, 10, 30), 60, { category: "meeting" }),
    ],
    tasks: [],
    workouts: [],
  });
  assert.ok(brief.issues.some((issue) => issue.kind === "overlap" && /Call/i.test(issue.text) && /Review/i.test(issue.text)));
});

test("back-to-back and workout-buffer transitions are reported", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const swimStart = atZonedTime(LA, now, 17, 30);
  const dinnerStart = atZonedTime(LA, now, 18, 45);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [
      event("evt_swim", "Swim", swimStart, 60, { category: "training", workoutId: "workout_swim" }),
      event("evt_dinner", "Dinner", dinnerStart, 60, { category: "personal" }),
    ],
    tasks: [],
    workouts: [
      {
        id: "workout_swim",
        eventId: "evt_swim",
        sport: "swim",
        duration: 60,
        intensity: "moderate",
        description: "",
        scheduledTime: swimStart.toISOString(),
        completed: false,
        weatherDependent: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  });
  assert.ok(brief.issues.some((issue) => issue.kind === "workout_buffer" && /15 min/.test(issue.text)));
});

test("transparent all-day events appear but do not consume availability", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const stay = event("evt_stay", "Stay at inn", atZonedTime(LA, now, 0, 0), 24 * 60, {
    allDay: true,
    blocksTime: false,
    transparency: "transparent",
    source: "google",
  });
  const empty = generateBrief({ now, profile: profile(now), events: [], tasks: [], workouts: [] });
  const withStay = generateBrief({ now, profile: profile(now), events: [stay], tasks: [], workouts: [] });
  assert.equal(withStay.openMinutes, empty.openMinutes);
  assert.equal(withStay.allDayEvents[0]?.title, "Stay at inn");
  assert.equal(withStay.allDayEvents[0]?.blocksTime, false);
});

test("opaque all-day events block the day when marked busy", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const ooo = event("evt_ooo", "Out of office", atZonedTime(LA, now, 0, 0), 24 * 60, {
    allDay: true,
    blocksTime: true,
    transparency: "opaque",
    source: "google",
  });
  const empty = generateBrief({ now, profile: profile(now), events: [], tasks: [], workouts: [] });
  const blocked = generateBrief({ now, profile: profile(now), events: [ooo], tasks: [], workouts: [] });
  assert.ok(blocked.openMinutes < empty.openMinutes);
  assert.equal(blocked.allDayEvents[0]?.blocksTime, true);
});

test("multiple calendars are included and exact duplicates collapse", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 8, 0);
  const start = atZonedTime(LA, now, 15, 0);
  const primary = event("evt_a", "Design review", start, 45, {
    category: "meeting",
    calendarId: "primary",
    providerEventId: "abc123",
  });
  const copy = event("evt_b", "Design review", start, 45, {
    category: "meeting",
    calendarId: "work",
    providerEventId: "abc123",
  });
  const other = event("evt_c", "Dentist", atZonedTime(LA, now, 16, 0), 30, {
    category: "personal",
    calendarId: "personal",
  });
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [primary, copy, other],
    tasks: [],
    workouts: [],
  });
  assert.equal(brief.events.filter((item) => item.title === "Design review").length, 1);
  assert.ok(brief.events.some((item) => item.title === "Dentist"));
});

test("open-block thresholds ignore tiny gaps and keep 60+ blocks", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 9, 0);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [
      event("evt_a", "A", atZonedTime(LA, now, 9, 0), 60, { category: "meeting" }),
      event("evt_b", "B", atZonedTime(LA, now, 10, 15), 45, { category: "meeting" }),
      event("evt_c", "C", atZonedTime(LA, now, 13, 0), 60, { category: "focus" }),
    ],
    tasks: [],
    workouts: [],
  });
  assert.ok(brief.openBlocks.every((block) => block.minutes >= 30));
  assert.ok(brief.openBlocks.some((block) => block.minutes >= 60));
  assert.equal(brief.openBlocks.some((block) => block.minutes < 30), false);
});

test("late evening brief does not treat completed events as next", () => {
  const brief = briefAt(21, 30);
  assert.equal(brief.nextEvent, undefined);
  assert.ok(brief.events.every((item) => item.phase === "completed" || item.allDay));
});

test("timezone stays on the requested local day", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 23, 30);
  const brief = briefAt(23, 30, { now });
  assert.equal(zonedParts(LA, new Date(brief.date)).day, 21);
  assert.ok(brief.events.every((item) => zonedParts(LA, new Date(item.start)).day === 21));
});

test("DST morning still bounds the brief to one local calendar day", () => {
  const now = zonedLocalToUtc(LA, 2026, 3, 9, 7, 15);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [],
    tasks: [],
    workouts: [],
  });
  assert.equal(zonedParts(LA, new Date(brief.date)).month, 3);
  assert.equal(zonedParts(LA, new Date(brief.date)).day, 9);
  assert.ok(brief.openBlocks.length > 0);
  const last = brief.openBlocks[brief.openBlocks.length - 1]!;
  const lastEnd = zonedParts(LA, new Date(last.end));
  assert.ok(lastEnd.day === 9 || (lastEnd.day === 10 && lastEnd.hour === 0));
});

test("brief generation does not call OpenAI", () => {
  const source = readFileSync(join(ROOT, "lib/brief/generateBrief.ts"), "utf8");
  assert.doesNotMatch(source, /openai|completeOpenAIIntent/i);
});

test("glance open minutes include 30–59 windows even when the list hides them", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 11, 45);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [
      event("evt_mid", "Workshop", atZonedTime(LA, now, 13, 45), 135, { category: "meeting" }),
      event("evt_late", "Evening block", atZonedTime(LA, now, 16, 45), 7 * 60 + 15, { category: "personal" }),
    ],
    tasks: [],
    workouts: [],
  });
  const displayed = brief.openBlocks.map((block) => block.minutes);
  assert.equal(brief.glance.openMinutes, 165);
  assert.equal(brief.openMinutes, 165);
  assert.equal(brief.glance.meaningfulOpenMinutes, 120);
  assert.ok(displayed.includes(120));
  assert.equal(displayed.includes(45), false);
});

test("open blocks are continuous intervals, not 30-minute candidate slots", () => {
  const brief = briefAt(7, 15);
  const longest = brief.openBlocks.find((block) => block.minutes === 315);
  assert.ok(longest);
  const start = zonedParts(LA, new Date(longest.start));
  const end = zonedParts(LA, new Date(longest.end));
  assert.equal(start.hour, 11);
  assert.equal(start.minute, 45);
  assert.equal(end.hour, 17);
  assert.equal(end.minute, 0);
  assert.equal(brief.openBlocks.some((block) => block.minutes === 30), false);
  assert.equal(
    brief.openBlocks.filter((block) => {
      const parts = zonedParts(LA, new Date(block.start));
      return parts.hour === 11 && parts.minute === 45;
    }).length,
    1,
  );
});

test("persisted yoga training receives the same post-workout buffer as other training", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 7, 15);
  const yoga = event("evt_yoga", "Yoga", atZonedTime(LA, now, 17, 0), 15, { category: "training" });
  const swim = event("evt_swim", "Swim", atZonedTime(LA, now, 17, 30), 60, {
    category: "training",
    workoutId: "workout_swim",
  });
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [yoga, swim],
    tasks: [],
    workouts: [
      {
        id: "workout_swim",
        eventId: "evt_swim",
        sport: "swim",
        duration: 60,
        intensity: "moderate",
        description: "",
        scheduledTime: swim.start,
        completed: false,
        weatherDependent: false,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
  });
  assert.equal(brief.events.find((item) => item.title === "Yoga")?.training, true);
  assert.ok(brief.issues.some((issue) => issue.kind === "workout_buffer" && /Yoga/.test(issue.text)));
  const afterYoga = brief.openBlocks.find((block) => {
    const start = zonedParts(LA, new Date(block.start));
    return start.hour === 17 && start.minute === 15;
  });
  assert.equal(afterYoga, undefined);
});

test("eventCount is today's deduped events including completed and all-day items", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 14, 0);
  const start = atZonedTime(LA, now, 10, 0);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [
      event("evt_am", "Standup", start, 30, { category: "meeting", providerEventId: "standup-1" }),
      event("evt_dup", "Standup", start, 30, { category: "meeting", calendarId: "work", providerEventId: "standup-1" }),
      event("evt_dup2", "Standup", start, 30, { category: "meeting", calendarId: "home", providerEventId: "standup-1" }),
      event("evt_stay", "Stay at inn", atZonedTime(LA, now, 0, 0), 24 * 60, {
        allDay: true,
        blocksTime: false,
        transparency: "transparent",
      }),
    ],
    tasks: [],
    workouts: [],
  });
  assert.equal(brief.glance.eventCount, 2);
  assert.equal(brief.eventCount, 2);
  assert.equal(brief.events.filter((item) => item.title === "Standup").length, 1);
  assert.equal(brief.events.find((item) => item.title === "Standup")?.phase, "completed");
  assert.equal(brief.allDayEvents[0]?.title, "Stay at inn");
});

test("overlapping current events do not imply only one is happening", () => {
  const now = zonedLocalToUtc(LA, 2026, 9, 21, 10, 45);
  const brief = generateBrief({
    now,
    profile: profile(now),
    events: [
      event("evt_a", "Meeting A", atZonedTime(LA, now, 10, 0), 60, { category: "meeting" }),
      event("evt_b", "Meeting B", atZonedTime(LA, now, 10, 30), 60, { category: "meeting" }),
    ],
    tasks: [],
    workouts: [],
  });
  assert.equal(brief.nextEvent?.status, "now");
  assert.equal(brief.nextEvent?.concurrentCount, 2);
  assert.match(brief.nextEvent?.title ?? "", /2 events in progress/);
  assert.match(brief.nextEvent?.timeLabel ?? "", /Meeting A/);
  assert.match(brief.nextEvent?.timeLabel ?? "", /Meeting B/);
  assert.ok(brief.issues.some((issue) => issue.kind === "overlap"));
});
