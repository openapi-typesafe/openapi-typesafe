import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  /** Runs git in `directory` of the root, as a fixed author so that commits work anywhere. */
  function git(directory: string, ...gitArguments: string[]): void {
    const author = ["-c", "user.name=test", "-c", "user.email=test@example.com"];
    const options = ["-c", "init.defaultBranch=main", "-c", "protocol.file.allow=always"];
    execFileSync("git", [...author, ...options, ...gitArguments], {
      cwd: join(root, directory),
      stdio: "ignore",
    });
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

  it("list is unavailable for a folder that the repository around it ignores", async () => {
    git(".", "init", "--quiet");
    await put(".gitignore", "build/\n");
    await put("build/project/src/a.ts", "");

    const listing = await createGitFileList().list(join(root, "build/project"));

    expect(listing).toEqual({
      kind: "unavailable",
      reason: "the git repository around the folder ignores it",
    });
  });

  it("list gives each file of a merge conflict once", async () => {
    git(".", "init", "--quiet");
    await put("a.ts", "base");
    git(".", "add", "a.ts");
    git(".", "commit", "--quiet", "-m", "base");
    git(".", "checkout", "--quiet", "-b", "other");
    await put("a.ts", "other");
    git(".", "commit", "--quiet", "-am", "other");
    git(".", "checkout", "--quiet", "main");
    await put("a.ts", "main");
    git(".", "commit", "--quiet", "-am", "main");
    expect(() => git(".", "merge", "other")).toThrow();

    const listing = await createGitFileList().list(root);

    expect(listing).toEqual({ kind: "listed", paths: ["a.ts"] });
  });

  it("list gives a submodule and a nested repository as one entry each", async () => {
    git(".", "init", "--quiet", "library");
    await put("library/index.ts", "");
    git("library", "add", "index.ts");
    git("library", "commit", "--quiet", "-m", "library");
    git(".", "init", "--quiet", "app");
    git("app", "submodule", "add", "--quiet", "../library", "vendor/library");
    git("app", "init", "--quiet", "nested");
    await put("app/nested/b.ts", "");

    const listing = await createGitFileList().list(join(root, "app"));

    expect(listing.kind === "listed" && [...listing.paths].sort()).toEqual([
      ".gitmodules",
      "nested",
      "vendor/library",
    ]);
  });

  it("list gives nothing for a submodule that is not checked out", async () => {
    git(".", "init", "--quiet", "library");
    await put("library/index.ts", "");
    git("library", "add", "index.ts");
    git("library", "commit", "--quiet", "-m", "library");
    git(".", "init", "--quiet", "app");
    git("app", "submodule", "add", "--quiet", "../library", "vendor/library");
    git("app", "commit", "--quiet", "-m", "app");
    git(".", "clone", "--quiet", "app", "clone");

    const listing = await createGitFileList().list(join(root, "clone/vendor/library"));

    expect(listing).toEqual({ kind: "listed", paths: [] });
  });

  async function exists(path: string): Promise<boolean> {
    return access(join(root, path)).then(
      () => true,
      () => false,
    );
  }

  /** A command for `core.fsmonitor` that leaves a marker file when git runs it. */
  function markerCommand(): string {
    return `touch '${join(root, "MARKER")}'; false`;
  }

  it("list does not run the core.fsmonitor command of a nested repository", async () => {
    git(".", "init", "--quiet");
    git(".", "init", "--quiet", "vendor/library");
    await put("vendor/library/index.ts", "");
    git("vendor/library", "config", "core.fsmonitor", markerCommand());

    const listing = await createGitFileList().list(join(root, "vendor/library"));

    expect(listing).toEqual({ kind: "listed", paths: ["index.ts"] });
    expect(await exists("MARKER")).toBe(false);
  });

  it("list is unavailable for an embedded bare repository and does not run its config", async () => {
    git(".", "init", "--quiet");
    git(".", "init", "--quiet", "--bare", "packages/api");
    git("packages/api", "config", "core.bare", "false");
    git("packages/api", "config", "core.worktree", ".");
    git("packages/api", "config", "core.fsmonitor", markerCommand());

    const listing = await createGitFileList().list(join(root, "packages/api"));

    expect(listing.kind).toBe("unavailable");
    expect(await exists("MARKER")).toBe(false);
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
