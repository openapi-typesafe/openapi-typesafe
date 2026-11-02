import { join } from "node:path";

/** Where the files of one task live under the tasks directory. */
export interface TaskFiles {
  /** Files copied over the template before the agent starts (optional). */
  readonly start: string;
  /** The reference solution, copied over the workspace by the reference agent. */
  readonly solution: string;
  /** The hidden check, a Vitest file added after the agent finishes. */
  readonly check: string;
}

export function taskFiles(tasksDir: string, taskId: string): TaskFiles {
  const directory = join(tasksDir, taskId);
  return {
    start: join(directory, "start"),
    solution: join(directory, "solution"),
    check: join(directory, "check.ts"),
  };
}
