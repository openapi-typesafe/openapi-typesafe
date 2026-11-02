import { describe, expect, it } from "vitest";
import {
  classifyDependent,
  comparedGeneratedFile,
  type DependentResult,
  DependentStatus,
  GeneratedFileStatus,
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

describe("classifyDependent", () => {
  it("classifyDependent with every step passing in both runs is passed", () => {
    expect(classifyDependent(PASSED, PASSED)).toEqual({
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

    expect(classifyDependent(PASSED, candidate)).toEqual({
      status: DependentStatus.Regressed,
      failedStep: "typecheck",
    });
  });

  it("classifyDependent with a baseline failure cannot judge the candidate", () => {
    const baseline = [step("install", StepStatus.Failed), step("test", StepStatus.NotRun)];

    expect(classifyDependent(baseline, [])).toEqual({
      status: DependentStatus.BaselineFailed,
      failedStep: "install",
    });
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
    ]);

    expect(summary).toEqual({
      total: 4,
      passed: 2,
      regressed: 1,
      baselineFailed: 1,
      generatedFiles: 4,
      identicalGeneratedFiles: 2,
    });
  });
});
