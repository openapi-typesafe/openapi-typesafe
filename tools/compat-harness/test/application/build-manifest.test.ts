import { describe, expect, it } from "vitest";
import { decodeManifest, encodeJson } from "../../src/application/codecs.ts";
import { REPOSITORY_PATHS } from "../../src/application/layout.ts";
import { buildManifest } from "../../src/application/use-cases/build-manifest.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { createManifest } from "../../src/domain/manifest.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";
import { FakeHttpClient } from "../fakes/fake-http-client.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const LIST_URL = "https://catalog.test/list.json";
const SPEC_URL = "https://catalog.test/specs/example.com/1.0/openapi.json";
const LIST = {
  "example.com": {
    preferred: "1.0",
    versions: { "1.0": { openapiVer: "3.0.0", swaggerUrl: SPEC_URL } },
  },
};
const CURATED = [
  {
    name: "big",
    apiVersion: "1",
    openapiVersion: "3.1.0",
    sourceUrl: "https://curated.test/big.yaml",
  },
];

function setUp(
  repositoryFiles: Record<string, string> = {},
  listReply = { status: 200, body: JSON.stringify(LIST) },
) {
  const repository = new InMemoryFileStore(repositoryFiles);
  const dependencies = {
    http: new FakeHttpClient({ [LIST_URL]: listReply }),
    repository,
    logger: new RecordingLogger(),
  };
  return { repository, dependencies };
}

describe("buildManifest", () => {
  it("buildManifest merges both catalogs and writes the manifest", async () => {
    const { repository, dependencies } = setUp({
      [REPOSITORY_PATHS.curatedCatalog]: JSON.stringify(CURATED),
    });

    const manifest = await buildManifest(dependencies, LIST_URL);

    expect(manifest.entries.map((entry) => entry.id)).toEqual([
      "apis-guru--example.com--1.0",
      "curated--big--1",
    ]);
    const written = repository.files.get(REPOSITORY_PATHS.manifest) ?? "";
    expect(decodeManifest(written)).toEqual(manifest);
    expect(dependencies.logger.records.at(-1)).toMatchObject({
      event: "manifest_built",
      fields: { entries: 2 },
    });
  });

  it("buildManifest without a curated list uses only APIs.guru and keeps known hashes", async () => {
    const previous = createManifest([
      makeEntry({
        name: "example.com",
        apiVersion: "1.0",
        sourceUrl: SPEC_URL,
        sha256: "c".repeat(64),
      }),
    ]);
    const { dependencies } = setUp({ [REPOSITORY_PATHS.manifest]: encodeJson(previous) });

    const manifest = await buildManifest(dependencies, LIST_URL);

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.sha256).toBe("c".repeat(64));
  });

  it("buildManifest with a failing catalog download throws CATALOG_INVALID", async () => {
    const { dependencies } = setUp({}, { status: 503, body: "" });

    await expect(buildManifest(dependencies, LIST_URL)).rejects.toMatchObject({
      code: HarnessErrorCode.CatalogInvalid,
    });
  });

  it("buildManifest with a catalog that is not JSON throws CATALOG_INVALID", async () => {
    const { dependencies } = setUp({}, { status: 200, body: "<html>" });

    await expect(buildManifest(dependencies, LIST_URL)).rejects.toThrow(/is not valid JSON/);
  });
});
