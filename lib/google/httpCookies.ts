import type { NextResponse } from "next/server";
import { CREDENTIAL_COOKIE, CREDENTIAL_COOKIE_MAX_AGE_SECONDS, OAUTH_STATE_COOKIE } from "./config";

export function cookieSecure(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  return new URL(request.url).protocol === "https:" || env.VERCEL === "1" || env.NODE_ENV === "production";
}

export function readRequestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

export function credentialCookieOptions(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: CREDENTIAL_COOKIE_MAX_AGE_SECONDS,
  };
}

export function expireCookieOptions(secure: boolean): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: 0;
  expires: Date;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

export function applyCredentialCookie(response: NextResponse, value: string, secure: boolean): void {
  response.cookies.set(CREDENTIAL_COOKIE, value, credentialCookieOptions(secure));
}

export function expireCredentialCookie(response: NextResponse, secure: boolean): void {
  response.cookies.set(CREDENTIAL_COOKIE, "", expireCookieOptions(secure));
}

export function expireOAuthStateCookie(response: NextResponse, secure: boolean): void {
  response.cookies.set(OAUTH_STATE_COOKIE, "", expireCookieOptions(secure));
}

export function readSetCookieValue(response: Response, name: string): string | undefined {
  const lines =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  for (const line of lines) {
    if (!line) continue;
    const first = line.split(";", 1)[0] ?? "";
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    if (first.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(first.slice(eq + 1));
    } catch {
      return first.slice(eq + 1);
    }
  }
  return undefined;
}

export function setCookieLines(response: Response): string[] {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}
