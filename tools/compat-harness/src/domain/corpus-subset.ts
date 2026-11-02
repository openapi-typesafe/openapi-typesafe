import { type CorpusEntry, CorpusSource } from "./corpus-entry.ts";
import { compareOrdinal } from "./ordering.ts";

/**
 * Pick a deterministic subset for the per-PR CI job (ENGINEERING_PLAN 2.6): every curated entry
 * (large and rare-version documents matter most), then preferred APIs.guru versions spread evenly
 * over the sorted list, so the subset covers the whole alphabet instead of the first vendors.
 */
export function selectCorpusSubset(entries: readonly CorpusEntry[], size: number): CorpusEntry[] {
  const sorted = [...entries].sort((left, right) => compareOrdinal(left.id, right.id));
  const curated = sorted.filter((entry) => entry.source === CorpusSource.Curated);
  const candidates = sorted.filter(
    (entry) => entry.source !== CorpusSource.Curated && entry.isPreferred,
  );
  const remaining = Math.max(0, size - curated.length);
  if (remaining >= candidates.length) {
    return [...curated, ...candidates];
  }
  const stride = candidates.length / remaining;
  const picked = Array.from(
    { length: remaining },
    (_, index) => candidates[Math.floor(index * stride)] as CorpusEntry,
  );
  return [...curated, ...picked];
}
