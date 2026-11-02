import type { OpenApiLine } from "./openapi-version.ts";

/** Identifier of one schema version in the corpus; safe to use as a file name. */
export type CorpusEntryId = string & { readonly __brand: "CorpusEntryId" };

/** Where a corpus entry comes from. */
export const CorpusSource = {
  ApisGuru: "apis-guru",
  Curated: "curated",
} as const;

export type CorpusSource = (typeof CorpusSource)[keyof typeof CorpusSource];

/** One downloadable OpenAPI document. `sha256` is null until the document has been fetched once. */
export interface CorpusEntry {
  readonly id: CorpusEntryId;
  readonly source: CorpusSource;
  readonly name: string;
  readonly apiVersion: string;
  readonly openapiVersion: string;
  readonly openapiLine: OpenApiLine;
  readonly sourceUrl: string;
  readonly isPreferred: boolean;
  readonly sha256: string | null;
}

const UNSAFE_FILE_NAME_CHARACTERS = /[^A-Za-z0-9._-]+/g;
const ID_PART_SEPARATOR = "--";

/** Build a stable, file-system-safe identifier from the source, API name and API version. */
export function createCorpusEntryId(
  source: CorpusSource,
  name: string,
  apiVersion: string,
): CorpusEntryId {
  const parts = [source, name, apiVersion].map((part) =>
    part.replace(UNSAFE_FILE_NAME_CHARACTERS, "_"),
  );
  return parts.join(ID_PART_SEPARATOR) as CorpusEntryId;
}
