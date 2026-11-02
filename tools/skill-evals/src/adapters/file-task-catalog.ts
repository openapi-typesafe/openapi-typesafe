import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskCatalog } from "../application/ports.ts";
import { parseTask } from "../application/task-codec.ts";
import type { EvalTask } from "../domain/eval-task.ts";

/** Reads `<tasksDir>/<id>/task.json` for every task directory, sorted by id. */
export class FileTaskCatalog implements TaskCatalog {
  readonly #tasksDir: string;

  constructor(tasksDir: string) {
    this.#tasksDir = tasksDir;
  }

  async list(): Promise<readonly EvalTask[]> {
    const entries = await readdir(this.#tasksDir, { withFileTypes: true });
    const ids = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    return Promise.all(
      ids.map(async (id) =>
        parseTask(id, await readFile(join(this.#tasksDir, id, "task.json"), "utf8")),
      ),
    );
  }
}
