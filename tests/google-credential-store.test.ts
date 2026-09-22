import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { NextResponse } from "next/server";
import { GET as callbackGET } from "../app/api/google/callback/route";
import { POST as disconnectPOST } from "../app/api/google/disconnect/route";
import { GET as statusGET } from "../app/api/google/status/route";
import { POST as syncPOST } from "../app/api/google/sync/route";
import {
  CREDENTIAL_COOKIE,
  CREDENTIAL_COOKIE_HARD_LIMIT,
  CREDENTIAL_COOKIE_SAFE_LIMIT,
  GOOGLE_CALENDAR_API,
  GOOGLE_READONLY_SCOPE,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  OAUTH_STATE_COOKIE,
  resolveCredentialStoreKind,
} from "../lib/google/config";
import {
  credentialToPayload,
  decryptCredentialCookie,
  encryptCredentialCookie,
  measureCredentialCookieSize,
  parseCredentialCookieKey,
} from "../lib/google/credentialCrypto";
import { bindGoogleCredentialStore, createCookieCredentialStore } from "../lib/google/credentialStore";
import {
  createFileCredentialStore,
  setDefaultCredentialStore,
  type CalendarCredential,
} from "../lib/google/credentials";
import { readSetCookieValue, setCookieLines } from "../lib/google/httpCookies";
import { oauthLogContainsSecrets } from "../lib/google/oauthLog";
import { loadFreshGoogleCredential } from "../lib/google/sync";

const ACCESS = `ya29.${"A".repeat(280)}`;
const REFRESH = `1//0${"B".repeat(90)}`;
const LONG_ACCESS = `ya29.${"C".repeat(1024)}`;
const LONG_REFRESH = `1//0${"D".repeat(200)}`;

function sampleKey(): string {
  return randomBytes(32).toString("base64url");
}

function sampleCredential(overrides: Partial<CalendarCredential> = {}): CalendarCredential {
  return {
    provider: "google",
    accessToken: ACCESS,
    refreshToken: REFRESH,
    expiresAt: Date.now() + 3_600_000,
    tokenType: "Bearer",
    scope: `${GOOGLE_READONLY_SCOPE} https://www.googleapis.com/auth/calendar.events`,
    email: "owner@example.com",
    ...overrides,
  };
}

function withEnv(patch: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    setDefaultCredentialStore(undefined);
  };
  return Promise.resolve()
    .then(run)
    .finally(restore);
}

test("encrypted cookie size fits representative Google token lengths", () => {
  const key = parseCredentialCookieKey(sampleKey());
  const typical = measureCredentialCookieSize({ credential: sampleCredential(), key });
  const long = measureCredentialCookieSize({
    credential: sampleCredential({ accessToken: LONG_ACCESS, refreshToken: LONG_REFRESH }),
    key,
  });
  assert.ok(typical.plaintextBytes > 400);
  assert.ok(typical.cookieValueBytes > typical.plaintextBytes);
  assert.equal(typical.fitsSafeLimit, true);
  assert.equal(typical.fitsHardLimit, true);
  assert.equal(long.fitsSafeLimit, true);
  assert.equal(long.fitsHardLimit, true);
  assert.ok(long.cookieLineBytes < CREDENTIAL_COOKIE_SAFE_LIMIT);
  assert.ok(long.cookieLineBytes < CREDENTIAL_COOKIE_HARD_LIMIT);
});

test("AES-256-GCM cookie round-trip hides tokens and rejects tampering", () => {
  const key = parseCredentialCookieKey(sampleKey());
  const credential = sampleCredential();
  const value = encryptCredentialCookie(credentialToPayload(credential), key);
  assert.match(value, /^v1\./);
  assert.equal(value.includes(ACCESS), false);
  assert.equal(value.includes(REFRESH), false);
  const roundTrip = decryptCredentialCookie(value, key);
  assert.equal(roundTrip?.accessToken, ACCESS);
  assert.equal(roundTrip?.refreshToken, REFRESH);
  assert.equal(roundTrip?.v, 1);

  const other = parseCredentialCookieKey(sampleKey());
  assert.equal(decryptCredentialCookie(value, other), null);

  const packed = Buffer.from(value.slice(3), "base64url");
  packed[20] = packed[20] ^ 0xff;
  const tampered = `v1.${packed.toString("base64url")}`;
  assert.equal(decryptCredentialCookie(tampered, key), null);
  assert.equal(decryptCredentialCookie("not-a-cookie", key), null);
  assert.equal(decryptCredentialCookie("v2.abc", key), null);
});

