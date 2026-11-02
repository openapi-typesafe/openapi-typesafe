import type { Workspaces } from "../../src/application/ports.ts";
import type { EvalTask } from "../../src/domain/eval-task.ts";

/** Hands out `/work/<task id>` and records what happened to each workspace. */
export class InMemoryWorkspaces implements Workspaces {
  readonly created: string[] = [];
  readonly checked: string[] = [];
  readonly removed: string[] = [];

  async create(task: EvalTask): Promise<string> {
    const directory = `/work/${task.id}`;
    this.created.push(directory);
    return directory;
  }

  async addChecks(_task: EvalTask, directory: string): Promise<void> {
    this.checked.push(directory);
  }

  async remove(directory: string): Promise<void> {
    this.removed.push(directory);
  }
}
