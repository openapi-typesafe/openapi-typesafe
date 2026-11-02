import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeProjectFiles } from "../../src/adapters/node-project-files/node-project-files.js";

describe("NodeProjectFiles", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "migrate-files-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function put(path: string, text: string): Promise<void> {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }

  it("listFiles lists the tree without installed packages, git, build and tool output", async () => {
    await put("package.json", "{}");
    await put("src/api/client.ts", "");
    await put("node_modules/x/index.js", "");
    await put("apps/web/node_modules/y.js", "");
    await put(".git/HEAD", "");
    await put("dist/index.js", "");
    for (const directory of [".next", ".nuxt", ".output", ".svelte-kit", ".turbo", "coverage"]) {
      await put(`${directory}/out.js`, "");
    }
    await symlink(join(root, "src"), join(root, "linked"));

    const files = await createNodeProjectFiles(root).listFiles();

    expect(files.sort()).toEqual(["package.json", "src/api/client.ts"]);
  });

  it("read and write work on paths relative to the root", async () => {
    await put("src/a.ts", "old");
    const files = createNodeProjectFiles(root);

    await files.write("src/a.ts", `${await files.read("src/a.ts")} new`);

    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("old new");
  });
});