test("cookie credential store preserves a refresh token Google omits", async () => {
  const key = parseCredentialCookieKey(sampleKey());
  let raw: string | undefined;
  const store = createCookieCredentialStore({
    read: () => raw,
    write: (value) => {
      raw = value;
    },
    clear: () => {
      raw = undefined;
    },
    key,
  });
  await store.set(sampleCredential());
  await store.set(sampleCredential({ accessToken: "ya29.NEW", refreshToken: undefined }));
  const saved = await store.get();
  assert.equal(saved?.accessToken, "ya29.NEW");
  assert.equal(saved?.refreshToken, REFRESH);
  assert.equal(raw?.includes("ya29.NEW"), false);
  assert.equal(raw?.includes(REFRESH), false);
});

test("tampered cookie degrades to disconnected without throwing", async () => {
  const key = parseCredentialCookieKey(sampleKey());
  const store = createCookieCredentialStore({
    read: () => "v1.not-valid-ciphertext",
    write: () => undefined,
    clear: () => undefined,
    key,
  });
  assert.equal(await store.get(), null);
});

test("store selection prefers explicit ATLAS_CREDENTIAL_STORE over Vercel", () => {
  assert.equal(resolveCredentialStoreKind({}), "file");
  assert.equal(resolveCredentialStoreKind({ VERCEL: "1" }), "cookie");
  assert.equal(resolveCredentialStoreKind({ VERCEL: "1", ATLAS_CREDENTIAL_STORE: "file" }), "file");
  assert.equal(resolveCredentialStoreKind({ ATLAS_CREDENTIAL_STORE: "cookie" }), "cookie");
  assert.equal(resolveCredentialStoreKind({ NODE_ENV: "production" }), "file");
});

