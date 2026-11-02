import type { CorpusEntry, CorpusEntryId } from "../../domain/corpus-entry.ts";
import { type CorpusManifest, recordHashes } from "../../domain/manifest.ts";
import { encodeJson } from "../codecs.ts";
import { mapWithConcurrency } from "../concurrency.ts";
import { documentPath, REPOSITORY_PATHS } from "../layout.ts";
import type { FileStore, Hasher, HttpClient, Logger, Sleep } from "../ports.ts";
import { type RetryPolicy, withRetry } from "../retry.ts";

/** Outcome of fetching one corpus entry. */
export const FetchStatus = {
  /** The cached copy matches the recorded hash; nothing was downloaded. */
  Cached: "cached",
  /** Downloaded; the hash was new or matched the recorded one. */
  Downloaded: "downloaded",
  /** Downloaded, but the content no longer matches the recorded hash. */
  HashMismatch: "hash-mismatch",
  /** The download failed after all retries, or returned a non-200 status. */
  Failed: "failed",
} as const;

export type FetchStatus = (typeof FetchStatus)[keyof typeof FetchStatus];

export interface FetchOutcome {
  readonly entryId: CorpusEntryId;
  readonly status: FetchStatus;
  readonly detail: string;
}

export interface FetchCorpusDependencies {
  readonly http: HttpClient;
  readonly repository: FileStore;
  readonly cache: FileStore;
  readonly hasher: Hasher;
  readonly logger: Logger;
  readonly sleep: Sleep;
}

export interface FetchCorpusOptions {
  readonly entries: readonly CorpusEntry[];
  readonly concurrency: number;
  readonly retry: RetryPolicy;
  /**
   * When true, a changed document replaces its recorded hash (used when refreshing the corpus on
   * purpose). When false, a changed document is reported as a mismatch and the cached copy is not
   * replaced.
   */
  readonly isHashUpdateAllowed: boolean;
}

const HTTP_OK = 200;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;

/**
 * Thrown for statuses worth retrying (rate limit, server errors) so the retry loop sees them. Other
 * statuses are returned as values and fail at once, because retrying a 404 cannot help.
 */
class RetryableStatusError extends Error {
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "RetryableStatusError";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_FLOOR;
}

async function download(dependencies: FetchCorpusDependencies, url: string, retry: RetryPolicy) {
  return withRetry(
    async () => {
      const response = await dependencies.http.getText(url);
      if (isRetryableStatus(response.status)) {
        throw new RetryableStatusError(response.status);
      }
      return response;
    },
    retry,
    dependencies.sleep,
  );
}

async function isCacheValid(
  dependencies: FetchCorpusDependencies,
  entry: CorpusEntry,
): Promise<boolean> {
  if (entry.sha256 === null) {
    return false;
  }
  const cached = await dependencies.cache.readText(documentPath(entry));
  return cached !== undefined && dependencies.hasher.sha256(cached) === entry.sha256;
}

async function fetchEntry(
  dependencies: FetchCorpusDependencies,
  entry: CorpusEntry,
  options: FetchCorpusOptions,
): Promise<FetchOutcome & { readonly sha256?: string }> {
  if (await isCacheValid(dependencies, entry)) {
    return { entryId: entry.id, status: FetchStatus.Cached, detail: "" };
  }
  let response: Awaited<ReturnType<typeof download>>;
  try {
    response = await download(dependencies, entry.sourceUrl, options.retry);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { entryId: entry.id, status: FetchStatus.Failed, detail };
  }
  if (response.status !== HTTP_OK) {
    return { entryId: entry.id, status: FetchStatus.Failed, detail: `HTTP ${response.status}` };
  }
  const sha256 = dependencies.hasher.sha256(response.body);
  const isMismatch = entry.sha256 !== null && entry.sha256 !== sha256;
  if (isMismatch && !options.isHashUpdateAllowed) {
    return {
      entryId: entry.id,
      status: FetchStatus.HashMismatch,
      detail: `expected ${entry.sha256}, got ${sha256}`,
    };
  }
  await dependencies.cache.writeText(documentPath(entry), response.body);
  return { entryId: entry.id, status: FetchStatus.Downloaded, detail: "", sha256 };
}

/**
 * Download the selected corpus entries into the cache, verify them against the manifest hashes, and
 * record hashes for entries that had none. Failures are reported per entry; the run itself does not
 * stop.
 */
export async function fetchCorpus(
  dependencies: FetchCorpusDependencies,
  manifest: CorpusManifest,
  options: FetchCorpusOptions,
): Promise<{ readonly manifest: CorpusManifest; readonly outcomes: readonly FetchOutcome[] }> {
  const hashes = new Map<CorpusEntryId, string>();
  const outcomes = await mapWithConcurrency(options.entries, options.concurrency, async (entry) => {
    const { sha256, ...outcome } = await fetchEntry(dependencies, entry, options);
    if (sha256 !== undefined) {
      hashes.set(entry.id, sha256);
    }
    const log =
      outcome.status === FetchStatus.Cached || outcome.status === FetchStatus.Downloaded
        ? "info"
        : "warn";
    dependencies.logger[log]("corpus_entry_fetched", { ...outcome });
    return outcome;
  });
  const updated = recordHashes(manifest, hashes);
  await dependencies.repository.writeText(REPOSITORY_PATHS.manifest, encodeJson(updated));
  return { manifest: updated, outcomes };
}
