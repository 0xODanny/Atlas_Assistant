import type { AppState, StateStore } from "./state";

export function cloneState(state: AppState): AppState {
  return structuredClone(state);
}

export function createMemoryStore(initial: AppState): StateStore {
  let state = cloneState(initial);
  return {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  };
}
