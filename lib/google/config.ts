export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const OAUTH_STATE_COOKIE = "atlas_google_oauth_state";
export const CREDENTIAL_COOKIE = "atlas_google_credential";
export const CREDENTIAL_COOKIE_KEY_ENV = "ATLAS_CREDENTIAL_COOKIE_KEY";
export const CREDENTIAL_STORE_ENV = "ATLAS_CREDENTIAL_STORE";
export const CREDENTIAL_STORE_PATH = ".atlas/google-credentials.json";
export const CREDENTIAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const CREDENTIAL_COOKIE_SAFE_LIMIT = 3500;
export const CREDENTIAL_COOKIE_HARD_LIMIT = 4096;

export type GoogleOAuthEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type CredentialStoreKind = "file" | "cookie";

export function resolveCredentialStoreKind(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CredentialStoreKind {
  const explicit = env[CREDENTIAL_STORE_ENV]?.trim();
  if (explicit === "cookie" || explicit === "file") return explicit;
  if (env.VERCEL === "1") return "cookie";
  return "file";
}

export function googleOAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function googleOAuthEnv(env: NodeJS.ProcessEnv = process.env): GoogleOAuthEnv {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim() || "http://localhost:3002/api/google/callback";
  if (!clientId || !clientSecret) {
    throw new Error("google_oauth_not_configured");
  }
  return { clientId, clientSecret, redirectUri };
}

export function hasWriteScope(scope?: string): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(GOOGLE_EVENTS_SCOPE) || scope.split(/\s+/).includes("https://www.googleapis.com/auth/calendar");
}
