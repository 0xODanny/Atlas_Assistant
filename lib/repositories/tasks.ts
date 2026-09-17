import { createId } from "../id";
import type { CreateTaskInput, Task } from "../types/task";
import type { StateStore } from "../data/state";

export function createTaskRepository(store: StateStore) {
  return {
    listTasks(): Task[] {
      return [...store.getState().tasks];
    },
    getTask(id: string): Task | undefined {
      return store.getState().tasks.find((task) => task.id === id);
    },
    createTask(input: CreateTaskInput): Task {
      const now = new Date().toISOString();
      const task: Task = {
        id: createId("task"),
        title: input.title.trim(),
        due: input.due,
        important: input.important ?? false,
        completed: input.completed ?? false,
        eventId: input.eventId,
        createdAt: now,
        updatedAt: now,
      };
      const state = store.getState();
      store.setState({ ...state, tasks: [...state.tasks, task] });
      return task;
    },
    updateTask(id: string, patch: Partial<Omit<Task, "id" | "createdAt">>): Task {
      const state = store.getState();
      const current = state.tasks.find((task) => task.id === id);
      if (!current) throw new Error(`Task not found: ${id}`);
      const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
      store.setState({
        ...state,
        tasks: state.tasks.map((task) => (task.id === id ? updated : task)),
      });
      return updated;
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
