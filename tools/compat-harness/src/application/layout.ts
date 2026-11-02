import type { CorpusEntry, CorpusEntryId } from "../domain/corpus-entry.ts";

/**
 * File layout of the harness. Repository paths are relative to the harness package; cache paths are
 * relative to the cache directory (downloaded documents and generated outputs are never committed).
 */
export const REPOSITORY_PATHS = {
  manifest: "corpus/manifest.json",
  curatedCatalog: "corpus/curated.json",
  dependents: "corpus/dependents.json",
} as const;

const KNOWN_DOCUMENT_EXTENSIONS = [".json", ".yaml", ".yml"] as const;
const DEFAULT_DOCUMENT_EXTENSION = ".json";

/** Keep the source extension, because the schema loader picks the parser from it. */
export function documentPath(entry: CorpusEntry): string {
  const pathname = new URL(entry.sourceUrl).pathname.toLowerCase();
  const extension =
    KNOWN_DOCUMENT_EXTENSIONS.find((known) => pathname.endsWith(known)) ??
    DEFAULT_DOCUMENT_EXTENSION;
  return `documents/${entry.id}${extension}`;
}

/** Generated TypeScript of one generator label, option set and entry. */
export function outputPath(label: string, optionSetId: string, entryId: CorpusEntryId): string {
  return `outputs/${label}/${optionSetId}/${entryId}.ts`;
}

/** Per-run generation results of one generator label. */
export function generationResultsPath(label: string): string {
  return `results/${label}.generation.json`;
}

/** Comparison results of a candidate label against a golden label. */
export function comparisonResultsPath(goldenLabel: string, candidateLabel: string): string {
  return `results/${goldenLabel}__vs__${candidateLabel}.comparison.json`;
}

/** Rendered report files of one comparison. */
export function reportPaths(
  goldenLabel: string,
  candidateLabel: string,
): { markdown: string; json: string } {
  const base = `reports/${goldenLabel}__vs__${candidateLabel}`;
  return { markdown: `${base}.md`, json: `${base}.json` };
}

/** Results of the last `dependents` run. */
export const DEPENDENTS_RESULTS_PATH = "results/dependents.json";

/**
 * Layout of the dependents work directory. It lives outside this repository, because a package
 * manager run inside the openapi-typesafe workspace would treat a checked-out project as part of
 * it.
 */
export const DEPENDENTS_WORK_PATHS = {
  /** Packed openapi-typesafe packages the candidate runs install. */
  packages: "packages",
} as const;

/** Git repository that holds the pinned commits of one project. */
export function dependentRepositoryPath(projectId: string): string {
  return `repositories/${projectId}`;
}

/** Checkout of one project for one run variant (`baseline` or `candidate`). */
export function dependentCheckoutPath(projectId: string, variant: string): string {
  return `checkouts/${projectId}/${variant}`;
}

/** Join forward-slash path segments, dropping empty and `.` segments. */
export function joinPath(...segments: readonly string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .filter((part, index) => part !== "." && (part !== "" || index === 0))
    .join("/");
}
