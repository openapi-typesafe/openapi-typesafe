import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { generationFailure } from "./defensive-helpers.js";

/**
 * A document whose root is not an object (an empty file, `null`, `~`) must fail with a typed
 * error, not a TypeError from reading `openapi` of nothing (pre-beta test plan §12.3, PB-41).
 */

const UNSUPPORTED_FORMAT = {
  code: "SCHEMA_VERSION_UNSUPPORTED",
  message: "Unsupported schema format, expected `openapi: 3.x`",
};

describe("a document root that is not an object", () => {
  it.each(["null", "~", "# only a comment\n"])("YAML text %j fails with a typed error", async (text) => {
    const error = await generationFailure(text);

    expect(error).toMatchObject(UNSUPPORTED_FORMAT);
  });

  it.each(["", "null\n", "\n\n"])("a file with %j fails with a typed error", async (text) => {
    const directory = await mkdtemp(path.join(tmpdir(), "non-object-root-"));
    const file = path.join(directory, "openapi.yaml");
    await writeFile(file, text);

    try {
      const error = await generationFailure(pathToFileURL(file));

      expect(error).toMatchObject(UNSUPPORTED_FORMAT);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
