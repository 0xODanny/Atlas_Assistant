import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import {
  BOTTOM_NAV_GAP_PX,
  BOTTOM_NAV_HEIGHT_PX,
  COMPOSER_GAP_PX,
  CONTENT_BOTTOM_INSET_PX,
  composerBottomInsetPx,
  contentBottomInsetPx,
} from "../lib/layout/insets";

const ROOT = join(process.cwd());

test("nav geometry is compact, tokenized, and applies safe-area once", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  assert.equal(BOTTOM_NAV_HEIGHT_PX, 52);
  assert.equal(BOTTOM_NAV_GAP_PX, 12);
  assert.equal(CONTENT_BOTTOM_INSET_PX, 64);
  assert.ok(contentBottomInsetPx(34) > contentBottomInsetPx(0));
  assert.ok(composerBottomInsetPx(0) > CONTENT_BOTTOM_INSET_PX);
  assert.equal(COMPOSER_GAP_PX, 8);
  assert.match(css, /--atlas-touch:\s*44px/);
  assert.match(css, /--atlas-nav-stack:\s*calc\(var\(--atlas-nav-height\) \+ var\(--atlas-safe-bottom\)\)/);
  assert.match(css, /--atlas-composer-gap/);
  assert.match(css, /\.atlas-composer-dock[\s\S]*bottom:\s*calc\(var\(--atlas-nav-stack\) \+ var\(--atlas-composer-gap\)\)/);
  assert.match(css, /\.atlas-nav-chrome[\s\S]*padding:[\s\S]*var\(--atlas-safe-bottom\)/);
  assert.doesNotMatch(css, /--atlas-nav-height:\s*5rem/);
  assert.doesNotMatch(
    css,
    /padding-bottom:\s*calc\(var\(--atlas-bottom-nav-height\) \+ 18px \+ env\(safe-area-inset-bottom\)\)/,
  );
});

test("keyboard-open chrome uses visualViewport inset instead of a hardcoded bottom offset", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const hook = readFileSync(join(ROOT, "lib/hooks/useVisualViewport.ts"), "utf8");
  const shell = readFileSync(join(ROOT, "components/shell/AppShell.tsx"), "utf8");
  assert.match(hook, /visualViewport/);
  assert.match(hook, /--atlas-keyboard-inset/);
  assert.match(shell, /useVisualViewportInsets/);
  assert.match(css, /html\.is-keyboard-open \.atlas-composer-dock/);
  assert.match(css, /--atlas-keyboard-inset/);
  assert.doesNotMatch(css, /bottom:\s*94px/);
});
