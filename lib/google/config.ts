export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const OAUTH_STATE_COOKIE = "atlas_google_oauth_state";
export const CREDENTIAL_STORE_PATH = ".atlas/google-credentials.json";

export type GoogleOAuthEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

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
