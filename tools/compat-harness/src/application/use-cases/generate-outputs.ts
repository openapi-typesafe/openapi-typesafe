import type { CorpusEntry } from "../../domain/corpus-entry.ts";
import type { GeneratorOptionSet } from "../../domain/option-matrix.ts";
import { type GenerationResult, GenerationStatus } from "../../domain/run-result.ts";
import { encodeJson } from "../codecs.ts";
import { mapWithConcurrency } from "../concurrency.ts";
import { documentPath, generationResultsPath, outputPath } from "../layout.ts";
import type { FileStore, GeneratorRunner, GeneratorRunOutcome, Logger } from "../ports.ts";

export interface GenerateOutputsDependencies {
  readonly cache: FileStore;
  readonly runner: GeneratorRunner;
  readonly logger: Logger;
}

export interface GenerateOutputsOptions {
  /** Name of the generator under test, for example "fork-base"; used in output paths. */
  readonly label: string;
  readonly entries: readonly CorpusEntry[];
  readonly optionSets: readonly GeneratorOptionSet[];
  readonly concurrency: number;
  readonly timeoutMs: number;
}

/**
 * Keep reports readable: the first lines of stderr carry the error, the rest is usually a stack
 * trace.
 */
const ERROR_EXCERPT_LINE_COUNT = 5;
const MISSING_DOCUMENT_EXCERPT = "corpus document is not in the cache; run the fetch command first";

function toErrorExcerpt(stderr: string): string {
  return stderr.trim().split("\n").slice(0, ERROR_EXCERPT_LINE_COUNT).join("\n");
}

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
  const errorExcerpt = status === GenerationStatus.Ok ? "" : toErrorExcerpt(outcome.stderr);
  return { ...base, status, durationMs: outcome.durationMs, errorExcerpt };
}

/**
 * Run one generator over every entry and option set, store the outputs in the cache, and write the
 * per-case results. A failing or hanging case is a result, not an error: the corpus is expected to
 * contain documents the original generator cannot handle.
 */
export async function generateOutputs(
  dependencies: GenerateOutputsDependencies,
  options: GenerateOutputsOptions,
): Promise<readonly GenerationResult[]> {
  const cases = options.optionSets.flatMap((optionSet) =>
    options.entries.map((entry) => ({ entry, optionSet })),
  );
  const results = await mapWithConcurrency(cases, options.concurrency, async (generationCase) => {
    const result = await generateCase(dependencies, options, generationCase);
    const log = result.status === GenerationStatus.Ok ? "info" : "warn";
    dependencies.logger[log]("generation_finished", { label: options.label, ...result });
    return result;
  });
  await dependencies.cache.writeText(generationResultsPath(options.label), encodeJson(results));
  return results;
}
