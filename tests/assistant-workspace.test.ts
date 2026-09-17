import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyWorkspace,
  replaceActiveResponse,
  restoreHistoryTurn,
  updateActiveAction,
  type AssistantTurn,
} from "../lib/assistant/workspace";
import type { AssistantAction } from "../lib/types/assistant";

function turn(id: string, prompt: string): AssistantTurn {
  return { id, prompt, content: `${prompt} result`, actions: [] };
}

test("selecting another assistant action replaces the active response", () => {
  const first = replaceActiveResponse(emptyWorkspace(), turn("a", "What's my day looking like?"));
  const second = replaceActiveResponse(first, turn("b", "Prepare me for my next meeting."));
  const third = replaceActiveResponse(second, turn("c", "Reorganize tomorrow."));

  assert.equal(third.active?.prompt, "Reorganize tomorrow.");
  assert.equal(third.active?.id, "c");
  assert.equal(third.history.length, 2);
  assert.equal(third.history[0]?.prompt, "Prepare me for my next meeting.");
  assert.equal(third.history[1]?.prompt, "What's my day looking like?");
  assert.equal(third.history.some((item) => item.id === third.active?.id), false);
});

test("dismiss updates only the active proposal", () => {
  const action: AssistantAction = {
    id: "act_1",
    kind: "propose",
    tool: "createEvent",
    label: "Protect focus block",
    summary: "9:00 AM–12:00 PM · Focus",
    status: "proposed",
  };
  const workspace = replaceActiveResponse(emptyWorkspace(), {
    id: "t1",
    prompt: "Reorganize tomorrow.",
    content: "Protect a focus block.",
    actions: [action],
  });
  const dismissed = updateActiveAction(workspace, "act_1", { ...action, status: "dismissed" });
  assert.equal(dismissed.active?.actions[0]?.status, "dismissed");
  assert.equal(workspace.active?.actions[0]?.status, "proposed");
});

test("history restore makes a previous turn the single active response", () => {
  let workspace = replaceActiveResponse(emptyWorkspace(), turn("a", "Day"));
  workspace = replaceActiveResponse(workspace, turn("b", "Prepare"));
  workspace = restoreHistoryTurn(workspace, "a");
  assert.equal(workspace.active?.id, "a");
  assert.equal(workspace.history[0]?.id, "b");
});
