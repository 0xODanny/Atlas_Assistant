import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { atlasBack, hasAtlasHistory, routeBackFallback } from "../lib/navigation/back";

const ROOT = join(process.cwd());

test("child routes fall back to their parent roots", () => {
  assert.equal(routeBackFallback("/today"), null);
  assert.equal(routeBackFallback("/calendar"), null);
  assert.equal(routeBackFallback("/assistant"), null);
  assert.equal(routeBackFallback("/settings"), null);
  assert.equal(routeBackFallback("/brief"), "/today");
  assert.equal(routeBackFallback("/events/abc"), "/calendar");
  assert.equal(routeBackFallback("/settings/google"), "/settings");
});

test("atlasBack uses history when available and otherwise pushes the fallback", () => {
  const calls: string[] = [];
  const router = {
    back: () => calls.push("back"),
    push: (href: string) => calls.push(`push:${href}`),
  };
  assert.equal(hasAtlasHistory(), false);
  atlasBack(router, "/assistant");
  assert.deepEqual(calls, ["push:/assistant"]);
});

test("shell, assistant result, sheets, and overlays expose Back", () => {
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  const chat = readFileSync(join(ROOT, "components/assistant/AssistantChat.tsx"), "utf8");
  const sheet = readFileSync(join(ROOT, "components/sheets/Sheet.tsx"), "utf8");
  const overlay = readFileSync(join(ROOT, "components/calendar/DayOverlay.tsx"), "utf8");
  const nav = readFileSync(join(ROOT, "lib/navigation/back.ts"), "utf8");
  assert.match(shell, /BackControl/);
  assert.match(shell, /useShellChrome/);
  assert.match(chat, /useShellBack/);
  assert.match(chat, /clearToLanding/);
  assert.match(sheet, /data-atlas-back|BackControl/);
  assert.match(overlay, /BackControl/);
  assert.match(nav, /routeBackFallback/);
});

test("bottom navigation is an opaque fixed chrome surface", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  assert.match(css, /\.atlas-nav-chrome/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /--atlas-nav-stack/);
  assert.match(css, /--atlas-composer-height/);
  assert.match(shell, /atlas-nav-chrome/);
  assert.match(shell, /sheet \? null/);
});
