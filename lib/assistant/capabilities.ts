import type { CapabilityId, CapabilityStatus } from "../types/assistant";

export function openaiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function currentCapabilities(env: NodeJS.ProcessEnv = process.env): CapabilityStatus[] {
  return [
    { id: "openai", available: openaiConfigured(env) },
    { id: "calendar", available: true },
    { id: "weather", available: false },
    { id: "memory", available: false },
    { id: "telegram", available: false },
  ];
}

export function capabilityAvailable(id: CapabilityId, env: NodeJS.ProcessEnv = process.env): boolean {
  return currentCapabilities(env).some((item) => item.id === id && item.available);
}

export function capabilityCopy(id: CapabilityId): string {
  switch (id) {
    case "weather":
      return "I don't have live weather connected yet.";
    case "memory":
      return "Meeting memory is not available yet. I only have the agenda and notes already on the calendar.";
    case "telegram":
      return "Telegram is not connected yet.";
    case "openai":
      return "OpenAI is not configured in this local environment.";
    default:
      return "That connection is not available yet.";
  }
}
