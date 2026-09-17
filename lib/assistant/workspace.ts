import type { AssistantAction, AssistantChoice, AssistantSource, FreeWindow, ModelIntent } from "../types/assistant";

export type AssistantTurn = {
  id: string;
  prompt: string;
  content: string;
  actions: AssistantAction[];
  intentType?: string;
  choices?: AssistantChoice[];
  selectedChoiceId?: string;
  pending?: ModelIntent;
  resume?: ModelIntent;
  targetEventId?: string;
  windows?: FreeWindow[];
  error?: string;
  source?: AssistantSource;
};

export type AssistantWorkspace = {
  active: AssistantTurn | null;
  history: AssistantTurn[];
  lastError?: string;
};

export function emptyWorkspace(): AssistantWorkspace {
  return { active: null, history: [] };
}

export function replaceActiveResponse(
  workspace: AssistantWorkspace,
  next: AssistantTurn,
): AssistantWorkspace {
  const history = workspace.active ? [workspace.active, ...workspace.history] : workspace.history;
  return { active: next, history, lastError: undefined };
}

export function keepActiveWithError(workspace: AssistantWorkspace, error: string): AssistantWorkspace {
  return { ...workspace, lastError: error };
}

export function updateActiveAction(
  workspace: AssistantWorkspace,
  actionId: string,
  action: AssistantAction,
): AssistantWorkspace {
  if (!workspace.active) return workspace;
  return {
    ...workspace,
    active: {
      ...workspace.active,
      actions: workspace.active.actions.map((entry) => (entry.id === actionId ? action : entry)),
    },
  };
}

export function selectActiveChoice(
  workspace: AssistantWorkspace,
  choiceId: string,
  action: AssistantAction,
): AssistantWorkspace {
  if (!workspace.active) return workspace;
  return {
    ...workspace,
    active: {
      ...workspace.active,
      selectedChoiceId: choiceId,
      actions: [action, ...workspace.active.actions.filter((item) => item.kind === "read")],
    },
  };
}

export function restoreHistoryTurn(workspace: AssistantWorkspace, id: string): AssistantWorkspace {
  const found = workspace.history.find((item) => item.id === id);
  if (!found) return workspace;
  const remaining = workspace.history.filter((item) => item.id !== id);
  const history = workspace.active ? [workspace.active, ...remaining] : remaining;
  return { active: found, history };
}