test("local file credential store still round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-google-"));
  const filePath = join(dir, "google-credentials.json");
  try {
    const store = createFileCredentialStore(filePath);
    await store.set(sampleCredential({ accessToken: "file-token" }));
    const raw = await readFile(filePath, "utf8");
    assert.match(raw, /file-token/);
    assert.equal((await store.get())?.accessToken, "file-token");
    await store.clear();
    assert.equal(await store.get(), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("production bind writes Set-Cookie on the actual response", async () => {
  const key = sampleKey();
  await withEnv({ ATLAS_CREDENTIAL_STORE: "cookie", ATLAS_CREDENTIAL_COOKIE_KEY: key, VERCEL: "1" }, async () => {
    const request = new Request("https://atlas.test/api/google/status");
    const bound = bindGoogleCredentialStore(request);
    assert.equal(bound.kind, "cookie");
    await bound.store.set(sampleCredential());
    const response = bound.applyTo(NextResponse.json({ ok: true }));
    const cookie = readSetCookieValue(response, CREDENTIAL_COOKIE);
    assert.ok(cookie);
    assert.match(cookie, /^v1\./);
    assert.equal(cookie.includes(ACCESS), false);
    const lines = setCookieLines(response).join("\n");
    assert.match(lines, /HttpOnly/i);
    assert.match(lines, /Path=\//);
    assert.match(lines, /SameSite=lax/i);
    assert.match(lines, /Secure/i);
    assert.doesNotMatch(lines, new RegExp(ACCESS));
  });
});

test("callback Set-Cookie then status and sync read the encrypted credential", async () => {
  const key = sampleKey();
  const originalFetch = globalThis.fetch;
  const info: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    info.push(args);
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(GOOGLE_TOKEN_URL)) {
      return new Response(
        JSON.stringify({
          access_token: ACCESS,
          refresh_token: REFRESH,
          expires_in: 3600,
          token_type: "Bearer",
          scope: GOOGLE_READONLY_SCOPE,
        }),
        { status: 200 },
      );
    }
    if (url.startsWith(GOOGLE_USERINFO_URL)) {
      return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
    }
    if (url.startsWith(`${GOOGLE_CALENDAR_API}/users/me/calendarList`)) {
      return new Response(
        JSON.stringify({
          items: [{ id: "owner@example.com", summary: "Owner", primary: true, selected: true, accessRole: "owner" }],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/calendars/") && url.includes("/events")) {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;

  await withEnv(
    {
      ATLAS_CREDENTIAL_STORE: "cookie",
      ATLAS_CREDENTIAL_COOKIE_KEY: key,
      VERCEL: "1",
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "super-secret",
      GOOGLE_REDIRECT_URI: "https://atlas.test/api/google/callback",
    },
    async () => {
      const state = "oauth-state-value";
      const callback = await callbackGET(
        new Request(`https://atlas.test/api/google/callback?code=AUTH-CODE-SECRET&state=${state}`, {
          headers: { cookie: `${OAUTH_STATE_COOKIE}=readonly:${state}` },
        }),
      );
      assert.equal(callback.status, 307);
      assert.match(callback.headers.get("location") ?? "", /google=connected/);
      const credentialCookie = readSetCookieValue(callback, CREDENTIAL_COOKIE);
      assert.ok(credentialCookie);
      assert.equal(credentialCookie.includes(ACCESS), false);
      assert.equal(credentialCookie.includes("AUTH-CODE-SECRET"), false);
      assert.equal(readSetCookieValue(callback, OAUTH_STATE_COOKIE), "");

      const cookieHeader = `${CREDENTIAL_COOKIE}=${credentialCookie}`;
      const status = await statusGET(new Request("https://atlas.test/api/google/status", { headers: { cookie: cookieHeader } }));
      const statusBody = (await status.json()) as { connection?: { status?: string; email?: string } };
      assert.equal(statusBody.connection?.status, "connected");
      assert.equal(statusBody.connection?.email, "owner@example.com");
      const statusText = JSON.stringify(statusBody);
      assert.equal(statusText.includes(ACCESS), false);
      assert.equal(statusText.includes(REFRESH), false);
      assert.equal(statusText.includes("super-secret"), false);

      const sync = await syncPOST(
        new Request("https://atlas.test/api/google/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: cookieHeader },
          body: JSON.stringify({ timezone: "America/Los_Angeles" }),
        }),
      );
      const syncBody = (await sync.json()) as {
        connection?: { status?: string; calendars?: Array<{ id: string; primary?: boolean; included?: boolean }> };
        events?: unknown[];
        complete?: boolean;
      };
      assert.equal(syncBody.connection?.status, "connected");
      assert.equal(syncBody.complete, true);
      assert.equal(syncBody.connection?.calendars?.some((calendar) => calendar.primary && calendar.included), true);
      assert.equal(JSON.stringify(syncBody).includes(ACCESS), false);

      const disconnected = await disconnectPOST(
        new Request("https://atlas.test/api/google/disconnect", {
          method: "POST",
          headers: { cookie: cookieHeader },
        }),
      );
      const disconnectBody = (await disconnected.json()) as { connection?: { status?: string } };
      assert.equal(disconnectBody.connection?.status, "disconnected");
      assert.equal(readSetCookieValue(disconnected, CREDENTIAL_COOKIE), "");
      const cleared = setCookieLines(disconnected).join("\n");
      assert.match(cleared, /Max-Age=0/i);
      const expired = await statusGET(new Request("https://atlas.test/api/google/status"));
      assert.equal(((await expired.json()) as { connection?: { status?: string } }).connection?.status, "disconnected");
    },
  ).finally(() => {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  });
  assert.equal(oauthLogContainsSecrets(info), false);
});

test("callback logs sanitized state_mismatch and never logs the code", async () => {
  const info: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    info.push(args);
  };
  try {
    const response = await callbackGET(
      new Request("https://atlas.test/api/google/callback?code=AUTH-CODE-SECRET&state=wrong", {
        headers: { cookie: `${OAUTH_STATE_COOKIE}=readonly:expected` },
      }),
    );
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /google=error/);
    assert.deepEqual(info.at(-1), ["[atlas/google-oauth]", { category: "state_mismatch" }]);
    assert.equal(JSON.stringify(info).includes("AUTH-CODE-SECRET"), false);
  } finally {
    console.info = originalInfo;
  }
});

test("callback logs token_exchange_failed without secrets when Google rejects the code", async () => {
  const originalFetch = globalThis.fetch;
  const info: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    info.push(args);
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad code" }), { status: 400 })) as typeof fetch;
  await withEnv(
    {
      ATLAS_CREDENTIAL_STORE: "cookie",
      ATLAS_CREDENTIAL_COOKIE_KEY: sampleKey(),
      VERCEL: "1",
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "super-secret",
      GOOGLE_REDIRECT_URI: "https://atlas.test/api/google/callback",
    },
    async () => {
      const response = await callbackGET(
        new Request("https://atlas.test/api/google/callback?code=AUTH-CODE-SECRET&state=ok", {
          headers: { cookie: `${OAUTH_STATE_COOKIE}=readonly:ok` },
        }),
      );
      assert.match(response.headers.get("location") ?? "", /google=error/);
      assert.deepEqual(info.at(-1), ["[atlas/google-oauth]", { category: "token_exchange_failed" }]);
      assert.equal(JSON.stringify(info).includes("AUTH-CODE-SECRET"), false);
      assert.equal(JSON.stringify(info).includes("super-secret"), false);
    },
  ).finally(() => {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  });
});

test("server-side access-token refresh writes the updated credential cookie", async () => {
  const key = sampleKey();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ access_token: "ya29.ROTATED", expires_in: 3600, token_type: "Bearer" }), {
      status: 200,
    })) as typeof fetch;
  await withEnv(
    {
      ATLAS_CREDENTIAL_STORE: "cookie",
      ATLAS_CREDENTIAL_COOKIE_KEY: key,
      VERCEL: "1",
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "super-secret",
      GOOGLE_REDIRECT_URI: "https://atlas.test/api/google/callback",
    },
    async () => {
      const request = new Request("https://atlas.test/api/google/sync");
      const bound = bindGoogleCredentialStore(request);
      await bound.store.set(sampleCredential({ expiresAt: Date.now() - 1_000 }));
      const fresh = await loadFreshGoogleCredential(bound.store);
      assert.equal(fresh?.accessToken, "ya29.ROTATED");
      assert.equal(fresh?.refreshToken, REFRESH);
      const response = bound.applyTo(NextResponse.json({ ok: true }));
      const cookie = readSetCookieValue(response, CREDENTIAL_COOKIE);
      assert.ok(cookie);
      assert.equal(cookie.includes("ya29.ROTATED"), false);
      const again = bindGoogleCredentialStore(
        new Request("https://atlas.test/api/google/status", { headers: { cookie: `${CREDENTIAL_COOKIE}=${cookie}` } }),
      );
      assert.equal((await again.store.get())?.accessToken, "ya29.ROTATED");
      assert.equal((await again.store.get())?.refreshToken, REFRESH);
    },
  ).finally(() => {
    globalThis.fetch = originalFetch;
  });
});

test("callback logs credential_encrypt_failed when the cookie key is missing", async () => {
  const originalFetch = globalThis.fetch;
  const info: unknown[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    info.push(args);
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(GOOGLE_TOKEN_URL)) {
      return new Response(JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 }), { status: 200 });
    }
    if (url.startsWith(GOOGLE_USERINFO_URL)) {
      return new Response(JSON.stringify({ email: "owner@example.com" }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  await withEnv(
    {
      ATLAS_CREDENTIAL_STORE: "cookie",
      ATLAS_CREDENTIAL_COOKIE_KEY: undefined,
      VERCEL: "1",
      GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "super-secret",
      GOOGLE_REDIRECT_URI: "https://atlas.test/api/google/callback",
    },
    async () => {
      const response = await callbackGET(
        new Request("https://atlas.test/api/google/callback?code=AUTH-CODE-SECRET&state=ok", {
          headers: { cookie: `${OAUTH_STATE_COOKIE}=readonly:ok` },
        }),
      );
      assert.match(response.headers.get("location") ?? "", /google=error/);
      assert.deepEqual(info.at(-1), ["[atlas/google-oauth]", { category: "credential_encrypt_failed" }]);
    },
  ).finally(() => {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  });
});
