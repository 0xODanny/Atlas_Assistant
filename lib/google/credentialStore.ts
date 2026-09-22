import { NextResponse } from "next/server";
import { CREDENTIAL_COOKIE, resolveCredentialStoreKind, type CredentialStoreKind } from "./config";
import {
  credentialToPayload,
  decryptCredentialCookie,
  encryptCredentialCookie,
  payloadToCredential,
  resolveCredentialCookieKey,
} from "./credentialCrypto";
import { defaultCredentialStore, type CalendarCredential, type CalendarCredentialStore } from "./credentials";
import { applyCredentialCookie, cookieSecure, expireCredentialCookie, readRequestCookie } from "./httpCookies";
import { logGoogleOAuthFailure } from "./oauthLog";

export type { CredentialStoreKind };
export { resolveCredentialStoreKind };

export type BoundCredentialStore = {
  kind: CredentialStoreKind;
  store: CalendarCredentialStore;
  applyTo(response: NextResponse): NextResponse;
};

function mergeCredential(next: CalendarCredential, previous: CalendarCredential | null): CalendarCredential {
  return {
    ...next,
    refreshToken: next.refreshToken || previous?.refreshToken,
    scope: next.scope || previous?.scope,
    email: next.email || previous?.email,
    tokenType: next.tokenType || previous?.tokenType || "Bearer",
  };
}

export function createCookieCredentialStore(input: {
  read: () => string | undefined;
  write: (value: string) => void;
  clear: () => void;
  key: Buffer;
}): CalendarCredentialStore {
  async function current(): Promise<CalendarCredential | null> {
    const raw = input.read();
    if (!raw) return null;
    const payload = decryptCredentialCookie(raw, input.key);
    if (!payload) {
      logGoogleOAuthFailure("credential_decrypt_failed");
      return null;
    }
    return payloadToCredential(payload);
  }

  return {
    async get() {
      return current();
    },
    async set(credential) {
      const previous = await current();
      const merged = mergeCredential(credential, previous);
      let value: string;
      try {
        value = encryptCredentialCookie(credentialToPayload(merged), input.key);
      } catch {
        throw new Error("credential_encrypt_failed");
      }
      try {
        input.write(value);
      } catch {
        throw new Error("credential_persist_failed");
      }
    },
    async clear() {
      input.clear();
    },
  };
}

function createBoundCookieStore(request: Request, env: NodeJS.ProcessEnv): BoundCredentialStore {
  let currentValue = readRequestCookie(request, CREDENTIAL_COOKIE);
  let pending: "set" | "clear" | null = null;
  let pendingValue = "";
  const secure = cookieSecure(request, env);
  let key: Buffer;
  try {
    key = resolveCredentialCookieKey(env);
  } catch (error) {
    const failed: CalendarCredentialStore = {
      async get() {
        return null;
      },
      async set() {
        throw error instanceof Error ? error : new Error("credential_encrypt_failed");
      },
      async clear() {
        pending = "clear";
        currentValue = undefined;
      },
    };
    return {
      kind: "cookie",
      store: failed,
      applyTo(response) {
        if (pending === "clear") expireCredentialCookie(response, secure);
        return response;
      },
    };
  }

  const store = createCookieCredentialStore({
    read: () => currentValue,
    write: (value) => {
      pending = "set";
      pendingValue = value;
      currentValue = value;
    },
    clear: () => {
      pending = "clear";
      currentValue = undefined;
    },
    key,
  });

  return {
    kind: "cookie",
    store,
    applyTo(response) {
      if (pending === "set") applyCredentialCookie(response, pendingValue, secure);
      if (pending === "clear") expireCredentialCookie(response, secure);
      return response;
    },
  };
}

export function bindGoogleCredentialStore(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): BoundCredentialStore {
  const kind = resolveCredentialStoreKind(env);
  if (kind === "file") {
    return {
      kind,
      store: defaultCredentialStore(),
      applyTo: (response) => response,
    };
  }
  return createBoundCookieStore(request, env);
}
