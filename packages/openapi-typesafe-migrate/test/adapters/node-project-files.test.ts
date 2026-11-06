import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitListing } from "../../src/adapters/git-file-list/git-file-list.js";
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

  function filesWith(listing: GitListing) {
    const git = new FixedGitFileList(listing);
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

    const listed = await files.listFiles();

    expect(listed).toEqual(["package.json", "src/api.ts"]);
    expect(git.directories).toEqual([root]);
    expect(logger.events).toEqual([
      { level: "info", event: "files_listed", fields: { source: "git", fileCount: 2 } },
    ]);
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

    const listed = await files.listFiles();

    expect(listed.sort()).toEqual(["package.json", "src/api/client.ts"]);
    expect(logger.events[0]?.fields).toEqual({
      source: "tree",
      fileCount: 2,
      reason: "not a git repository",
    });
  });

  it("read and write work on paths relative to the root", async () => {
    await put("src/a.ts", "old");
    const { files } = filesWith(NOT_A_REPOSITORY);

    await files.write("src/a.ts", `${await files.read("src/a.ts")} new`);

    expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe("old new");
  });
});
