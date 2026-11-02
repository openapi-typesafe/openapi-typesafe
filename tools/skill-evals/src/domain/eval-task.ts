/** The areas of the skill a task exercises; the report groups results by them. */
export const TaskCategory = {
  Setup: "setup",
  TypedCalls: "typed-calls",
  Errors: "errors",
  Middleware: "middleware",
  Types: "types",
  ReactQuery: "react-query",
  Migration: "migration",
  Generator: "generator",
  Testing: "testing",
} as const;
export type TaskCategory = (typeof TaskCategory)[keyof typeof TaskCategory];

export const TASK_CATEGORIES: readonly TaskCategory[] = Object.values(TaskCategory);

/** One coding task: the agent gets the prompt, hidden checks decide whether it passed. */
export interface EvalTask {
  /** The task directory name, such as `03-get-pet-name`. */
  readonly id: string;
  readonly title: string;
  readonly category: TaskCategory;
  readonly prompt: string;
}

/**
 * The tasks with the given ids, in catalog order; all tasks when `ids` is empty. Throws on an id
 * that is not in the catalog, so a typo does not silently run nothing.
 */
export function selectTasks(
  tasks: readonly EvalTask[],
  ids: readonly string[],
): readonly EvalTask[] {
  if (ids.length === 0) {
    return tasks;
  }
  const known = new Set(tasks.map((task) => task.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown task: ${unknown.join(", ")}`);
  }
  const wanted = new Set(ids);
  return tasks.filter((task) => wanted.has(task.id));
}
