import { NextResponse } from "next/server";
import { defaultCredentialStore } from "@/lib/google/credentials";
import { loadFreshGoogleCredential } from "@/lib/google/sync";
import { writeGoogleEvent, type GoogleWriteRequest } from "@/lib/google/write";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GoogleWriteRequest & { userTimezone?: string };
  const credential = await loadFreshGoogleCredential(defaultCredentialStore());
  if (!credential) {
    return NextResponse.json({ ok: false, error: "google_not_connected" }, { status: 401 });
  }
  try {
    const event = await writeGoogleEvent({
      credential,
      request: body.kind === "create" ? { ...body, userTimezone: body.userTimezone || "UTC" } : body,
    });
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_write_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
