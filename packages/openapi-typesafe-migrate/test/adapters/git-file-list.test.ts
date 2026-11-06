import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitFileList } from "../../src/adapters/git-file-list/git-file-list.js";

/** Runs the real git: the adapter's contract is git's own view of ignored files. */
describe("SpawnedGitFileList", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "migrate-git-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });

  async function put(path: string, text: string): Promise<void> {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }

  it("list gives tracked and untracked files that .gitignore does not ignore", async () => {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await put(".gitignore", "cjs/\nesm/\n*.log\n");
    await put("src/api.ts", "");
    await put("src/name with space.ts", "");
    await put("cjs/index.cjs", "");
    await put("esm/index.mjs", "");
    await put("debug.log", "");
    execFileSync("git", ["add", "src/api.ts"], { cwd: root });

    const listing = await createGitFileList().list(root);

    expect(listing.kind === "listed" && [...listing.paths].sort()).toEqual([
      ".gitignore",
      "src/api.ts",
      "src/name with space.ts",
    ]);
  });

  it("list gives paths relative to a folder inside the repository", async () => {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await put("apps/web/src/a.ts", "");
    await put("other.ts", "");

    const listing = await createGitFileList().list(join(root, "apps/web"));

    expect(listing).toEqual({ kind: "listed", paths: ["src/a.ts"] });
  });

  it("list is unavailable outside a git repository", async () => {
    // A ceiling stops git from finding a repository above the temporary folder.
    vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());

    const listing = await createGitFileList().list(root);

    expect(listing.kind).toBe("unavailable");
  });

  it("list is unavailable for a folder that does not exist", async () => {
    const listing = await createGitFileList().list(join(root, "missing"));

    expect(listing.kind).toBe("unavailable");
  });
});
