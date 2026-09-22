import { NextResponse } from "next/server";
import { bindGoogleCredentialStore } from "@/lib/google/credentialStore";
import { loadFreshGoogleCredential } from "@/lib/google/sync";
import { writeGoogleEvent, type GoogleWriteRequest } from "@/lib/google/write";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GoogleWriteRequest & { userTimezone?: string };
  const { store, applyTo } = bindGoogleCredentialStore(request);
  const credential = await loadFreshGoogleCredential(store);
  if (!credential) {
    return applyTo(NextResponse.json({ ok: false, error: "google_not_connected" }, { status: 401 }));
  }
  try {
    const event = await writeGoogleEvent({
      credential,
      request: body.kind === "create" ? { ...body, userTimezone: body.userTimezone || "UTC" } : body,
    });
    return applyTo(NextResponse.json({ ok: true, event }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_write_failed";
    return applyTo(NextResponse.json({ ok: false, error: message }, { status: 409 }));
  }
}
