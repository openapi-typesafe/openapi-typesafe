import type { EvalTask } from "../../src/domain/eval-task.ts";
import type { TaskResult } from "../../src/domain/task-result.ts";

export const GET_PET: EvalTask = {
  id: "03-get-pet-name",
  title: "Read a pet",
  category: "typed-calls",
  prompt: "Create src/pets.ts.",
};

export const AUTH: EvalTask = {
  id: "17-auth-middleware",
  title: "Auth middleware",
  category: "middleware",
  prompt: "Create src/auth.ts.",
};

export const MIGRATE: EvalTask = {
  id: "29-migrate-fetch-project",
  title: "Migrate",
  category: "migration",
  prompt: "Move the project.",
};

export function resultOf(task: EvalTask, outcome: TaskResult["outcome"]): TaskResult {
  return { taskId: task.id, category: task.category, outcome, durationMs: 1_000, detail: "" };
}
