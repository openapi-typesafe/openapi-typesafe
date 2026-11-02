import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileTaskCatalog } from "../../src/adapters/file-task-catalog.ts";
import { ReferenceSolutionAgent, UntouchedAgent } from "../../src/adapters/stand-in-agents.ts";
import { GET_PET } from "../fakes/tasks.ts";
import { temporaryDirectoryFactory } from "./temporary-directory.ts";

const createDirectory = temporaryDirectoryFactory();

async function writeTask(tasksDir: string, id: string, category: string): Promise<void> {
  await mkdir(join(tasksDir, id), { recursive: true });
  await writeFile(
    join(tasksDir, id, "task.json"),
    JSON.stringify({ title: id, category, prompt: "p" }),
  );
}

describe("FileTaskCatalog", () => {
  it("list reads every task directory, sorted by id, and skips files", async () => {
    const tasksDir = await createDirectory();
    await writeTask(tasksDir, "02-second", "errors");
    await writeTask(tasksDir, "01-first", "setup");
    await writeFile(join(tasksDir, "README.md"), "not a task");

    const tasks = await new FileTaskCatalog(tasksDir).list();

    expect(tasks.map((task) => [task.id, task.category])).toEqual([
      ["01-first", "setup"],
      ["02-second", "errors"],
    ]);
  });

  it("list rejects an invalid task file", async () => {
    const tasksDir = await createDirectory();
    await writeTask(tasksDir, "01-first", "not-a-category");

    await expect(new FileTaskCatalog(tasksDir).list()).rejects.toThrow(
      "Task 01-first: invalid task.json",
    );
  });
});

describe("ReferenceSolutionAgent", () => {
  it("solve copies the reference solution over the workspace", async () => {
    const tasksDir = await createDirectory();
    const workspace = await createDirectory();
    await mkdir(join(tasksDir, GET_PET.id, "solution", "src"), { recursive: true });
    await writeFile(join(tasksDir, GET_PET.id, "solution", "src", "pets.ts"), "export {};\n");

    const outcome = await new ReferenceSolutionAgent(tasksDir).solve({
      task: GET_PET,
      directory: workspace,
      prompt: "",
    });

    expect(outcome).toEqual({ isCompleted: true, output: "" });
    expect(await readFile(join(workspace, "src", "pets.ts"), "utf8")).toBe("export {};\n");
  });
});

describe("UntouchedAgent", () => {
  it("solve completes without changing anything", async () => {
    expect(await new UntouchedAgent().solve()).toEqual({ isCompleted: true, output: "" });
  });
});
