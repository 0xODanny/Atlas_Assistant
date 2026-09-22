import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, googleOAuthConfigured } from "@/lib/google/config";
import {
  buildGoogleAuthUrl,
  createOAuthState,
  renderOAuthContinuePage,
  wantsOAuthDocument,
  type OAuthMode,
} from "@/lib/google/oauth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=not_configured", request.url));
  }
  const mode = requestUrl.searchParams.get("mode") === "write" ? "write" : "readonly";
  const state = createOAuthState();
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, `${mode}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const googleUrl = buildGoogleAuthUrl({ state, mode: mode as OAuthMode });

  if (requestUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ url: googleUrl, configured: true });
  }

  if (wantsOAuthDocument(request)) {
    return new NextResponse(renderOAuthContinuePage(googleUrl), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.redirect(googleUrl);
}
