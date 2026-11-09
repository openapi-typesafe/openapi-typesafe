import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitEnvironment } from "../../src/adapters/git-file-list/git-file-list.js";
import { type GitProcess, spawnGitProcess } from "../../src/adapters/git-file-list/git-process.js";
import { createRealGitFileList } from "./real-git.js";

/**
 * A test runs up to ten git commands one after another. On the Windows CI runner they took more
 * than the default 5 s limit together, although nothing hung.
 */
const GIT_TEST_TIMEOUT_MS = 30_000;

/** Runs the real git: the adapter's contract is git's own view of ignored files. */
describe("SpawnedGitFileList", { timeout: GIT_TEST_TIMEOUT_MS }, () => {
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

    const listing = await createRealGitFileList(root).list(root);

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

    const listing = await createRealGitFileList(root).list(join(root, "apps/web"));

    expect(listing).toEqual({ kind: "listed", paths: ["src/a.ts"] });
  });

  it("list is unavailable for a folder that the repository around it ignores", async () => {
    git(".", "init", "--quiet");
    await put(".gitignore", "build/\n");
    await put("build/project/src/a.ts", "");

    const listing = await createRealGitFileList(root).list(join(root, "build/project"));

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

    const listing = await createRealGitFileList(root).list(root);

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

    const listing = await createRealGitFileList(root).list(join(root, "app"));

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

    const listing = await createRealGitFileList(root).list(join(root, "clone/vendor/library"));

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

    const listing = await createRealGitFileList(root).list(join(root, "vendor/library"));

    expect(listing).toEqual({ kind: "listed", paths: ["index.ts"] });
    expect(await exists("MARKER")).toBe(false);
  });

  it("list is unavailable for an embedded bare repository and does not run its config", async () => {
    git(".", "init", "--quiet");
    git(".", "init", "--quiet", "--bare", "packages/api");
    git("packages/api", "config", "core.bare", "false");
    git("packages/api", "config", "core.worktree", ".");
    git("packages/api", "config", "core.fsmonitor", markerCommand());

    const listing = await createRealGitFileList(root).list(join(root, "packages/api"));

    expect(listing.kind).toBe("unavailable");
    expect(await exists("MARKER")).toBe(false);
  });

  /** Runs git in the root and gives its output, for the object ids of the fixture. */
  function gitOutput(...gitArguments: string[]): string {
    return execFileSync("git", gitArguments, { cwd: root, encoding: "utf8" });
  }

  /**
   * A planted partial clone (security finding S1): its sparse index has a directory entry whose
   * tree object is missing, so reading the index fetches that tree from the promisor remote, and
   * the fetch runs the repository's `core.sshCommand`.
   */
  async function plantLazyFetchRepository(): Promise<void> {
    git(".", "init", "--quiet");
    await put("hidden/a.txt", "x");
    await put("package.json", "{}");
    git(".", "add", ".");
    git(".", "commit", "--quiet", "-m", "init");
    git(".", "sparse-checkout", "init", "--cone", "--sparse-index");
    git(".", "sparse-checkout", "set");
    const entry = gitOutput("ls-files", "--sparse", "-s")
      .split("\n")
      .find((line) => line.endsWith("\thidden/"));
    const tree = entry?.split(" ")[1] ?? "";
    await rm(join(root, ".git", "objects", tree.slice(0, 2), tree.slice(2)));
    git(".", "config", "core.repositoryformatversion", "1");
    git(".", "config", "extensions.partialClone", "origin");
    git(".", "config", "remote.origin.url", "ssh://attacker.invalid/x.git");
    git(".", "config", "remote.origin.promisor", "true");
    git(".", "config", "core.sshCommand", markerCommand());
  }

  it("list does not fetch the missing objects of a planted partial clone", async () => {
    await plantLazyFetchRepository();

    const listing = await createRealGitFileList(root).list(root);

    // Git reports the missing tree on stderr and lists what it can read.
    expect(listing).toEqual({ kind: "listed", paths: ["package.json"] });
    expect(await exists("MARKER")).toBe(false);
  });

  /**
   * Git older than 2.45 ignores `GIT_NO_LAZY_FETCH` (Ubuntu 24.04 ships 2.43, Debian 12 2.39). The
   * real git process without that variable is such a git, so the guarantee must hold without it.
   */
  const withoutLazyFetchVariable: GitProcess = (invocation) => {
    const { GIT_NO_LAZY_FETCH: _ignored, ...environment } = invocation.environment;
    return spawnGitProcess({ ...invocation, environment });
  };

  it.each([
    ["ssh", "core.sshCommand"],
    ["file", "remote.origin.uploadpack"],
  ])(
    "list refuses a transport that the repository allows by name (%s), on every git",
    async (protocol, commandKey) => {
      await plantLazyFetchRepository();
      if (protocol === "file") {
        git(".", "init", "--quiet", "--bare", "remote");
        git(".", "config", "remote.origin.url", join(root, "remote"));
      }
      git(".", "config", `protocol.${protocol}.allow`, "always");
      git(".", "config", commandKey, markerCommand());

      const listing = await createRealGitFileList(root, process.env, withoutLazyFetchVariable).list(
        root,
      );

      expect(listing.kind).toBe("listed");
      expect(await exists("MARKER")).toBe(false);
    },
  );

  it("list uses the folder of .git as the work tree when core.worktree names another", async () => {
    git(".", "init", "--quiet", "project");
    await put("project/package.json", "{}");
    await put("victim/v.ts", "");
    git("project", "config", "core.worktree", join(root, "victim"));

    const listing = await createRealGitFileList(root).list(join(root, "project"));

    expect(listing).toEqual({ kind: "listed", paths: ["package.json"] });
  });

  it("list reads the repository above a .git folder that is no repository, as git does", async () => {
    git(".", "init", "--quiet");
    await put(".gitignore", "/sub/gen/\n");
    await put("sub/package.json", "{}");
    await put("sub/gen/package.json", "{}");
    await mkdir(join(root, "sub/.git"));

    const listing = await createRealGitFileList(root).list(join(root, "sub"));

    expect(listing).toEqual({ kind: "listed", paths: ["package.json"] });
  });

  it("list reads the repository of the folder, not the one GIT_DIR names", async () => {
    git(".", "init", "--quiet", "project");
    await put("project/a.ts", "");
    git(".", "init", "--quiet", "other");
    await put("other/b.ts", "");
    git("other", "add", "b.ts");
    const environment: GitEnvironment = {
      ...process.env,
      GIT_DIR: join(root, "other/.git"),
      GIT_INDEX_FILE: join(root, "other/.git/index"),
    };

    const listing = await createRealGitFileList(root, environment).list(join(root, "project"));

    expect(listing).toEqual({ kind: "listed", paths: ["a.ts"] });
  });

  it("list is unavailable outside a git repository", async () => {
    // A ceiling stops git from finding a repository above the temporary folder.
    vi.stubEnv("GIT_CEILING_DIRECTORIES", tmpdir());

    const listing = await createRealGitFileList(root).list(root);

    expect(listing.kind).toBe("unavailable");
  });

  it("list is unavailable for a folder that does not exist", async () => {
    const listing = await createRealGitFileList(root).list(join(root, "missing"));

    expect(listing.kind).toBe("unavailable");
  });
});
