import type { AssistantRequest, AssistantResponse } from "../types/assistant";

export interface AssistantModelProvider {
  complete(request: AssistantRequest): Promise<AssistantResponse>;
}
