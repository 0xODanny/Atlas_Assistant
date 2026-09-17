import { NextResponse } from "next/server";
import { defaultCredentialStore } from "@/lib/google/credentials";

export async function POST() {
  await defaultCredentialStore().clear();
  return NextResponse.json({ ok: true, connection: { status: "disconnected" } });
}
