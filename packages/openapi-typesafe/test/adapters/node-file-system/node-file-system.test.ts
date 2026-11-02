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

  it("writeText into a path under a file fails with OUTPUT_WRITE_FAILED", () => {
    const blocker = path.join(workDir, "blocker");
    fs.writeFileSync(blocker, "");
    const file = pathToFileURL(path.join(blocker, "types.ts"));

    expect(() => createNodeFileSystem().writeText(file, "")).toThrow(
      expect.objectContaining({ code: "OUTPUT_WRITE_FAILED" }),
    );
  });
});
