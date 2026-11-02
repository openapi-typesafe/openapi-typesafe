import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import type { Workspaces } from "../application/ports.ts";
import type { EvalTask } from "../domain/eval-task.ts";
import { taskFiles } from "./task-layout.ts";

/** The skill to install in each workspace, where the agent looks for skills. */
export interface SkillInstall {
  readonly sourceDir: string;
  /** Relative to the workspace, such as `.claude/skills/openapi-typesafe`. */
  readonly targetPath: string;
}

export interface TemporaryWorkspacesOptions {
  /** Parent of the workspaces; outside the repository, so agents cannot read the checks. */
  readonly tempRoot: string;
  readonly templateDir: string;
  readonly tasksDir: string;
  /** The shared test kit of the checks (`eval/kit.ts` in the workspace). */
  readonly kitFile: string;
  /** Linked as `node_modules`, so a workspace needs no install. */
  readonly nodeModulesDir: string;
  /** `undefined` runs the agent without the skill, as a baseline. */
  readonly skill: SkillInstall | undefined;
}

/** The directory of the hidden checks in a workspace; the template tsconfig includes it. */
const CHECKS_DIR = "eval";

/** Workspaces in fresh temporary directories, each a copy of the template project. */
export class TemporaryWorkspaces implements Workspaces {
  readonly #options: TemporaryWorkspacesOptions;

  constructor(options: TemporaryWorkspacesOptions) {
    this.#options = options;
  }

  async create(task: EvalTask): Promise<string> {
    const { tempRoot, templateDir, tasksDir, nodeModulesDir, skill } = this.#options;
    await mkdir(tempRoot, { recursive: true });
    const directory = await mkdtemp(join(tempRoot, `${task.id}-`));
    await cp(templateDir, directory, { recursive: true });
    const { start } = taskFiles(tasksDir, task.id);
    if (existsSync(start)) {
      await cp(start, directory, { recursive: true });
    }
    await symlink(nodeModulesDir, join(directory, "node_modules"), "dir");
    if (skill !== undefined) {
      await cp(skill.sourceDir, join(directory, skill.targetPath), { recursive: true });
    }
    return directory;
  }

  async addChecks(task: EvalTask, directory: string): Promise<void> {
    const checksDir = join(directory, CHECKS_DIR);
    await mkdir(checksDir, { recursive: true });
    await cp(this.#options.kitFile, join(checksDir, "kit.ts"));
    await cp(
      taskFiles(this.#options.tasksDir, task.id).check,
      join(checksDir, `${task.id}.test.ts`),
    );
  }

  async remove(directory: string): Promise<void> {
    await rm(directory, { recursive: true, force: true });
  }
}
