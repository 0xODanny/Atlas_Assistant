import { NextResponse } from "next/server";
import { handleWeatherRequest } from "@/lib/weather/http";

export async function GET(request: Request) {
  const { status, body } = await handleWeatherRequest(request);
  return NextResponse.json(body, { status });
}
