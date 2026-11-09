import { describe, expect, it } from "vitest";
import {
  classifyDependent,
  comparedGeneratedFile,
  type DependentResult,
  DependentStatus,
  GeneratedFileStatus,
  isAcceptedStatus,
  missingGeneratedFile,
  type StepResult,
  StepStatus,
  summarizeDependents,
} from "../../src/domain/dependent-result.ts";

const step = (name: string, status: StepStatus): StepResult => ({
  name,
  status,
  durationMs: 1,
  outputExcerpt: "",
});

const PASSED = [step("install", StepStatus.Passed), step("test", StepStatus.Passed)];
const FAILED_TEST = [step("install", StepStatus.Passed), step("test", StepStatus.Failed)];
const EXPECTED_TEST_FAILURE = { step: "test", reason: "a documented breaking change" };

describe("classifyDependent", () => {
  it("classifyDependent with every step passing in both runs is passed", () => {
    expect(classifyDependent(PASSED, PASSED, null)).toEqual({
      status: DependentStatus.Passed,
      failedStep: null,
    });
  });

  it("classifyDependent with a candidate failure is regressed at the first unpassed step", () => {
    const candidate = [
      step("install", StepStatus.Passed),
      step("typecheck", StepStatus.TimedOut),
      step("test", StepStatus.NotRun),
    ];

    expect(classifyDependent(PASSED, candidate, null)).toEqual({
      status: DependentStatus.Regressed,
      failedStep: "typecheck",
    });
  });

  it("classifyDependent with a baseline failure cannot judge the candidate", () => {
    const baseline = [step("install", StepStatus.Failed), step("test", StepStatus.NotRun)];

    expect(classifyDependent(baseline, [], EXPECTED_TEST_FAILURE)).toEqual({
      status: DependentStatus.BaselineFailed,
      failedStep: "install",
    });
  });
});

describe("classifyDependent with an expected failure", () => {
  it("classifyDependent with a failure at the expected step is an expected failure", () => {
    expect(classifyDependent(PASSED, FAILED_TEST, EXPECTED_TEST_FAILURE)).toEqual({
      status: DependentStatus.ExpectedFailure,
      failedStep: "test",
    });
  });

  it("classifyDependent with a failure at another step is regressed", () => {
    const candidate = [step("install", StepStatus.Failed), step("test", StepStatus.NotRun)];

    expect(classifyDependent(PASSED, candidate, EXPECTED_TEST_FAILURE)).toEqual({
      status: DependentStatus.Regressed,
      failedStep: "install",
    });
  });

  it("classifyDependent that no longer fails as expected is a stale expectation", () => {
    expect(classifyDependent(PASSED, PASSED, EXPECTED_TEST_FAILURE)).toEqual({
      status: DependentStatus.StaleExpectation,
      failedStep: null,
    });
  });

  it("isAcceptedStatus accepts only a pass and an expected failure", () => {
    const accepted = Object.values(DependentStatus).filter(isAcceptedStatus);

    expect(accepted).toEqual([DependentStatus.Passed, DependentStatus.ExpectedFailure]);
  });
});

describe("generated file comparisons", () => {
  it("comparedGeneratedFile maps a text comparison to identical or different", () => {
    const identical = comparedGeneratedFile("a.ts", {
      isIdentical: true,
      firstDifferentLine: null,
      differentLineCount: 0,
      intentionalDifferenceIds: ["fix"],
    });
    const different = comparedGeneratedFile("b.ts", {
      isIdentical: false,
      firstDifferentLine: 3,
      differentLineCount: 2,
      intentionalDifferenceIds: [],
    });

    expect(identical).toMatchObject({ status: GeneratedFileStatus.Identical, path: "a.ts" });
    expect(identical.intentionalDifferenceIds).toEqual(["fix"]);
    expect(different).toMatchObject({
      status: GeneratedFileStatus.Different,
      firstDifferentLine: 3,
      differentLineCount: 2,
    });
  });

  it("missingGeneratedFile has no line information", () => {
    expect(missingGeneratedFile("c.ts")).toEqual({
      path: "c.ts",
      status: GeneratedFileStatus.Missing,
      firstDifferentLine: null,
      differentLineCount: 0,
      intentionalDifferenceIds: [],
    });
  });
});

describe("summarizeDependents", () => {
  it("summarizeDependents counts statuses and identical generated files", () => {
    const result = (status: DependentStatus, files: GeneratedFileStatus[]): DependentResult => ({
      projectId: status,
      repository: "https://github.com/o/r",
      commit: "c",
      status,
      failedStep: null,
      expectedFailure: null,
      baseline: [],
      candidate: [],
      generatedFiles: files.map((fileStatus, index) => ({
        ...missingGeneratedFile(`${index}.ts`),
        status: fileStatus,
      })),
    });

    const summary = summarizeDependents([
      result(DependentStatus.Passed, [
        GeneratedFileStatus.Identical,
        GeneratedFileStatus.Different,
      ]),
      result(DependentStatus.Regressed, [GeneratedFileStatus.Missing]),
      result(DependentStatus.BaselineFailed, []),
      result(DependentStatus.Passed, [GeneratedFileStatus.Identical]),
      result(DependentStatus.ExpectedFailure, []),
      result(DependentStatus.StaleExpectation, []),
    ]);

    expect(summary).toEqual({
      total: 6,
      passed: 2,
      expectedFailures: 1,
      regressed: 1,
      staleExpectations: 1,
      baselineFailed: 1,
      generatedFiles: 4,
      identicalGeneratedFiles: 2,
    });
  });
});
