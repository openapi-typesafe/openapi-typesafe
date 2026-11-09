import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createNodeGitFileSystem,
  findGitExecutable,
  findWorkTree,
  type GitHost,
} from "../../src/adapters/git-file-list/git-locations.js";
import { InMemoryGitFileSystem } from "../fakes/in-memory-git-file-system.js";

function posixHost(path: string | undefined, executables: readonly string[]): GitHost {
  return {
    environment: path === undefined ? {} : { PATH: path },
    platform: "linux",
    fileSystem: new InMemoryGitFileSystem(executables),
  };
}

describe("findGitExecutable", () => {
  it("findGitExecutable gives the first absolute PATH folder that has git", async () => {
    const host = posixHost("/opt/none:/usr/local/bin:/usr/bin", [
      "/usr/local/bin/git",
      "/usr/bin/git",
    ]);

    expect(await findGitExecutable(host)).toBe("/usr/local/bin/git");
  });

  it("findGitExecutable passes over empty and relative PATH entries", async () => {
    const host = posixHost(":.:node_modules/.bin:/usr/bin", [
      "git",
      "./git",
      "node_modules/.bin/git",
      "/usr/bin/git",
    ]);

    expect(await findGitExecutable(host)).toBe("/usr/bin/git");
  });

  it("findGitExecutable gives undefined without PATH or without git on it", async () => {
    expect(await findGitExecutable(posixHost(undefined, ["/usr/bin/git"]))).toBeUndefined();
    expect(await findGitExecutable(posixHost("/usr/bin", []))).toBeUndefined();
  });

  it("findGitExecutable on Windows reads Path in any case and finds git.exe", async () => {
    const host: GitHost = {
      environment: { Path: ".;project;C:\\Program Files\\Git\\cmd" },
      platform: "win32",
      fileSystem: new InMemoryGitFileSystem([
        "git.exe",
        "project\\git.exe",
        "C:\\Program Files\\Git\\cmd\\git.exe",
      ]),
    };

    expect(await findGitExecutable(host)).toBe("C:\\Program Files\\Git\\cmd\\git.exe");
  });
});

describe("findWorkTree", () => {
  it("findWorkTree gives the nearest folder at or above the directory with .git", async () => {
    const host = { ...posixHost("", []), fileSystem: new InMemoryGitFileSystem([], ["/r/.git"]) };

    expect(await findWorkTree("/r/apps/web", host)).toBe("/r");
    expect(await findWorkTree("/r", host)).toBe("/r");
  });

  it("findWorkTree gives undefined when no folder above has .git", async () => {
    expect(await findWorkTree("/r/apps", posixHost("", []))).toBeUndefined();
  });
});

describe("createNodeGitFileSystem", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "migrate-git-fs-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "isExecutableFile is true only for a file with the execute bit",
    async () => {
      await writeFile(join(root, "run"), "");
      await chmod(join(root, "run"), 0o755);
      await writeFile(join(root, "data"), "");
      await chmod(join(root, "data"), 0o644);
      await mkdir(join(root, "folder"));
      await chmod(join(root, "folder"), 0o755);
      const fileSystem = createNodeGitFileSystem();

      expect(await fileSystem.isExecutableFile(join(root, "run"))).toBe(true);
      expect(await fileSystem.isExecutableFile(join(root, "data"))).toBe(false);
      expect(await fileSystem.isExecutableFile(join(root, "folder"))).toBe(false);
      expect(await fileSystem.isExecutableFile(join(root, "missing"))).toBe(false);
    },
  );

  it("hasEntry is true for a file or folder and false for a missing path", async () => {
    await writeFile(join(root, ".git"), "gitdir: elsewhere");
    const fileSystem = createNodeGitFileSystem();

    expect(await fileSystem.hasEntry(join(root, ".git"))).toBe(true);
    expect(await fileSystem.hasEntry(join(root, "missing"))).toBe(false);
    expect(await fileSystem.hasEntry(join(root, ".git", "below-a-file"))).toBe(false);
  });

  it("hasEntry passes on an error that does not mean a missing path", async () => {
    const fileSystem = createNodeGitFileSystem();

    await expect(fileSystem.hasEntry("bad\0path")).rejects.toThrow();
  });
});
