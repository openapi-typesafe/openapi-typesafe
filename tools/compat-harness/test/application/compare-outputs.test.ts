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
import { CHECKER_LIMIT, FakeOutputCompiler } from "../fakes/fake-output-compiler.ts";
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

  it("compareOutputs with a type checker separates type-identical, added and different", async () => {
    const cache = setUp({
      reordered: { golden: "a", candidate: "b" },
      drifted: { golden: "a", candidate: "c" },
      extended: { golden: "a", candidate: "d" },
    });
    const candidatePath = (id: string) =>
      cache.resolve(outputPath("candidate", "default", id as CorpusEntryId));
    const typeChecker = new FakeTypeIdentityChecker({
      [candidatePath("drifted")]: { changed: ["paths"], added: ["Extra"] },
      [candidatePath("extended")]: { added: ["Extra"] },
    });

    const results = await compareOutputs(
      { cache, logger: new RecordingLogger(), typeChecker },
      OPTIONS,
    );

    expect(results.map((r) => [r.status, r.differentTypeNames])).toEqual([
      [ComparisonStatus.TypeIdentical, []],
      [ComparisonStatus.Different, ["paths"]],
      [ComparisonStatus.TypesAdded, ["Extra"]],
    ]);
    expect(typeChecker.calls).toHaveLength(3);
  });

  it("compareOutputs calls a type change of golden output that does not compile a fix", async () => {
    const cache = setUp({
      fixed: { golden: "a", candidate: "b" },
      worse: { golden: "a", candidate: "c" },
      changed: { golden: "a", candidate: "d" },
    });
    const path = (label: string, id: string) =>
      cache.resolve(outputPath(label, "default", id as CorpusEntryId));
    const typeChecker = new FakeTypeIdentityChecker({
      [path("candidate", "fixed")]: { changed: ["paths"] },
      [path("candidate", "worse")]: { changed: ["paths"] },
      [path("candidate", "changed")]: { changed: ["paths"] },
    });
    const outputCompiler = new FakeOutputCompiler({
      [path("golden", "fixed")]: 3,
      [path("candidate", "fixed")]: 0,
      [path("golden", "worse")]: 1,
      [path("candidate", "worse")]: 2,
    });

    const results = await compareOutputs(
      { cache, logger: new RecordingLogger(), typeChecker, outputCompiler },
      OPTIONS,
    );

    expect(results.map((r) => [r.entryId, r.status])).toEqual([
      ["fixed", ComparisonStatus.GoldenInvalid],
      ["worse", ComparisonStatus.Different],
      ["changed", ComparisonStatus.Different],
    ]);
  });

  it("compareOutputs counts a file TypeScript stops on as worse than any error count", async () => {
    const cache = setUp({
      both: { golden: "a", candidate: "b" },
      ours: { golden: "a", candidate: "c" },
      golden: { golden: "a", candidate: "d" },
    });
    const path = (label: string, id: string) =>
      cache.resolve(outputPath(label, "default", id as CorpusEntryId));
    const typeChecker = new FakeTypeIdentityChecker({}, [
      path("candidate", "both"),
      path("candidate", "ours"),
      path("candidate", "golden"),
    ]);
    const outputCompiler = new FakeOutputCompiler({
      [path("golden", "both")]: CHECKER_LIMIT,
      [path("candidate", "both")]: CHECKER_LIMIT,
      [path("golden", "ours")]: 4,
      [path("candidate", "ours")]: CHECKER_LIMIT,
      [path("golden", "golden")]: CHECKER_LIMIT,
      [path("candidate", "golden")]: 0,
    });
    const logger = new RecordingLogger();

    const results = await compareOutputs({ cache, logger, typeChecker, outputCompiler }, OPTIONS);

    expect(results.map((r) => [r.entryId, r.status, r.differentTypeNames])).toEqual([
      ["both", ComparisonStatus.GoldenInvalid, []],
      ["ours", ComparisonStatus.Different, []],
      ["golden", ComparisonStatus.GoldenInvalid, []],
    ]);
    const limits = logger.records.filter((record) => record.event === "checker_limit");
    expect(limits.map((record) => record.level)).toEqual(Array(7).fill("warn"));
  });

  it("compareOutputs calls a type change a difference when TypeScript stops only on ours", async () => {
    const cache = setUp({ changed: { golden: "a", candidate: "b" } });
    const path = (label: string) =>
      cache.resolve(outputPath(label, "default", "changed" as CorpusEntryId));
    const typeChecker = new FakeTypeIdentityChecker({}, [path("candidate")]);

    const results = await compareOutputs(
      {
        cache,
        logger: new RecordingLogger(),
        typeChecker,
        outputCompiler: new FakeOutputCompiler(),
      },
      OPTIONS,
    );

    expect(results.map((r) => r.status)).toEqual([ComparisonStatus.Different]);
  });

  it("compareOutputs passes on errors other than the checker limit", async () => {
    const cache = setUp({ changed: { golden: "a", candidate: "b" } });
    const typeChecker = {
      findDifferentTypes: async () => {
        throw new Error("broken");
      },
    };

    const run = compareOutputs({ cache, logger: new RecordingLogger(), typeChecker }, OPTIONS);

    await expect(run).rejects.toThrow("broken");
  });

  it("compareOutputs rewrites the golden text with the intentional differences", async () => {
    const cache = setUp({
      fixed: { golden: "a\nx", candidate: "a\ny" },
      untouched: { golden: "a", candidate: "a" },
    });
    const fix = {
      id: "fix",
      issues: ["o/r#1"],
      description: "x to y",
      golden: /^x$/gm,
      candidate: "y",
    };

    const results = await compareOutputs(
      { cache, logger: new RecordingLogger(), intentionalDifferences: [fix] },
      OPTIONS,
    );

    expect(results.map((r) => [r.entryId, r.status, r.intentionalDifferenceIds])).toEqual([
      ["fixed", ComparisonStatus.Identical, ["fix"]],
      ["untouched", ComparisonStatus.Identical, []],
    ]);
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
