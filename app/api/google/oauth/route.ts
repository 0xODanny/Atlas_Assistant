import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, googleOAuthConfigured } from "@/lib/google/config";
import { buildGoogleAuthUrl, createOAuthState, type OAuthMode } from "@/lib/google/oauth";

export async function GET(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=not_configured", request.url));
  }
  const mode = new URL(request.url).searchParams.get("mode") === "write" ? "write" : "readonly";
  const state = createOAuthState();
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, `${mode}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(buildGoogleAuthUrl({ state, mode: mode as OAuthMode }));
}
