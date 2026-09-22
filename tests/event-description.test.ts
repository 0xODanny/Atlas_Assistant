import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildPreparation } from "../lib/prepare/content";
import { descriptionSegments, normalizeEventDescription } from "../lib/present/description";
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
    category: "meeting",
    status: "confirmed",
    createdAt: partial.start,
    updatedAt: partial.start,
    ...partial,
  };
}

test("Google HTML line breaks become readable text", () => {
  const raw = 'Intro call<br data-soft="true">Bring the deck<br/>https://luma.com/abc';
  const clean = normalizeEventDescription(raw);
  assert.equal(clean.includes("<br"), false);
  assert.equal(clean.includes("data-soft"), false);
  assert.match(clean, /Intro call/);
  assert.match(clean, /Bring the deck/);
  assert.match(clean, /https:\/\/luma.com\/abc/);
  const parts = descriptionSegments(raw);
  assert.equal(parts.some((part) => part.value.includes("<br")), false);
  assert.ok(parts.some((part) => part.type === "link" && part.value.startsWith("https://luma.com/")));
});

test("description HTML cannot inject executable markup", () => {
  const raw = `<script>alert(1)</script><img src=x onerror="alert(1)"><style>body{}</style>Safe notes`;
  const clean = normalizeEventDescription(raw);
  assert.equal(clean, "Safe notes");
  assert.equal(/<script|onerror|javascript:/i.test(clean), false);
  const details = readFileSync(join(ROOT, "components/events/EventDetails.tsx"), "utf8");
  assert.doesNotMatch(details, /dangerouslySetInnerHTML/);
});

test("Prepare Me display strips HTML from event notes", () => {
  const meeting = event({
    id: "evt_html",
    title: "Intro",
    start: "2026-09-22T15:00:00.000Z",
    end: "2026-09-22T16:00:00.000Z",
    description: 'Talking points<br data-soft="true">Budget',
  });
  const prep = buildPreparation({ event: meeting });
  const items = prep.sections.flatMap((section) => section.items).join(" ");
  assert.match(items, /Talking points/);
  assert.match(items, /Budget/);
  assert.equal(items.includes("<br"), false);
});
