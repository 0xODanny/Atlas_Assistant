import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import {
  buildGoogleAuthUrl,
  renderOAuthContinuePage,
  wantsOAuthDocument,
} from "../lib/google/oauth";

const ROOT = join(process.cwd());

test("Google Connect starts OAuth with a user-gesture navigation, not a popup", () => {
  const settings = readFileSync(join(ROOT, "components/settings/GoogleCalendarSettings.tsx"), "utf8");
  const control = readFileSync(join(ROOT, "components/settings/GoogleConnectControl.tsx"), "utf8");
  assert.match(settings, /GoogleConnectControl/);
  assert.doesNotMatch(settings, /href="\/api\/google\/oauth"/);
  assert.doesNotMatch(control, /window\.open/);
  assert.doesNotMatch(control, /target=["']_blank["']/);
  assert.match(control, /window\.location\.assign/);
  assert.match(control, /method="get"/);
  assert.match(control, /Connecting/);
  assert.match(control, /\/api\/google\/oauth/);
});

test("OAuth continue page stays on a Google accounts URL and never includes the client secret", () => {
  const url = buildGoogleAuthUrl({
    state: "state-token",
    env: {
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "super-secret",
      GOOGLE_REDIRECT_URI: "https://www.pepinho.games/api/google/callback",
    } as unknown as NodeJS.ProcessEnv,
  });
  const html = renderOAuthContinuePage(url);
  assert.match(html, /accounts\.google\.com/);
  assert.match(html, /location\.replace/);
  assert.match(html, /Continue/);
  assert.doesNotMatch(html, /super-secret/);
  assert.doesNotMatch(html, /client_secret/);
  assert.match(html, /location\.replace\("https:\/\/accounts\.google\.com\//);
  const injected = renderOAuthContinuePage(
    'https://accounts.google.com/o/oauth2/v2/auth?q="><script>alert(1)</script>',
  );
  assert.match(injected, /href="https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?q=&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(injected, /location\.replace\("https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?q=\\"\\u003e\\u003cscript\\u003ealert\(1\)\\u003c\/script\\u003e"\)/);
  assert.doesNotMatch(injected, /<script>alert/);
  assert.throws(() => renderOAuthContinuePage("https://evil.example/phish"));
});

test("document navigations prefer the HTML continue page over a silent redirect", () => {
  const documentNav = new Request("https://atlas.test/api/google/oauth", {
    headers: { accept: "text/html", "sec-fetch-dest": "document" },
  });
  const jsonNav = new Request("https://atlas.test/api/google/oauth?format=json", {
    headers: { accept: "application/json" },
  });
  assert.equal(wantsOAuthDocument(documentNav), true);
  assert.equal(wantsOAuthDocument(jsonNav), false);
});

test("OAuth route sets CSRF cookie and does not expose secrets", () => {
  const route = readFileSync(join(ROOT, "app/api/google/oauth/route.ts"), "utf8");
  const callback = readFileSync(join(ROOT, "app/api/google/callback/route.ts"), "utf8");
  assert.match(route, /OAUTH_STATE_COOKIE/);
  assert.match(route, /sameSite:\s*"lax"/);
  assert.match(route, /renderOAuthContinuePage/);
  assert.match(callback, /state !== expected/);
  assert.match(callback, /google=connected/);
  assert.match(callback, /google=error/);
  assert.doesNotMatch(route, /GOOGLE_CLIENT_SECRET/);
});
