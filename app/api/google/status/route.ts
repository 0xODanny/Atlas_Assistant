import { NextResponse } from "next/server";
import { defaultCredentialStore } from "@/lib/google/credentials";
import { publicGoogleStatus } from "@/lib/google/status";

export async function GET() {
  const status = await publicGoogleStatus(defaultCredentialStore());
  return NextResponse.json(status);
}
