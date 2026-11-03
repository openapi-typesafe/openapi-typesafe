import { describe, expect, it } from "vitest";
import { encodeJson } from "../../src/application/codecs.ts";
import {
  generationResultsPath,
  optInResultsPath,
  outputPath,
} from "../../src/application/layout.ts";
import { checkOptInOutputs } from "../../src/application/use-cases/check-opt-in-outputs.ts";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { OptInCheckStatus } from "../../src/domain/opt-in-check.ts";
import type { OptInOptionSet } from "../../src/domain/option-matrix.ts";
import { type GenerationResult, GenerationStatus } from "../../src/domain/run-result.ts";
import { FakeOutputCompiler } from "../fakes/fake-output-compiler.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const LABEL = "current-opt-in";
const OPT_IN: OptInOptionSet = {
  id: "blob",
  flags: ["--binary-as-blob"],
  baselineOptionSetId: "default",
};

/** One run: its output text, or `undefined` for a failed run. */
type Run = string | undefined;

function storeRun(cache: InMemoryFileStore, optionSetId: string, entryId: string, run: Run) {
  const id = entryId as CorpusEntryId;
  if (run !== undefined) {
    cache.files.set(outputPath(LABEL, optionSetId, id), run);
  }
  const status = run === undefined ? GenerationStatus.Failed : GenerationStatus.Ok;
  return { entryId: id, optionSetId, status, durationMs: 1, errorExcerpt: "" };
}

function setUp(cases: Record<string, { baseline: Run; optIn: Run }>): InMemoryFileStore {
  const cache = new InMemoryFileStore();
  const results: GenerationResult[] = Object.entries(cases).flatMap(([entryId, runs]) => [
    storeRun(cache, "default", entryId, runs.baseline),
    storeRun(cache, OPT_IN.id, entryId, runs.optIn),
  ]);
  cache.files.set(generationResultsPath(LABEL), encodeJson(results));
  return cache;
}

function compilerFor(cache: InMemoryFileStore, errors: Record<string, number>) {
  const byPath = Object.fromEntries(
    Object.entries(errors).map(([key, count]) => {
      const [optionSetId = "", entryId = ""] = key.split("/");
      return [cache.resolve(outputPath(LABEL, optionSetId, entryId as CorpusEntryId)), count];
    }),
  );
  return new FakeOutputCompiler(byPath);
}

describe("checkOptInOutputs", () => {
  it("checkOptInOutputs classifies each opt-in case against its baseline", async () => {
    const cache = setUp({
      same: { baseline: "a", optIn: "a" },
      clean: { baseline: "a", optIn: "Blob" },
      oldErrors: { baseline: "a", optIn: "Blob" },
      newErrors: { baseline: "a", optIn: "Blob" },
      optInFails: { baseline: "a", optIn: undefined },
      bothFail: { baseline: undefined, optIn: undefined },
    });
    const compiler = compilerFor(cache, {
      "blob/oldErrors": 2,
      "default/oldErrors": 2,
      "blob/newErrors": 3,
      "default/newErrors": 1,
    });
    const logger = new RecordingLogger();

    const checks = await checkOptInOutputs(
      { cache, logger, outputCompiler: compiler },
      { label: LABEL, optionSets: [OPT_IN], concurrency: 2 },
    );

    expect(checks.map((c) => [c.entryId, c.status, c.errorCount, c.baselineErrorCount])).toEqual([
      ["same", OptInCheckStatus.Unchanged, null, null],
      ["clean", OptInCheckStatus.Compiles, 0, null],
      ["oldErrors", OptInCheckStatus.NoNewErrors, 2, 2],
      ["newErrors", OptInCheckStatus.MoreErrors, 3, 1],
      ["optInFails", OptInCheckStatus.CandidateFailed, null, null],
      ["bothFail", OptInCheckStatus.BaselineFailed, null, null],
    ]);
    expect(cache.files.get(optInResultsPath(LABEL))).toBe(encodeJson(checks));
    expect(logger.records.filter((entry) => entry.level === "warn")).toHaveLength(2);
  });

  it("checkOptInOutputs without the baseline case fails and names the option sets to generate", async () => {
    const cache = new InMemoryFileStore();
    cache.files.set(
      generationResultsPath(LABEL),
      encodeJson([storeRun(cache, OPT_IN.id, "lonely", "Blob")]),
    );

    await expect(
      checkOptInOutputs(
        { cache, logger: new RecordingLogger(), outputCompiler: new FakeOutputCompiler() },
        { label: LABEL, optionSets: [OPT_IN], concurrency: 1 },
      ),
    ).rejects.toMatchObject({
      code: HarnessErrorCode.StoredFileInvalid,
      message: expect.stringContaining("--option-sets opt-in"),
    });
  });
});
