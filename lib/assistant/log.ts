import type { AssistantResponse, AssistantSource } from "../types/assistant";

export function atlasOutcome(response: AssistantResponse): "ok" | "reject" | "clarify" {
  if (response.intentType === "clarify" || response.pending) return "clarify";
  if (response.error) return "reject";
  const proposed = response.actions.some((item) => item.kind === "propose");
  if (!proposed && /conflict|cannot|could not|will not|stack/i.test(response.message)) {
    return "reject";
  }
  return "ok";
}

export function logAssistantOp(entry: {
  source: AssistantSource;
  intentType?: string;
  schema?: "ok" | "fail" | "skipped";
  atlas?: "ok" | "reject" | "clarify";
  latencyMs: number;
  errorCategory?: string;
}): void {
  console.info("[atlas/assistant]", {
    source: entry.source,
    intentType: entry.intentType ?? null,
    schema: entry.schema ?? "skipped",
    atlas: entry.atlas ?? null,
    latencyMs: entry.latencyMs,
    errorCategory: entry.errorCategory ?? null,
  });
}

export function sourceHasSecrets(value: unknown): boolean {
  const text = JSON.stringify(value);
  return /sk-[a-zA-Z0-9]|Bearer\s+[A-Za-z0-9]|OPENAI_API_KEY/i.test(text);
}
