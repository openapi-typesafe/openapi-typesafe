import { cp } from "node:fs/promises";
import type { AgentOutcome, AgentRequest, CodingAgent } from "../application/ports.ts";
import { taskFiles } from "./task-layout.ts";

/** Solves each task by copying its reference solution: proves the checks can pass. */
export class ReferenceSolutionAgent implements CodingAgent {
  readonly #tasksDir: string;

  constructor(tasksDir: string) {
    this.#tasksDir = tasksDir;
  }

  async solve(request: AgentRequest): Promise<AgentOutcome> {
    await cp(taskFiles(this.#tasksDir, request.task.id).solution, request.directory, {
      recursive: true,
    });
    return { isCompleted: true, output: "" };
  }
}

/** Changes nothing: proves the checks fail when the task is not done. */
export class UntouchedAgent implements CodingAgent {
  async solve(): Promise<AgentOutcome> {
    return { isCompleted: true, output: "" };
  }
}
