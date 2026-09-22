import { NextResponse } from "next/server";
import { bindGoogleCredentialStore } from "@/lib/google/credentialStore";
import { syncGoogleCalendar } from "@/lib/google/sync";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    timezone?: string;
    includedCalendarIds?: string[];
    privacyDefault?: "private" | "busy-only" | "shared";
  };
  const { store, applyTo } = bindGoogleCredentialStore(request);
  const result = await syncGoogleCalendar({
    store,
    timezone: body.timezone || "UTC",
    includedCalendarIds: body.includedCalendarIds,
    privacyDefault: body.privacyDefault,
  });
  return applyTo(NextResponse.json(result));
}
