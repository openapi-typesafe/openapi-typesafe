import type { CorpusEntry, CorpusEntryId } from "./corpus-entry.ts";
import { HarnessError, HarnessErrorCode } from "./errors.ts";
import { compareOrdinal } from "./ordering.ts";

/** Version of the manifest file format; bump it when the shape changes. */
export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * The committed list of corpus documents. Only URLs and hashes are stored: the documents carry
 * their owners' licenses and are never redistributed (ENGINEERING_PLAN 2.1).
 */
export interface CorpusManifest {
  readonly schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  readonly entries: readonly CorpusEntry[];
}

/** Create a manifest with entries sorted by id. Throws if two entries share an id. */
export function createManifest(entries: readonly CorpusEntry[]): CorpusManifest {
  const sorted = [...entries].sort((left, right) => compareOrdinal(left.id, right.id));
  for (let index = 1; index < sorted.length; index++) {
    const current = sorted[index];
    if (current && current.id === sorted[index - 1]?.id) {
      throw new HarnessError(
        HarnessErrorCode.DuplicateCorpusEntry,
        `Duplicate corpus entry id: ${current.id}`,
      );
    }
  }
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, entries: sorted };
}

/**
 * Return a copy of the manifest with the given hashes recorded. Entries not in the map are
 * unchanged.
 */
export function recordHashes(
  manifest: CorpusManifest,
  hashes: ReadonlyMap<CorpusEntryId, string>,
): CorpusManifest {
  const entries = manifest.entries.map((entry) => {
    const sha256 = hashes.get(entry.id);
    return sha256 === undefined ? entry : { ...entry, sha256 };
  });
  return { ...manifest, entries };
}

/**
 * Keep known hashes when a manifest is rebuilt: a hash stays valid only while the source URL is
 * unchanged.
 */
export function carryOverHashes(
  next: CorpusManifest,
  previous: CorpusManifest | undefined,
): CorpusManifest {
  if (!previous) {
    return next;
  }
  const previousById = new Map(previous.entries.map((entry) => [entry.id, entry]));
  const entries = next.entries.map((entry) => {
    const old = previousById.get(entry.id);
    const isSameSource = old !== undefined && old.sourceUrl === entry.sourceUrl;
    return isSameSource ? { ...entry, sha256: old.sha256 } : entry;
  });
  return { ...next, entries };
}
