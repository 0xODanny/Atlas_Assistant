import { NextResponse } from "next/server";
import { bindGoogleCredentialStore } from "@/lib/google/credentialStore";
import { applyIncludedCalendars, syncGoogleCalendar } from "@/lib/google/sync";

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    timezone?: string;
    includedCalendarIds?: string[];
    privacyDefault?: "private" | "busy-only" | "shared";
    calendars?: Array<{ id: string; included: boolean }>;
  };
  const included =
    body.includedCalendarIds ??
    (body.calendars ?? []).filter((calendar) => calendar.included).map((calendar) => calendar.id);
  const { store, applyTo } = bindGoogleCredentialStore(request);
  const result = await syncGoogleCalendar({
    store,
    timezone: body.timezone || "UTC",
    includedCalendarIds: included,
    privacyDefault: body.privacyDefault,
  });
  if (result.connection.calendars) {
    result.connection.calendars = applyIncludedCalendars(result.connection.calendars, included);
  }
  return applyTo(NextResponse.json(result));
}
