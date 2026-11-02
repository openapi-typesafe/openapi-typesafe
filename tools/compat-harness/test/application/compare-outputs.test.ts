import { describe, expect, it } from "vitest";
import { decodeComparisonResults, encodeJson } from "../../src/application/codecs.ts";
import {
  comparisonResultsPath,
  generationResultsPath,
  outputPath,
} from "../../src/application/layout.ts";
import { compareOutputs } from "../../src/application/use-cases/compare-outputs.ts";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import {
  ComparisonStatus,
  type GenerationResult,
  GenerationStatus,
} from "../../src/domain/run-result.ts";
import { FakeTypeIdentityChecker } from "../fakes/fake-type-identity-checker.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const OPTIONS = { goldenLabel: "golden", candidateLabel: "candidate", concurrency: 2 };

function result(entryId: string, status: GenerationStatus): GenerationResult {
  return {
    entryId: entryId as CorpusEntryId,
    optionSetId: "default",
    status,
    durationMs: 1,
    errorExcerpt: "",
  };
}

/** Store results and outputs; an output text of `undefined` means the case did not succeed. */
function setUp(cases: Record<string, { golden?: string; candidate?: string | null }>) {
  const cache = new InMemoryFileStore();
  const golden: GenerationResult[] = [];
  const candidate: GenerationResult[] = [];
  for (const [entryId, texts] of Object.entries(cases)) {
    golden.push(
      result(entryId, texts.golden === undefined ? GenerationStatus.Failed : GenerationStatus.Ok),
    );
    if (texts.golden !== undefined) {
      cache.files.set(outputPath("golden", "default", entryId as CorpusEntryId), texts.golden);
    }
    if (texts.candidate === null) {
      continue;
    }
    candidate.push(
      result(
        entryId,
        texts.candidate === undefined ? GenerationStatus.Failed : GenerationStatus.Ok,
      ),
    );
    if (texts.candidate !== undefined) {
      cache.files.set(
        outputPath("candidate", "default", entryId as CorpusEntryId),
        texts.candidate,
      );
    }
  }
  cache.files.set(generationResultsPath("golden"), encodeJson(golden));
  cache.files.set(generationResultsPath("candidate"), encodeJson(candidate));
  return cache;
}

describe("compareOutputs", () => {
  it("compareOutputs classifies identical, different and failed cases", async () => {
    const cache = setUp({
      same: { golden: "a\nb", candidate: "a\r\nb" },
      changed: { golden: "a\nb", candidate: "a\nc" },
      goldenFails: { candidate: "a" },
      candidateFails: { golden: "a" },
      candidateMissing: { golden: "a", candidate: null },
    });

    const results = await compareOutputs({ cache, logger: new RecordingLogger() }, OPTIONS);

    expect(results.map((r) => [r.entryId, r.status, r.firstDifferentLine])).toEqual([
      ["same", ComparisonStatus.Identical, null],
      ["changed", ComparisonStatus.Different, 2],
      ["goldenFails", ComparisonStatus.GoldenFailed, null],
      ["candidateFails", ComparisonStatus.CandidateFailed, null],
      ["candidateMissing", ComparisonStatus.CandidateFailed, null],
    ]);
    const written = cache.files.get(comparisonResultsPath("golden", "candidate")) ?? "";
    expect(decodeComparisonResults(written)).toEqual(results);
  });

  it("compareOutputs with a type checker separates type-identical from different", async () => {
    const cache = setUp({
      reordered: { golden: "a", candidate: "b" },
      drifted: { golden: "a", candidate: "c" },
    });
    const driftedPath = cache.resolve(
      outputPath("candidate", "default", "drifted" as CorpusEntryId),
    );
    const typeChecker = new FakeTypeIdentityChecker({ [driftedPath]: ["paths"] });

    const results = await compareOutputs(
      { cache, logger: new RecordingLogger(), typeChecker },
      OPTIONS,
    );

    expect(results.map((r) => [r.status, r.differentTypeNames])).toEqual([
      [ComparisonStatus.TypeIdentical, []],
      [ComparisonStatus.Different, ["paths"]],
    ]);
    expect(typeChecker.calls).toHaveLength(2);
  });

  it("compareOutputs does not run the type checker on identical text", async () => {
    const cache = setUp({ same: { golden: "a", candidate: "a" } });
    const typeChecker = new FakeTypeIdentityChecker();

    await compareOutputs({ cache, logger: new RecordingLogger(), typeChecker }, OPTIONS);

    expect(typeChecker.calls).toEqual([]);
  });

  it("compareOutputs without generation results throws STORED_FILE_INVALID", async () => {
    const run = compareOutputs(
      { cache: new InMemoryFileStore(), logger: new RecordingLogger() },
      OPTIONS,
    );

    await expect(run).rejects.toMatchObject({ code: HarnessErrorCode.StoredFileInvalid });
  });

  it("compareOutputs with an ok result but no output file throws STORED_FILE_INVALID", async () => {
    const cache = setUp({ lost: { golden: "a", candidate: "a" } });
    cache.files.delete(outputPath("candidate", "default", "lost" as CorpusEntryId));

    const run = compareOutputs({ cache, logger: new RecordingLogger() }, OPTIONS);

    await expect(run).rejects.toThrow(/Output recorded as ok is missing/);
  });
});
