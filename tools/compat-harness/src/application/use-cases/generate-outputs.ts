import type { CorpusEntry } from "../../domain/corpus-entry.ts";
import { type CorpusShard, selectShard } from "../../domain/corpus-shard.ts";
import { extractErrorExcerpt } from "../../domain/error-excerpt.ts";
import type { GeneratorOptionSet } from "../../domain/option-matrix.ts";
import { type GenerationResult, GenerationStatus } from "../../domain/run-result.ts";
import { encodeJson } from "../codecs.ts";
import { mapWithConcurrency } from "../concurrency.ts";
import {
  documentPath,
  generationResultsPath,
  outputPath,
  SHARD_DESCRIPTOR_PATH,
} from "../layout.ts";
import type { FileStore, GeneratorRunner, GeneratorRunOutcome, Logger } from "../ports.ts";

export interface GenerateOutputsDependencies {
  readonly cache: FileStore;
  readonly runner: GeneratorRunner;
  readonly logger: Logger;
}

export interface GenerateOutputsOptions {
  /** Name of the generator under test, for example "fork-base"; used in output paths. */
  readonly label: string;
  /** The selected corpus; with `shard`, only that shard of it is generated. */
  readonly entries: readonly CorpusEntry[];
  /** Absent: every entry (a local or per-PR run). */
  readonly shard?: CorpusShard;
  readonly optionSets: readonly GeneratorOptionSet[];
  readonly concurrency: number;
  readonly timeoutMs: number;
}

const MISSING_DOCUMENT_EXCERPT = "corpus document is not in the cache; run the fetch command first";

function toStatus(outcome: GeneratorRunOutcome, isOutputWritten: boolean): GenerationStatus {
  if (outcome.isTimedOut) {
    return GenerationStatus.TimedOut;
  }
  return outcome.exitCode === 0 && isOutputWritten ? GenerationStatus.Ok : GenerationStatus.Failed;
}

interface GenerationCase {
  readonly entry: CorpusEntry;
  readonly optionSet: GeneratorOptionSet;
}

async function generateCase(
  dependencies: GenerateOutputsDependencies,
  options: GenerateOutputsOptions,
  { entry, optionSet }: GenerationCase,
): Promise<GenerationResult> {
  const base = { entryId: entry.id, optionSetId: optionSet.id };
  const schema = documentPath(entry);
  if (!(await dependencies.cache.exists(schema))) {
    return {
      ...base,
      status: GenerationStatus.Failed,
      durationMs: 0,
      errorExcerpt: MISSING_DOCUMENT_EXCERPT,
    };
  }
  const output = outputPath(options.label, optionSet.id, entry.id);
  // A stale file from an earlier run must not make a failed run look successful.
  await dependencies.cache.remove(output);
  const outcome = await dependencies.runner.run({
    schemaPath: dependencies.cache.resolve(schema),
    outputPath: dependencies.cache.resolve(output),
    flags: optionSet.flags,
    timeoutMs: options.timeoutMs,
  });
  const status = toStatus(outcome, await dependencies.cache.exists(output));
  const errorExcerpt = status === GenerationStatus.Ok ? "" : extractErrorExcerpt(outcome.stderr);
  return { ...base, status, durationMs: outcome.durationMs, errorExcerpt };
}

/** Record which shard the results directory holds, so `merge` can check that none is missing. */
async function recordShard(cache: FileStore, shard: CorpusShard | undefined): Promise<void> {
  if (shard === undefined) {
    await cache.remove(SHARD_DESCRIPTOR_PATH);
    return;
  }
  await cache.writeText(SHARD_DESCRIPTOR_PATH, encodeJson(shard));
}

/**
 * Run one generator over every entry (of the shard, when given) and option set, store the outputs
 * in the cache, and write the per-case results. A failing or hanging case is a result, not an
 * error: the corpus is expected to contain documents the original generator cannot handle.
 */
export async function generateOutputs(
  dependencies: GenerateOutputsDependencies,
  options: GenerateOutputsOptions,
): Promise<readonly GenerationResult[]> {
  const entries =
    options.shard === undefined ? options.entries : selectShard(options.entries, options.shard);
  const cases = options.optionSets.flatMap((optionSet) =>
    entries.map((entry) => ({ entry, optionSet })),
  );
  const results = await mapWithConcurrency(cases, options.concurrency, async (generationCase) => {
    const result = await generateCase(dependencies, options, generationCase);
    const log = result.status === GenerationStatus.Ok ? "info" : "warn";
    dependencies.logger[log]("generation_finished", { label: options.label, ...result });
    return result;
  });
  await dependencies.cache.writeText(generationResultsPath(options.label), encodeJson(results));
  await recordShard(dependencies.cache, options.shard);
  return results;
}
