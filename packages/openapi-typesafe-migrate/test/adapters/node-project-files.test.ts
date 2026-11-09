import { execFileSync } from "node:child_process";
import {
  access,
  chmod,
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGitFileList,
  type GitListing,
} from "../../src/adapters/git-file-list/git-file-list.js";
import { createNodeProjectFiles } from "../../src/adapters/node-project-files/node-project-files.js";
import { FixedGitFileList } from "../fakes/fixed-git-file-list.js";
import { RecordingLogger } from "../fakes/recording-logger.js";

const NOT_A_REPOSITORY: GitListing = { kind: "unavailable", reason: "not a git repository" };

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

  function filesWith(listing: GitListing, nested: ReadonlyMap<string, GitListing> = new Map()) {
    const git = new FixedGitFileList(listing, nested);
    const logger = new RecordingLogger();
    return { files: createNodeProjectFiles(root, { git, logger }), git, logger };
  }

  it("listFiles lists what git lists, without skipped folders, links and deleted files", async () => {
    await put("package.json", "{}");
    await put("src/api.ts", "");
    await put("dist/index.js", "");
    await put("cjs/index.cjs", "");
    await symlink(join(root, "src"), join(root, "linked"));
    const paths = ["package.json", "src/api.ts", "dist/index.js", "linked", "src/deleted.ts"];
    const { files, git, logger } = filesWith({ kind: "listed", paths });

    const listed = (await files.listFiles()).files;

    expect(listed).toEqual(["package.json", "src/api.ts"]);
    expect(git.directories).toEqual([root]);
    expect(logger.events).toEqual([
      {
        level: "info",
        event: "files_listed",
        fields: { directory: ".", source: "git", fileCount: 2 },
      },
    ]);
  });

  it("listFiles skips listed paths that resolve outside the root and logs them", async () => {
    const outside = await mkdtemp(join(tmpdir(), "migrate-outside-"));
    await writeFile(join(outside, "package.json"), "{}");
    await put("vendor/lib/a.ts", "");
    await symlink(outside, join(root, "linked"));
    const escaping = `vendor/lib/../../${relative(root, outside)}/package.json`;
    const paths = ["vendor/lib/a.ts", escaping, "/etc/hosts", "linked/package.json"];
    const { files, logger } = filesWith({ kind: "listed", paths });

    const listed = await files.listFiles();
    await rm(outside, { recursive: true, force: true });

    expect(listed.files).toEqual(["vendor/lib/a.ts"]);
    const skipped = [escaping, "/etc/hosts", "linked/package.json"].map((path) => ({
      path,
      reason: "outside-root",
    }));
    expect(listed.skipped).toEqual(skipped);
    expect(logger.events.filter((event) => event.level === "warn")).toEqual(
      skipped.map((fields) => ({ level: "warn", event: "file_skipped", fields })),
    );
  });

  it("listFiles skips paths outside the root that a nested repository lists", async () => {
    await put("vendor/lib/a.ts", "");
    await put("outside.ts", "");
    const nested = new Map<string, GitListing>([
      [join(root, "vendor/lib"), { kind: "listed", paths: ["a.ts", "../../outside.ts"] }],
    ]);
    const { files } = filesWith({ kind: "listed", paths: ["vendor/lib"] }, nested);

    const listed = await files.listFiles();

    expect(listed).toEqual({
      files: ["vendor/lib/a.ts"],
      skipped: [{ path: "vendor/lib/../../outside.ts", reason: "outside-root" }],
    });
  });

  it("listFiles walks the tree outside a git repository, without the skipped folders", async () => {
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
    const { files, logger } = filesWith(NOT_A_REPOSITORY);

    const listed = (await files.listFiles()).files;

    expect([...listed].sort()).toEqual(["package.json", "src/api/client.ts"]);
    expect(logger.events[0]?.fields).toEqual({
      directory: ".",
      source: "tree",
      fileCount: 2,
      reason: "not a git repository",
    });
  });

  it("listFiles lists a directory that git lists as one entry with its own git", async () => {
    await put("src/a.ts", "");
    await put("vendor/library/index.ts", "");
    await put("vendor/library/build/out.js", "");
    const nested = new Map<string, GitListing>([
      [join(root, "vendor/library"), { kind: "listed", paths: ["index.ts"] }],
    ]);
    const { files, git, logger } = filesWith(
      { kind: "listed", paths: ["src/a.ts", "vendor/library"] },
      nested,
    );

    const listed = (await files.listFiles()).files;

    expect(listed).toEqual(["src/a.ts", "vendor/library/index.ts"]);
    expect(git.directories).toEqual([root, join(root, "vendor/library")]);
    expect(logger.events.map((event) => event.fields)).toEqual([
      { directory: ".", source: "git", fileCount: 1 },
      { directory: "vendor/library", source: "git", fileCount: 1 },
    ]);
  });

  it("listFiles walks a nested directory that git cannot list", async () => {
    await put("nested/b.ts", "");
    await put("nested/node_modules/x.js", "");
    const nested = new Map<string, GitListing>([[join(root, "nested"), NOT_A_REPOSITORY]]);
    const { files, logger } = filesWith({ kind: "listed", paths: ["nested"] }, nested);

    const listed = (await files.listFiles()).files;

    expect(listed).toEqual(["nested/b.ts"]);
    expect(logger.events[1]?.fields).toEqual({
      directory: "nested",
      source: "tree",
      fileCount: 1,
      reason: "not a git repository",
    });
  });

  it("listFiles does not enter a nested directory that is a skipped folder", async () => {
    await put("node_modules/x/index.js", "");
    await put("packages/web/dist/index.js", "");
    const paths = ["node_modules/x", "packages/web/dist"];
    const { files, git } = filesWith({ kind: "listed", paths });

    const listed = (await files.listFiles()).files;

    expect(listed).toEqual([]);
    expect(git.directories).toEqual([root]);
  });

  function gitIn(directory: string, ...gitArguments: string[]): void {
    execFileSync("git", gitArguments, { cwd: join(root, directory), stdio: "ignore" });
  }

  function filesWithGit(directory: string) {
    const logger = new RecordingLogger();
    const git = createGitFileList(process.env);
    return { files: createNodeProjectFiles(join(root, directory), { git, logger }), logger };
  }

  it("listFiles with git walks a project that the repository around it ignores", async () => {
    gitIn(".", "init", "--quiet");
    await put(".gitignore", "build/\n");
    await put("build/app/src/a.ts", "");
    await put("build/app/cjs/a.cjs", "");
    const { files, logger } = filesWithGit("build/app");

    const listed = (await files.listFiles()).files;

    expect([...listed].sort()).toEqual(["cjs/a.cjs", "src/a.ts"]);
    expect(logger.events[0]?.fields).toMatchObject({ directory: ".", source: "tree" });
  });

  it("listFiles with git lists a nested repository by its own ignore rules", async () => {
    gitIn(".", "init", "--quiet");
    await put(".gitignore", "cjs/\n");
    await put("src/a.ts", "");
    await put("cjs/a.cjs", "");
    gitIn(".", "init", "--quiet", "nested");
    await put("nested/.gitignore", "out/\n");
    await put("nested/b.ts", "");
    await put("nested/cjs/b.cjs", "");
    await put("nested/out/b.js", "");
    const { files, logger } = filesWithGit(".");

    const listed = (await files.listFiles()).files;

    expect([...listed].sort()).toEqual([
      ".gitignore",
      "nested/.gitignore",
      "nested/b.ts",
      "nested/cjs/b.cjs",
      "src/a.ts",
    ]);
    expect(logger.events.map((event) => event.fields)).toMatchObject([
      { directory: ".", source: "git" },
      { directory: "nested", source: "git" },
    ]);
  });

  it("listFiles with git does not run the core.fsmonitor command of a nested repository", async () => {
    gitIn(".", "init", "--quiet");
    gitIn(".", "init", "--quiet", "vendor/library");
    await put("vendor/library/index.ts", "");
    const marker = join(root, "MARKER");
    gitIn("vendor/library", "config", "core.fsmonitor", `touch '${marker}'; false`);
    const { files } = filesWithGit(".");

    const listed = (await files.listFiles()).files;

    expect(listed).toEqual(["vendor/library/index.ts"]);
    await expect(access(marker)).rejects.toThrow();
  });

  it("read and write refuse a path that resolves outside the root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "migrate-outside-"));
    await writeFile(join(outside, "a.ts"), "outside");
    await symlink(outside, join(root, "linked"));
    const { files } = filesWith(NOT_A_REPOSITORY);

    await expect(files.read("linked/a.ts")).rejects.toThrow("outside the project folder");
    await expect(files.write("linked/a.ts", "new")).rejects.toThrow("outside the project folder");
    await expect(files.write("../a.ts", "new")).rejects.toThrow("outside the project folder");
    expect(await readFile(join(outside, "a.ts"), "utf8")).toBe("outside");
    await rm(outside, { recursive: true, force: true });
  });

  it("write replaces a hard-linked file, so the other link keeps its text", async () => {
    const outside = await mkdtemp(join(tmpdir(), "migrate-outside-"));
    await writeFile(join(outside, "a.ts"), "old");
    await mkdir(join(root, "src"));
    await link(join(outside, "a.ts"), join(root, "src/a.ts"));
    const { files, logger } = filesWith(NOT_A_REPOSITORY);

    await files.write("src/a.ts", "new");

    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("new");
    expect(await readFile(join(outside, "a.ts"), "utf8")).toBe("old");
    expect(logger.events).toEqual([
      { level: "warn", event: "hard_link_separated", fields: { path: "src/a.ts", linkCount: 2 } },
    ]);
    await rm(outside, { recursive: true, force: true });
  });

  it("write leaves no temporary file", async () => {
    await put("scripts/gen.sh", "old");
    const { files, logger } = filesWith(NOT_A_REPOSITORY);

    await files.write("scripts/gen.sh", "new");

    expect(await readdir(join(root, "scripts"))).toEqual(["gen.sh"]);
    expect(logger.events).toEqual([]);
  });

  // Windows has no POSIX permission bits: Node reports 0o666 for every file.
  it.skipIf(process.platform === "win32")("write keeps the file mode", async () => {
    await put("scripts/gen.sh", "old");
    await chmod(join(root, "scripts/gen.sh"), 0o750);
    const { files } = filesWith(NOT_A_REPOSITORY);

    await files.write("scripts/gen.sh", "new");

    expect((await stat(join(root, "scripts/gen.sh"))).mode & 0o777).toBe(0o750);
  });

  it("write does not overwrite a leftover temporary file", async () => {
    await put("src/a.ts", "old");
    await put("src/.a.ts.openapi-typesafe-migrate.tmp", "leftover");
    const { files } = filesWith(NOT_A_REPOSITORY);

    await expect(files.write("src/a.ts", "new")).rejects.toThrow("EEXIST");
    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("old");
  });

  it("write removes the temporary file when the rename fails", async () => {
    await put("src/a/b.ts", "");
    const { files } = filesWith(NOT_A_REPOSITORY);

    await expect(files.write("src/a", "new")).rejects.toThrow();
    expect(await readdir(join(root, "src"))).toEqual(["a"]);
  });

  it("read and write work on paths relative to the root", async () => {
    await put("src/a.ts", "old");
    const { files } = filesWith(NOT_A_REPOSITORY);

    await files.write("src/a.ts", `${await files.read("src/a.ts")} new`);

    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("old new");
  });
});
