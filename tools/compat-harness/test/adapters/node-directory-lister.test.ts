import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeDirectoryLister } from "../../src/adapters/node-directory-lister.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

describe("NodeDirectoryLister", () => {
  it("listDirectories and listFiles return sorted names of one kind", async () => {
    const root = await createDirectory();
    await mkdir(join(root, "shards/b"), { recursive: true });
    await mkdir(join(root, "shards/a"));
    await writeFile(join(root, "shards/z.json"), "{}");
    await writeFile(join(root, "shards/y.json"), "{}");
    const lister = new NodeDirectoryLister(root);

    expect(await lister.listDirectories("shards")).toEqual(["a", "b"]);
    expect(await lister.listFiles("shards")).toEqual(["y.json", "z.json"]);
  });

  it("listDirectories and listFiles of a missing directory are empty", async () => {
    const lister = new NodeDirectoryLister(await createDirectory());

    expect(await lister.listDirectories("missing")).toEqual([]);
    expect(await lister.listFiles("missing")).toEqual([]);
  });

  it("listFiles of a file rethrows the file system error", async () => {
    const root = await createDirectory();
    await writeFile(join(root, "file.txt"), "x");

    await expect(new NodeDirectoryLister(root).listFiles("file.txt")).rejects.toMatchObject({
      code: "ENOTDIR",
    });
  });
});
