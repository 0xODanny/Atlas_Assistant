import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { applyVisualEvents, readVisualMode, visualBusyEvents, VISUAL_ID_PREFIX } from "../lib/present/visualFixture";

const ROOT = join(process.cwd());
const TZ = "America/New_York";
const NOW = new Date("2026-09-21T16:00:00.000Z");

test("visual fixture is off in production and never writes calendar ids without the prefix", () => {
  const source = readFileSync(join(ROOT, "lib/present/visualFixture.ts"), "utf8");
  assert.match(source, /NODE_ENV === "production"/);
  assert.equal(readVisualMode(""), "off");
  const events = visualBusyEvents(NOW, TZ);
  assert.ok(events.length >= 6);
  assert.ok(events.every((event) => event.id.startsWith(VISUAL_ID_PREFIX)));
  assert.equal(applyVisualEvents([{ ...events[0]!, id: "real" }], "empty", NOW, TZ).length, 0);
  assert.ok(applyVisualEvents([], "busy", NOW, TZ).every((event) => event.id.startsWith(VISUAL_ID_PREFIX)));
});

test("visual fixture is development-only and not persisted by the state provider", () => {
  const provider = readFileSync(join(ROOT, "lib/state/provider.tsx"), "utf8");
  const today = readFileSync(join(ROOT, "components/today/TodayView.tsx"), "utf8");
  const calendar = readFileSync(join(ROOT, "components/calendar/CalendarView.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const chat = readFileSync(join(ROOT, "components/assistant/AssistantChat.tsx"), "utf8");
  assert.doesNotMatch(provider, /visualBusyEvents|useVisualEvents/);
  assert.match(today, /useVisualEvents/);
  assert.match(calendar, /useVisualEvents/);
  assert.doesNotMatch(css, /visual=/);
  assert.doesNotMatch(today, /className=\{[^}]*visual/);
  assert.doesNotMatch(calendar, /className=\{[^}]*visual/);
  assert.doesNotMatch(chat, /className=\{[^}]*visual/);
});
