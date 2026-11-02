import { existsSync } from "node:fs";
import { mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type SkillInstall, TemporaryWorkspaces } from "../../src/adapters/temporary-workspaces.ts";
import { GET_PET, MIGRATE } from "../fakes/tasks.ts";
import { temporaryDirectoryFactory } from "./temporary-directory.ts";

const createDirectory = temporaryDirectoryFactory();

async function setUp(skill: "with-skill" | "without-skill") {
  const root = await createDirectory();
  const write = async (path: string, text: string) => {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  };
  await write("template/src/app.ts", "template\n");
  await write("template/package.json", "{}\n");
  await write(`tasks/${MIGRATE.id}/start/src/app.ts`, "start\n");
  await write(`tasks/${GET_PET.id}/check.ts`, "check\n");
  await write("kit/fake-api.ts", "kit\n");
  await write("skill/SKILL.md", "skill\n");
  await mkdir(join(root, "node_modules"));
  const install: SkillInstall = {
    sourceDir: join(root, "skill"),
    targetPath: ".claude/skills/openapi-typesafe",
  };
  const workspaces = new TemporaryWorkspaces({
    tempRoot: join(root, "work"),
    templateDir: join(root, "template"),
    tasksDir: join(root, "tasks"),
    kitFile: join(root, "kit/fake-api.ts"),
    nodeModulesDir: join(root, "node_modules"),
    skill: skill === "with-skill" ? install : undefined,
  });
  return { root, workspaces };
}

describe("TemporaryWorkspaces", () => {
  it("create copies the template, links node_modules and installs the skill", async () => {
    const { root, workspaces } = await setUp("with-skill");

    const directory = await workspaces.create(GET_PET);

    expect(directory.startsWith(join(root, "work", `${GET_PET.id}-`))).toBe(true);
    expect(await readFile(join(directory, "src/app.ts"), "utf8")).toBe("template\n");
    expect(await readlink(join(directory, "node_modules"))).toBe(join(root, "node_modules"));
    expect(
      await readFile(join(directory, ".claude/skills/openapi-typesafe/SKILL.md"), "utf8"),
    ).toBe("skill\n");
  });

  it("create puts the task's start files over the template and can leave out the skill", async () => {
    const { workspaces } = await setUp("without-skill");

    const directory = await workspaces.create(MIGRATE);

    expect(await readFile(join(directory, "src/app.ts"), "utf8")).toBe("start\n");
    expect(existsSync(join(directory, ".claude"))).toBe(false);
  });

  it("addChecks adds the kit and the task check under eval/", async () => {
    const { workspaces } = await setUp("without-skill");
    const directory = await workspaces.create(GET_PET);

    await workspaces.addChecks(GET_PET, directory);

    expect(await readFile(join(directory, "eval/kit.ts"), "utf8")).toBe("kit\n");
    expect(await readFile(join(directory, `eval/${GET_PET.id}.test.ts`), "utf8")).toBe("check\n");
  });

  it("remove deletes the workspace but not the linked node_modules", async () => {
    const { root, workspaces } = await setUp("without-skill");
    const directory = await workspaces.create(GET_PET);

    await workspaces.remove(directory);

    expect(existsSync(directory)).toBe(false);
    expect(existsSync(join(root, "node_modules"))).toBe(true);
  });
});
