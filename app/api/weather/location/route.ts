import { NextResponse } from "next/server";
import { handleLocationRequest } from "@/lib/weather/reverseGeocode";

export async function GET(request: Request) {
  const { status, body } = await handleLocationRequest(request);
  return NextResponse.json(body, { status });
}
