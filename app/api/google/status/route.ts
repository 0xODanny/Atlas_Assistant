import { NextResponse } from "next/server";
import { bindGoogleCredentialStore } from "@/lib/google/credentialStore";
import { publicGoogleStatus } from "@/lib/google/status";

export async function GET(request: Request) {
  const { store, applyTo } = bindGoogleCredentialStore(request);
  const status = await publicGoogleStatus(store);
  return applyTo(NextResponse.json(status));
}
