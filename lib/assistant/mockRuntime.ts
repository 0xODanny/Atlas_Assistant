import type { AssistantModelProvider } from "../integrations/assistant-provider";
import type { AssistantRequest, AssistantResponse } from "../types/assistant";
import { runAssistantDeterministic } from "./pipeline";

export class MockAssistantRuntime implements AssistantModelProvider {
  async complete(request: AssistantRequest): Promise<AssistantResponse> {
    return runAssistantDeterministic(request);
  }
}

export const mockAssistantRuntime = new MockAssistantRuntime();
