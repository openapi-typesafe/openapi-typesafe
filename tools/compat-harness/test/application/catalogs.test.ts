import { describe, expect, it } from "vitest";
import {
  parseCatalogJson,
  readApisGuruCatalog,
  readCuratedCatalog,
} from "../../src/application/catalogs.ts";
import { CorpusSource } from "../../src/domain/corpus-entry.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";

const catalogError = expect.objectContaining({ code: HarnessErrorCode.CatalogInvalid });

const APIS_GURU_LIST = {
  "example.com": {
    preferred: "2.0",
    versions: {
      "1.0": {
        openapiVer: "2.0",
        swaggerUrl: "https://api.apis.guru/v2/specs/example.com/1.0/swagger.json",
      },
      "2.0": {
        openapiVer: "3.1.0",
        swaggerUrl: "https://api.apis.guru/v2/specs/example.com/2.0/openapi.json",
      },
      "2.1": {
        openapiVer: "3.0.3",
        swaggerUrl: "https://api.apis.guru/v2/specs/example.com/2.1/openapi.json",
      },
    },
  },
};

describe("readApisGuruCatalog", () => {
  it("readApisGuruCatalog skips Swagger 2.0 and marks the preferred version", () => {
    const entries = readApisGuruCatalog(APIS_GURU_LIST);

    expect(
      entries.map((entry) => [entry.apiVersion, entry.openapiLine, entry.isPreferred]),
    ).toEqual([
      ["2.0", "3.1", true],
      ["2.1", "3.0", false],
    ]);
    expect(entries[0]).toMatchObject({
      source: CorpusSource.ApisGuru,
      name: "example.com",
      sha256: null,
    });
  });

  it("readApisGuruCatalog with a wrong shape throws CATALOG_INVALID", () => {
    expect(() => readApisGuruCatalog({ "example.com": { versions: {} } })).toThrow(catalogError);
  });
});

describe("readCuratedCatalog", () => {
  const item = {
    name: "train-travel",
    apiVersion: "1.3.0",
    openapiVersion: "3.2.0",
    sourceUrl: "https://example.test/openapi.yaml",
  };

  it("readCuratedCatalog returns preferred curated entries", () => {
    const [entry] = readCuratedCatalog([item]);

    expect(entry).toMatchObject({
      id: "curated--train-travel--1.3.0",
      source: CorpusSource.Curated,
      openapiLine: "3.2",
      isPreferred: true,
    });
  });

  it("readCuratedCatalog with an unsupported version throws CATALOG_INVALID", () => {
    expect(() => readCuratedCatalog([{ ...item, openapiVersion: "2.0" }])).toThrow(catalogError);
  });

  it("readCuratedCatalog with an invalid URL throws CATALOG_INVALID", () => {
    expect(() => readCuratedCatalog([{ ...item, sourceUrl: "not a url" }])).toThrow(catalogError);
  });
});

describe("parseCatalogJson", () => {
  it("parseCatalogJson parses valid JSON", () => {
    expect(parseCatalogJson('{"a":1}', "test")).toEqual({ a: 1 });
  });

  it("parseCatalogJson with invalid JSON throws CATALOG_INVALID naming the catalog", () => {
    expect(() => parseCatalogJson("{", "my catalog")).toThrow(/my catalog is not valid JSON/);
  });
});
