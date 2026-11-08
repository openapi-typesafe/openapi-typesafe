import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createNodeFileSystem } from "../../../src/adapters/node-file-system/node-file-system.js";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-fs-"));

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("createNodeFileSystem", () => {
  it("writeText creates the directory and readText reads the file back", () => {
    const files = createNodeFileSystem();
    const file = pathToFileURL(path.join(workDir, "nested/dir/types.ts"));

    files.writeText(file, "export {};\n");

    expect(files.readText(file)).toBe("export {};\n");
  });

  it("readText of a missing file fails with OUTPUT_READ_FAILED and the path", () => {
    const file = path.join(workDir, "missing.ts");

    expect(() => createNodeFileSystem().readText(pathToFileURL(file))).toThrow(
      expect.objectContaining({
        code: "OUTPUT_READ_FAILED",
        message: expect.stringContaining(`Cannot read ${file}: ENOENT`),
        details: { file },
      }),
    );
  });

  it("isSameFile of one path, also spelled with `..`, is true", () => {
    const file = path.join(workDir, "same.yaml");

    const isSame = createNodeFileSystem().isSameFile(
      pathToFileURL(file),
      pathToFileURL(path.join(workDir, "nested", "..", "same.yaml")),
    );

    expect(isSame).toBe(true);
  });

  it("isSameFile of a symbolic link and its target is true", () => {
    const target = path.join(workDir, "target.yaml");
    const link = path.join(workDir, "link.yaml");
    fs.writeFileSync(target, "openapi: 3.1.0");
    fs.symlinkSync(target, link);

    expect(createNodeFileSystem().isSameFile(pathToFileURL(link), pathToFileURL(target))).toBe(
      true,
    );
  });

  it("isSameFile of a hard link and the file is true", () => {
    const original = path.join(workDir, "original.yaml");
    const hardLink = path.join(workDir, "hard-link.yaml");
    fs.writeFileSync(original, "openapi: 3.1.0");
    fs.linkSync(original, hardLink);

    expect(
      createNodeFileSystem().isSameFile(pathToFileURL(hardLink), pathToFileURL(original)),
    ).toBe(true);
  });

  it("isSameFile in another letter case is true exactly when the file system ignores case", () => {
    const lower = path.join(workDir, "case.yaml");
    const upper = path.join(workDir, "CASE.yaml");
    fs.writeFileSync(lower, "openapi: 3.1.0");

    const isSame = createNodeFileSystem().isSameFile(pathToFileURL(upper), pathToFileURL(lower));

    expect(isSame).toBe(fs.existsSync(upper));
  });

  it("isSameFile of two files, or of a missing or unreadable one, is false", () => {
    const first = path.join(workDir, "first.yaml");
    const second = path.join(workDir, "second.yaml");
    fs.writeFileSync(first, "a");
    fs.writeFileSync(second, "b");
    const files = createNodeFileSystem();

    expect(files.isSameFile(pathToFileURL(first), pathToFileURL(second))).toBe(false);
    expect(
      files.isSameFile(pathToFileURL(path.join(workDir, "none.ts")), pathToFileURL(first)),
    ).toBe(false);
    expect(
      files.isSameFile(pathToFileURL(first), pathToFileURL(path.join(first, "under.ts"))),
    ).toBe(false);
  });

  it("writeText into a path under a file fails with OUTPUT_WRITE_FAILED", () => {
    const blocker = path.join(workDir, "blocker");
    fs.writeFileSync(blocker, "");
    const file = pathToFileURL(path.join(blocker, "types.ts"));

    expect(() => createNodeFileSystem().writeText(file, "")).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
    );
  });
});
