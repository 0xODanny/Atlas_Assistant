import { NextResponse } from "next/server";
import { bindGoogleCredentialStore } from "@/lib/google/credentialStore";

export async function POST(request: Request) {
  const { store, applyTo } = bindGoogleCredentialStore(request);
  await store.clear();
  return applyTo(NextResponse.json({ ok: true, connection: { status: "disconnected" } }));
}
