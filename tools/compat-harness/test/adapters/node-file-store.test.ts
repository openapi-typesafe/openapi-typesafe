import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NodeFileStore } from "../../src/adapters/node-file-store.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

describe("NodeFileStore", () => {
  it("writeText creates parent directories and readText reads the file back", async () => {
    const store = new NodeFileStore(await createDirectory());

    await store.writeText("a/b/c.txt", "content");

    expect(await store.readText("a/b/c.txt")).toBe("content");
    expect(await store.exists("a/b/c.txt")).toBe(true);
  });

  it("readText and exists report a missing file without throwing", async () => {
    const store = new NodeFileStore(await createDirectory());

    expect(await store.readText("missing.txt")).toBeUndefined();
    expect(await store.exists("missing.txt")).toBe(false);
  });

  it("remove deletes a file and ignores a missing one", async () => {
    const store = new NodeFileStore(await createDirectory());
    await store.writeText("file.txt", "x");

    await store.remove("file.txt");
    await store.remove("file.txt");

    expect(await store.exists("file.txt")).toBe(false);
  });

  it("resolve returns an absolute path under the root", async () => {
    const root = await createDirectory();

    expect(new NodeFileStore(root).resolve("x/y.json")).toBe(join(root, "x/y.json"));
  });

  it("readText rethrows errors other than a missing file", async () => {
    const root = await createDirectory();
    await mkdir(join(root, "directory"));
    const store = new NodeFileStore(root);

    await expect(store.readText("directory")).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("exists rethrows errors other than a missing file", async () => {
    const root = await createDirectory();
    await mkdir(join(root, "locked"));
    await chmod(join(root, "locked"), 0o000);
    const store = new NodeFileStore(root);

    // A directory without the search permission makes its children inaccessible (EACCES).
    await expect(store.exists("locked/file.txt")).rejects.toMatchObject({ code: "EACCES" });
    await chmod(join(root, "locked"), 0o700);
  });
});
