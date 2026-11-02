import { describe, expect, it } from "vitest";
import {
  decodeComparisonResults,
  decodeGenerationResults,
  decodeManifest,
  encodeJson,
} from "../../src/application/codecs.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { createManifest } from "../../src/domain/manifest.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";

const storedFileError = expect.objectContaining({ code: HarnessErrorCode.StoredFileInvalid });

describe("encodeJson", () => {
  it("encodeJson indents with two spaces and ends with a newline", () => {
    expect(encodeJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
  });
});

describe("decodeManifest", () => {
  it("decodeManifest round-trips an encoded manifest", () => {
    const manifest = createManifest([makeEntry({ name: "a", sha256: "f".repeat(64) })]);

    expect(decodeManifest(encodeJson(manifest))).toEqual(manifest);
  });

  it("decodeManifest with a malformed hash throws STORED_FILE_INVALID", () => {
    const manifest = createManifest([makeEntry({ name: "a", sha256: "not-a-hash" })]);

    expect(() => decodeManifest(encodeJson(manifest))).toThrow(storedFileError);
  });

  it("decodeManifest with invalid JSON throws STORED_FILE_INVALID", () => {
    expect(() => decodeManifest("{")).toThrow(storedFileError);
  });
});

describe("decodeGenerationResults and decodeComparisonResults", () => {
  it("decodeGenerationResults accepts valid results", () => {
    const results = [
      { entryId: "e", optionSetId: "default", status: "ok", durationMs: 1, errorExcerpt: "" },
    ];

    expect(decodeGenerationResults(encodeJson(results))).toEqual(results);
  });

  it("decodeComparisonResults with an unknown status throws STORED_FILE_INVALID", () => {
    const results = [
      {
        entryId: "e",
        optionSetId: "default",
        status: "almost",
        firstDifferentLine: null,
        differentLineCount: 0,
        differentTypeNames: [],
      },
    ];

    expect(() => decodeComparisonResults(encodeJson(results))).toThrow(storedFileError);
  });
});
