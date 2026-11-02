import { z } from "zod";
import { type CorpusEntry, CorpusSource, createCorpusEntryId } from "../domain/corpus-entry.ts";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import { toOpenApiLine } from "../domain/openapi-version.ts";

/** Shape of https://api.apis.guru/v2/list.json (only the fields the harness reads). */
const ApisGuruListSchema = z.record(
  z.string(),
  z.object({
    preferred: z.string(),
    versions: z.record(
      z.string(),
      z.object({
        openapiVer: z.string(),
        swaggerUrl: z.url(),
      }),
    ),
  }),
);

/** Shape of `corpus/curated.json`: hand-picked documents pinned to a commit. */
const CuratedListSchema = z.array(
  z.object({
    name: z.string().min(1),
    apiVersion: z.string().min(1),
    openapiVersion: z.string().min(1),
    sourceUrl: z.url(),
  }),
);

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, catalogName: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HarnessError(
      HarnessErrorCode.CatalogInvalid,
      `${catalogName}: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

/**
 * Convert the APIs.guru list into corpus entries; Swagger 2.0 and other unsupported versions are
 * skipped.
 */
export function readApisGuruCatalog(input: unknown): CorpusEntry[] {
  const list = parseOrThrow(ApisGuruListSchema, input, "APIs.guru list");
  const entries: CorpusEntry[] = [];
  for (const [name, api] of Object.entries(list)) {
    for (const [apiVersion, version] of Object.entries(api.versions)) {
      const openapiLine = toOpenApiLine(version.openapiVer);
      if (!openapiLine) {
        continue;
      }
      entries.push({
        id: createCorpusEntryId(CorpusSource.ApisGuru, name, apiVersion),
        source: CorpusSource.ApisGuru,
        name,
        apiVersion,
        openapiVersion: version.openapiVer,
        openapiLine,
        sourceUrl: version.swaggerUrl,
        isPreferred: apiVersion === api.preferred,
        sha256: null,
      });
    }
  }
  return entries;
}

/**
 * Convert the curated list into corpus entries. Every curated document must be a supported version.
 */
export function readCuratedCatalog(input: unknown): CorpusEntry[] {
  const list = parseOrThrow(CuratedListSchema, input, "curated list");
  return list.map((item) => {
    const openapiLine = toOpenApiLine(item.openapiVersion);
    if (!openapiLine) {
      const version = item.openapiVersion;
      const message = `curated list: ${item.name} has unsupported OpenAPI version ${version}`;
      throw new HarnessError(HarnessErrorCode.CatalogInvalid, message);
    }
    return {
      id: createCorpusEntryId(CorpusSource.Curated, item.name, item.apiVersion),
      source: CorpusSource.Curated,
      name: item.name,
      apiVersion: item.apiVersion,
      openapiVersion: item.openapiVersion,
      openapiLine,
      sourceUrl: item.sourceUrl,
      isPreferred: true,
      sha256: null,
    };
  });
}

/** Parse catalog text as JSON; invalid JSON is a catalog error, not a crash. */
export function parseCatalogJson(text: string, catalogName: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HarnessError(
      HarnessErrorCode.CatalogInvalid,
      `${catalogName} is not valid JSON: ${reason}`,
    );
  }
}
