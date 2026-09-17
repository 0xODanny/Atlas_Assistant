import type { AssistantRequest, AssistantResponse, AssistantSource } from "../types/assistant";
import { openaiConfigured } from "./capabilities";
import { classifyIntent } from "./classify";
import { buildModelContext } from "./context";
import { fulfillIntent } from "./fulfill";
import { atlasOutcome, logAssistantOp } from "./log";
import { completeOpenAIIntent } from "./openai";
import { refineModelIntent } from "./refineIntent";
import { parseModelIntent } from "./schema";

export type PipelineMode = "auto" | "mock" | "openai";

export type AssistantRuntimeDeps = {
  complete?: typeof completeOpenAIIntent;
};

function lastUserText(request: AssistantRequest): string {
  return [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function withSource(
  response: AssistantResponse,
  source: AssistantSource,
  extra?: Pick<AssistantResponse, "error" | "errorCategory">,
): AssistantResponse {
  return { ...response, source, ...extra };
}

function notConfigured(): AssistantResponse {
  return {
    intentType: "answer",
    message: "OpenAI is not configured in this local environment. Nothing was changed.",
    actions: [],
    source: "error",
    error: "openai_not_configured",
    errorCategory: "openai_not_configured",
  };
}

export function runAssistantDeterministic(request: AssistantRequest): AssistantResponse {
  const text = lastUserText(request);
  const classified = classifyIntent(text, request.pending);
  const intent = refineModelIntent(request.pending, classified, text, request.context);
  const response = withSource(fulfillIntent(intent, request.context), "local");
  response.resume = response.pending ?? intent;
  return response;
}

export async function runAssistant(
  request: AssistantRequest,
  mode: PipelineMode = "auto",
  env: NodeJS.ProcessEnv = process.env,
  deps: AssistantRuntimeDeps = {},
): Promise<AssistantResponse> {
  const started = Date.now();
  const text = lastUserText(request);
  const hasKey = openaiConfigured(env);
  const complete = deps.complete ?? completeOpenAIIntent;

  if (mode === "openai" && !hasKey) {
    const response = notConfigured();
    logAssistantOp({
      source: "error",
      schema: "skipped",
      atlas: "reject",
      latencyMs: Date.now() - started,
      errorCategory: "openai_not_configured",
    });
    return response;
  }

  if (mode === "mock" || !hasKey) {
    const response = runAssistantDeterministic(request);
    logAssistantOp({
      source: "local",
      intentType: response.intentType,
      schema: "skipped",
      atlas: atlasOutcome(response),
      latencyMs: Date.now() - started,
    });
    return response;
  }

  try {
    const raw = await complete({
      apiKey: env.OPENAI_API_KEY as string,
      userText: text,
      modelContext: buildModelContext(request.context, request.pending),
      pending: request.pending,
    });
    const parsed = parseModelIntent(raw);
    if (!parsed.ok) {
      const errorCategory = parsed.error.startsWith("Invalid intent type")
        ? "unsupported_intent"
        : "invalid_intent";
      const response = withSource(
        {
          intentType: "answer",
          message: "I could not use that model response. Nothing was changed.",
          actions: [],
        },
        "error",
        { error: parsed.error, errorCategory },
      );
      logAssistantOp({
        source: "error",
        schema: "fail",
        atlas: "reject",
        latencyMs: Date.now() - started,
        errorCategory,
      });
      return response;
    }
    const intent = refineModelIntent(request.pending, parsed.data, text, request.context);
    const fulfilled = withSource(fulfillIntent(intent, request.context), "openai");
    fulfilled.resume = fulfilled.pending ?? intent;
    logAssistantOp({
      source: "openai",
      intentType: fulfilled.intentType,
      schema: "ok",
      atlas: atlasOutcome(fulfilled),
      latencyMs: Date.now() - started,
    });
    return fulfilled;
  } catch (error) {
    const message = error instanceof Error ? error.message : "openai_unavailable";
    const errorCategory = /timeout|aborted/i.test(message) ? "openai_timeout" : "openai_unavailable";
    const response = withSource(
      {
        intentType: "answer",
        message: "I could not reach OpenAI. Nothing was changed.",
        actions: [],
      },
      "error",
      { error: errorCategory, errorCategory },
    );
    logAssistantOp({
      source: "error",
      schema: "fail",
      atlas: "reject",
      latencyMs: Date.now() - started,
      errorCategory,
    });
    return response;
  }
}
