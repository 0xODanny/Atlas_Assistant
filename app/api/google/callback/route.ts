import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE } from "@/lib/google/config";
import { bindGoogleCredentialStore } from "@/lib/google/credentialStore";
import { cookieSecure, expireOAuthStateCookie, readRequestCookie } from "@/lib/google/httpCookies";
import { googleOAuthFailureCategory, logGoogleOAuthFailure } from "@/lib/google/oauthLog";
import { exchangeGoogleCode } from "@/lib/google/oauth";
import { googleUserEmail } from "@/lib/google/provider";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const stored = readRequestCookie(request, OAUTH_STATE_COOKIE) ?? "";
  const expected = stored.includes(":") ? stored.slice(stored.indexOf(":") + 1) : stored;
  const { store, applyTo } = bindGoogleCredentialStore(request);
  const secure = cookieSecure(request);

  const fail = (category: Parameters<typeof logGoogleOAuthFailure>[0]) => {
    logGoogleOAuthFailure(category);
    const response = NextResponse.redirect(new URL("/settings?google=error", request.url));
    expireOAuthStateCookie(response, secure);
    return applyTo(response);
  };

  if (error || !code || !state || state !== expected) {
    return fail("state_mismatch");
  }

  try {
    const credential = await exchangeGoogleCode({ code });
    const email = await googleUserEmail(credential.accessToken);
    await store.set({ ...credential, email });
    const response = NextResponse.redirect(new URL("/settings?google=connected", request.url));
    expireOAuthStateCookie(response, secure);
    return applyTo(response);
  } catch (cause) {
    return fail(googleOAuthFailureCategory(cause));
  }
}
