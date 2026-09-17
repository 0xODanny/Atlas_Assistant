import { NextResponse } from "next/server";
import { defaultCredentialStore } from "@/lib/google/credentials";
import { syncGoogleCalendar } from "@/lib/google/sync";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    timezone?: string;
    includedCalendarIds?: string[];
    privacyDefault?: "private" | "busy-only" | "shared";
  };
  const result = await syncGoogleCalendar({
    store: defaultCredentialStore(),
    timezone: body.timezone || "UTC",
    includedCalendarIds: body.includedCalendarIds,
    privacyDefault: body.privacyDefault,
  });
  return NextResponse.json(result);
}
