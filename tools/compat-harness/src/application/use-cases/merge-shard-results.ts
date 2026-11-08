import { type CorpusShard, mergeShardCases, type ShardCase } from "../../domain/corpus-shard.ts";
import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import { compareOrdinal } from "../../domain/ordering.ts";
import {
  decodeComparisonResults,
  decodeGenerationResults,
  decodeOptInResults,
  decodeShardDescriptor,
  encodeJson,
} from "../codecs.ts";
import {
  joinPath,
  RESULT_FILE_SUFFIXES,
  RESULTS_DIRECTORY,
  SHARD_DESCRIPTOR_FILE,
  SHARD_DESCRIPTOR_PATH,
} from "../layout.ts";
import type { DirectoryLister, FileStore, Logger } from "../ports.ts";

export interface MergeShardResultsDependencies {
  /** The directory with one subdirectory per shard, each a copy of a shard's results directory. */
  readonly shards: FileStore;
  /** Lists the same directory as `shards`. */
  readonly shardLister: DirectoryLister;
  /** The harness cache; the merged files go to its results directory. */
  readonly cache: FileStore;
  readonly logger: Logger;
}

export interface MergedFile {
  readonly name: string;
  readonly caseCount: number;
}

export interface MergeSummary {
  readonly shardCount: number;
  readonly files: readonly MergedFile[];
}

type CaseDecoder = (text: string) => readonly ShardCase[];

/** One decoder per kind of result file; a file of another kind cannot be merged. */
const DECODERS: readonly (readonly [suffix: string, decode: CaseDecoder])[] = [
  [RESULT_FILE_SUFFIXES.generation, decodeGenerationResults],
  [RESULT_FILE_SUFFIXES.comparison, decodeComparisonResults],
  [RESULT_FILE_SUFFIXES.optIn, decodeOptInResults],
];

function invalid(message: string): HarnessError {
  return new HarnessError(HarnessErrorCode.ShardsInvalid, message);
}

function decoderFor(name: string): CaseDecoder {
  const decoder = DECODERS.find(([suffix]) => name.endsWith(suffix));
  if (decoder === undefined) {
    throw invalid(`Cannot merge ${name}: not a generation, comparison or opt-in result file`);
  }
  return decoder[1];
}

async function readRequired(store: FileStore, path: string): Promise<string> {
  const text = await store.readText(path);
  if (text === undefined) {
    throw invalid(`Missing ${store.resolve(path)}`);
  }
  return text;
}

interface ShardDirectory {
  readonly directory: string;
  readonly shard: CorpusShard;
}

/** Every shard of one split exactly once, ordered by index. */
async function readShardDirectories(
  dependencies: MergeShardResultsDependencies,
): Promise<ShardDirectory[]> {
  const { shards } = dependencies;
  const directories = await dependencies.shardLister.listDirectories("");
  if (directories.length === 0) {
    throw invalid(`No shard directories in ${shards.resolve("")}`);
  }
  const read = await Promise.all(
    directories.map(async (directory) => {
      const text = await readRequired(shards, joinPath(directory, SHARD_DESCRIPTOR_FILE));
      return { directory, shard: decodeShardDescriptor(text) };
    }),
  );
  const sorted = read.sort((left, right) => left.shard.index - right.shard.index);
  const isComplete = sorted.every(
    ({ shard }, position) => shard.index === position + 1 && shard.count === sorted.length,
  );
  if (!isComplete) {
    const found = sorted.map(
      ({ directory, shard }) => `${directory}=${shard.index}/${shard.count}`,
    );
    throw invalid(`The directories are not shards 1 to N of one split: ${found.join(", ")}`);
  }
  return sorted;
}

/** The result file names, which every shard must have: all shards run the same commands. */
async function readFileNames(
  lister: DirectoryLister,
  directories: readonly ShardDirectory[],
): Promise<string[]> {
  const listed = await Promise.all(
    directories.map(async ({ directory }) => ({
      directory,
      names: (await lister.listFiles(directory)).filter((name) => name !== SHARD_DESCRIPTOR_FILE),
    })),
  );
  const names = [...new Set(listed.flatMap((shard) => shard.names))].sort(compareOrdinal);
  for (const { directory, names: shardNames } of listed) {
    const missing = names.filter((name) => !shardNames.includes(name));
    if (missing.length > 0) {
      throw invalid(`Shard ${directory} has no ${missing.join(", ")}`);
    }
  }
  return names;
}

async function mergeFile(
  dependencies: MergeShardResultsDependencies,
  directories: readonly ShardDirectory[],
  name: string,
): Promise<MergedFile> {
  const decode = decoderFor(name);
  const shardCases = await Promise.all(
    directories.map(async ({ directory }) =>
      decode(await readRequired(dependencies.shards, joinPath(directory, name))),
    ),
  );
  const merged = mergeShardCases(shardCases);
  await dependencies.cache.writeText(joinPath(RESULTS_DIRECTORY, name), encodeJson(merged));
  return { name, caseCount: merged.length };
}

/**
 * Merge the result files of every shard of a sharded full run (ADR-038) into the cache, as if one
 * job had run them all, so that `gate` and `report` work unchanged. Fails with SHARDS_INVALID when
 * a shard is missing, twice, from another split, or lacks a file the others have.
 */
export async function mergeShardResults(
  dependencies: MergeShardResultsDependencies,
): Promise<MergeSummary> {
  const directories = await readShardDirectories(dependencies);
  const names = await readFileNames(dependencies.shardLister, directories);
  const files: MergedFile[] = [];
  for (const name of names) {
    files.push(await mergeFile(dependencies, directories, name));
  }
  // The merged results are the whole selection, not one shard.
  await dependencies.cache.remove(SHARD_DESCRIPTOR_PATH);
  for (const file of files) {
    dependencies.logger.info("shard_results_merged", { ...file, shardCount: directories.length });
  }
  return { shardCount: directories.length, files };
}
