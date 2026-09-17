import { createHash, randomBytes } from "node:crypto";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_EVENTS_SCOPE,
  GOOGLE_READONLY_SCOPE,
  GOOGLE_TOKEN_URL,
  googleOAuthEnv,
  type GoogleOAuthEnv,
} from "./config";
import type { CalendarCredential } from "./credentials";

export type OAuthMode = "readonly" | "write";

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function scopesForMode(mode: OAuthMode): string {
  return mode === "write" ? `${GOOGLE_READONLY_SCOPE} ${GOOGLE_EVENTS_SCOPE}` : GOOGLE_READONLY_SCOPE;
}

export function buildGoogleAuthUrl(input: {
  env?: NodeJS.ProcessEnv;
  state: string;
  mode?: OAuthMode;
}): string {
  const oauth = googleOAuthEnv(input.env);
  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    response_type: "code",
    scope: scopesForMode(input.mode ?? "readonly"),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function credentialFromToken(data: TokenResponse, previous?: CalendarCredential | null): CalendarCredential {
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || "google_token_exchange_failed");
  }
  return {
    provider: "google",
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: Date.now() + Math.max(30, (data.expires_in ?? 3600) - 60) * 1000,
    scope: data.scope || previous?.scope,
    email: previous?.email,
    tokenType: data.token_type || previous?.tokenType || "Bearer",
  };
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await response.json()) as TokenResponse;
}

export async function exchangeGoogleCode(input: {
  code: string;
  env?: NodeJS.ProcessEnv;
  oauth?: GoogleOAuthEnv;
}): Promise<CalendarCredential> {
  const oauth = input.oauth ?? googleOAuthEnv(input.env);
  const data = await postToken(
    new URLSearchParams({
      code: input.code,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      redirect_uri: oauth.redirectUri,
      grant_type: "authorization_code",
    }),
  );
  return credentialFromToken(data);
}

export async function refreshGoogleAccessToken(input: {
  credential: CalendarCredential;
  env?: NodeJS.ProcessEnv;
  oauth?: GoogleOAuthEnv;
}): Promise<CalendarCredential> {
  if (!input.credential.refreshToken) {
    throw new Error("google_refresh_token_missing");
  }
  const oauth = input.oauth ?? googleOAuthEnv(input.env);
  const data = await postToken(
    new URLSearchParams({
      refresh_token: input.credential.refreshToken,
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      grant_type: "refresh_token",
    }),
  );
  return credentialFromToken(data, input.credential);
}

export async function ensureFreshGoogleCredential(
  credential: CalendarCredential,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ credential: CalendarCredential; refreshed: boolean }> {
  if (credential.expiresAt > Date.now() + 15_000) {
    return { credential, refreshed: false };
  }
  return { credential: await refreshGoogleAccessToken({ credential, env }), refreshed: true };
}
