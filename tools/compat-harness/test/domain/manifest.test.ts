import { describe, expect, it } from "vitest";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import {
  carryOverHashes,
  createManifest,
  MANIFEST_SCHEMA_VERSION,
  recordHashes,
} from "../../src/domain/manifest.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("createManifest", () => {
  it("createManifest with unsorted entries sorts them by id", () => {
    const manifest = createManifest([makeEntry({ name: "zeta" }), makeEntry({ name: "alpha" })]);

    expect(manifest.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(manifest.entries.map((entry) => entry.name)).toEqual(["alpha", "zeta"]);
  });

  it("createManifest with a duplicate id throws DUPLICATE_CORPUS_ENTRY", () => {
    const create = () => createManifest([makeEntry({ name: "same" }), makeEntry({ name: "same" })]);

    expect(create).toThrow(
      expect.objectContaining({ code: HarnessErrorCode.DuplicateCorpusEntry }),
    );
  });
});

describe("recordHashes", () => {
  it("recordHashes sets hashes of listed entries and leaves others unchanged", () => {
    const manifest = createManifest([
      makeEntry({ name: "a" }),
      makeEntry({ name: "b", sha256: HASH_B }),
    ]);
    const first = manifest.entries[0]?.id as CorpusEntryId;

    const updated = recordHashes(manifest, new Map([[first, HASH_A]]));

    expect(updated.entries.map((entry) => entry.sha256)).toEqual([HASH_A, HASH_B]);
  });
});

describe("carryOverHashes", () => {
  it("carryOverHashes without a previous manifest returns the new manifest", () => {
    const next = createManifest([makeEntry({ name: "a" })]);

    expect(carryOverHashes(next, undefined)).toBe(next);
  });

  it("carryOverHashes keeps a hash only while the source URL is unchanged", () => {
    const previous = createManifest([
      makeEntry({ name: "same-url", sha256: HASH_A }),
      makeEntry({ name: "moved", sha256: HASH_B }),
    ]);
    const next = createManifest([
      makeEntry({ name: "same-url" }),
      makeEntry({ name: "moved", sourceUrl: "https://example.test/new-location.json" }),
      makeEntry({ name: "new" }),
    ]);

    const merged = carryOverHashes(next, previous);

    expect(merged.entries.map((entry) => [entry.name, entry.sha256])).toEqual([
      ["moved", null],
      ["new", null],
      ["same-url", HASH_A],
    ]);
  });
});
