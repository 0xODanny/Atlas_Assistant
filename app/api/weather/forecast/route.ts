import { NextResponse } from "next/server";
import { handleForecastRequest } from "@/lib/weather/forecast";

export async function GET(request: Request) {
  const { status, body } = await handleForecastRequest(request);
  return NextResponse.json(body, { status });
}
