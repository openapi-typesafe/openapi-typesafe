import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeDirectoryEraser } from "../../src/adapters/node-directory-eraser.ts";
import { NodeProjectSwitcher } from "../../src/adapters/node-project-switcher.ts";
import type { SwitchedPackageSpecs } from "../../src/domain/package-switch.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

const SPECS: SwitchedPackageSpecs = {
  "openapi-typesafe": "file:/t/a.tgz",
  "openapi-typesafe-fetch": "file:/t/b.tgz",
  "openapi-typesafe-react-query": "file:/t/c.tgz",
  "openapi-typesafe-helpers": "file:/t/d.tgz",
};

const IMPORT = 'import createClient from "openapi-fetch";\n';

async function writeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

describe("NodeProjectSwitcher", () => {
  it("switchProject rewrites manifests and sources and skips installed packages and git", async () => {
    const root = await createDirectory();
    await writeTree(root, {
      "package.json": '{ "dependencies": { "openapi-fetch": "1" } }\n',
      "packages/app/package.json": '{ "name": "app" }\n',
      "src/client.ts": IMPORT,
      "src/view.svelte": IMPORT,
      "README.md": IMPORT,
      "node_modules/openapi-fetch/index.js": IMPORT,
      ".git/hooks/x.js": IMPORT,
    });

    const summary = await new NodeProjectSwitcher().switchProject(root, SPECS);

    expect(summary).toEqual({ changedFileCount: 3, replacementCount: 3 });
    expect(await readFile(join(root, "src/client.ts"), "utf8")).toContain(
      '"openapi-typesafe-fetch"',
    );
    expect(await readFile(join(root, "src/view.svelte"), "utf8")).toContain("openapi-typesafe");
    expect(await readFile(join(root, "README.md"), "utf8")).toBe(IMPORT);
    expect(await readFile(join(root, "node_modules/openapi-fetch/index.js"), "utf8")).toBe(IMPORT);
    expect(await readFile(join(root, ".git/hooks/x.js"), "utf8")).toBe(IMPORT);
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies).toEqual({
      "openapi-typesafe-fetch": "file:/t/b.tgz",
    });
  });
});

describe("NodeProjectSwitcher.pinUpstreamVersions", () => {
  it("pinUpstreamVersions rewrites only package manifests", async () => {
    const root = await createDirectory();
    await writeTree(root, {
      "package.json": '{ "devDependencies": { "openapi-typescript": "^7.4.0" } }\n',
      "src/client.ts": IMPORT,
    });

    const summary = await new NodeProjectSwitcher().pinUpstreamVersions(root);

    expect(summary).toEqual({ changedFileCount: 1, replacementCount: 1 });
    expect(await readFile(join(root, "src/client.ts"), "utf8")).toBe(IMPORT);
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).toEqual({
      devDependencies: { "openapi-typescript": "7.13.0" },
    });
  });
});

describe("NodeDirectoryEraser", () => {
  it("erase deletes a directory tree and accepts a missing one", async () => {
    const root = await createDirectory();
    await writeTree(root, { "a/b/c.txt": "x" });
    const eraser = new NodeDirectoryEraser();

    await eraser.erase(join(root, "a"));
    await eraser.erase(join(root, "missing"));

    await expect(readFile(join(root, "a/b/c.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
