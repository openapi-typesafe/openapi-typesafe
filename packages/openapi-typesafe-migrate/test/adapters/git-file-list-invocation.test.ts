import { describe, expect, it } from "vitest";
import { createGitFileList } from "../../src/adapters/git-file-list/git-file-list.js";
import { InMemoryGitFileSystem } from "../fakes/in-memory-git-file-system.js";
import { RecordingGitProcess } from "../fakes/recording-git-process.js";

/** The invocations of the git file list, with a recorded git and an in-memory file system. */
describe("HardenedGitFileList invocations", () => {
  const environment = {
    PATH: ".:/usr/bin",
    HOME: "/home/user",
    GIT_DIR: "/hook/.git",
    GIT_INDEX_FILE: "/hook/.git/index",
  };
  const fileSystem = new InMemoryGitFileSystem(["git", "/usr/bin/git"], ["/r/.git"]);

  it("list runs git by its absolute path in the directory, with the hardening", async () => {
    const git = new RecordingGitProcess("a.ts\0");
    const list = createGitFileList({
      environment,
      platform: "linux",
      projectRoot: "/r",
      fileSystem,
      process: git.run,
    });

    const listing = await list.list("/r/apps/web");

    expect(listing).toEqual({ kind: "listed", paths: ["a.ts"] });
    expect(git.invocations.map(({ executable, directory }) => [executable, directory])).toEqual([
      ["/usr/bin/git", "/r"],
      ["/usr/bin/git", "/r/apps/web"],
      ["/usr/bin/git", "/r/apps/web"],
    ]);
    const hardened = { GIT_ALLOW_PROTOCOL: "", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" };
    expect(git.invocations[0]?.environment).toEqual({
      PATH: ".:/usr/bin",
      HOME: "/home/user",
      GIT_CEILING_DIRECTORIES: "/",
      ...hardened,
    });
    expect(git.invocations[1]?.environment).toEqual({
      PATH: ".:/usr/bin",
      HOME: "/home/user",
      GIT_WORK_TREE: "/r",
      ...hardened,
    });
  });

  it("list passes over a .git that git takes as no repository", async () => {
    const git = new RecordingGitProcess("", new Set(["/r"]));
    const withEmptyGit = new InMemoryGitFileSystem(["/usr/bin/git"], ["/r/.git", "/r/apps/.git"]);
    const list = createGitFileList({
      environment,
      platform: "linux",
      projectRoot: "/r",
      fileSystem: withEmptyGit,
      process: git.run,
    });

    await list.list("/r/apps");

    expect(git.invocations.map(({ directory }) => directory)).toEqual([
      "/r/apps",
      "/r",
      "/r/apps",
      "/r/apps",
    ]);
    expect(git.invocations[1]?.environment).toHaveProperty("GIT_CEILING_DIRECTORIES", "/");
    expect(git.invocations[2]?.environment).toHaveProperty("GIT_WORK_TREE", "/r");
  });

  it("list sets no work tree for a directory that no .git is above", async () => {
    const git = new RecordingGitProcess("");
    const list = createGitFileList({
      environment,
      platform: "linux",
      projectRoot: "/r",
      fileSystem,
      process: git.run,
    });

    await list.list("/elsewhere");

    expect(git.invocations[0]?.environment).not.toHaveProperty("GIT_WORK_TREE");
  });

  it("list is unavailable without running anything when PATH has no git", async () => {
    const git = new RecordingGitProcess("");
    const options = {
      environment: { PATH: "." },
      platform: "linux" as const,
      fileSystem,
      projectRoot: "/r",
    };
    const list = createGitFileList({ ...options, process: git.run });

    const listing = await list.list("/r");

    expect(listing).toEqual({
      kind: "unavailable",
      reason: "no git executable in an absolute folder of PATH",
    });
    expect(git.invocations).toEqual([]);
  });
});
