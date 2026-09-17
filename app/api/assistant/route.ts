import { NextResponse } from "next/server";
import { currentCapabilities, openaiConfigured } from "@/lib/assistant/capabilities";
import { runAssistant } from "@/lib/assistant/pipeline";
import type { AssistantRequest } from "@/lib/types/assistant";

export async function GET() {
  return NextResponse.json({
    openai: openaiConfigured() ? "connected" : "not_configured",
    capabilities: currentCapabilities(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as AssistantRequest;
  if (!body?.context || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid assistant request." }, { status: 400 });
  }
  const response = await runAssistant(body);
  return NextResponse.json(response);
}
