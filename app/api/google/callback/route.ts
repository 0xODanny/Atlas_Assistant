import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE } from "@/lib/google/config";
import { defaultCredentialStore } from "@/lib/google/credentials";
import { exchangeGoogleCode } from "@/lib/google/oauth";
import { googleUserEmail } from "@/lib/google/provider";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const jar = await cookies();
  const stored = jar.get(OAUTH_STATE_COOKIE)?.value ?? "";
  jar.delete(OAUTH_STATE_COOKIE);
  const expected = stored.includes(":") ? stored.slice(stored.indexOf(":") + 1) : stored;

  if (error || !code || !state || state !== expected) {
    return NextResponse.redirect(new URL("/settings?google=error", request.url));
  }

  try {
    const credential = await exchangeGoogleCode({ code });
    const email = await googleUserEmail(credential.accessToken);
    await defaultCredentialStore().set({ ...credential, email });
    return NextResponse.redirect(new URL("/settings?google=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?google=error", request.url));
  }
}
