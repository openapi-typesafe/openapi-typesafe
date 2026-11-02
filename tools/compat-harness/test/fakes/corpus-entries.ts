import {
  type CorpusEntry,
  CorpusSource,
  createCorpusEntryId,
} from "../../src/domain/corpus-entry.ts";

/** Build a corpus entry with sensible defaults; tests override only what they check. */
export function makeEntry(
  overrides: Partial<CorpusEntry> & { readonly name: string },
): CorpusEntry {
  const source = overrides.source ?? CorpusSource.ApisGuru;
  const apiVersion = overrides.apiVersion ?? "1.0.0";
  return {
    id: createCorpusEntryId(source, overrides.name, apiVersion),
    source,
    apiVersion,
    openapiVersion: "3.0.0",
    openapiLine: "3.0",
    sourceUrl: `https://example.test/${overrides.name}/${apiVersion}/openapi.json`,
    isPreferred: true,
    sha256: null,
    ...overrides,
  };
}
