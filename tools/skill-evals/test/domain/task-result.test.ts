import { describe, expect, it } from "vitest";
import { PASS_RATE_TARGET, summarizeResults, TaskOutcome } from "../../src/domain/task-result.ts";
import { AUTH, GET_PET, MIGRATE, resultOf } from "../fakes/tasks.ts";

describe("summarizeResults", () => {
  it("summarizes an empty run as a missed target", () => {
    expect(summarizeResults([])).toEqual({
      total: 0,
      passed: 0,
      passRate: 0,
      isTargetMet: false,
      categories: [],
    });
  });

  it("counts passes per category in catalog order", () => {
    const summary = summarizeResults([
      resultOf(MIGRATE, TaskOutcome.TestsFailed),
      resultOf(GET_PET, TaskOutcome.Passed),
      resultOf(AUTH, TaskOutcome.Passed),
    ]);

    expect(summary.passed).toBe(2);
    expect(summary.passRate).toBeCloseTo(2 / 3);
    expect(summary.isTargetMet).toBe(false);
    expect(summary.categories).toEqual([
      { category: "typed-calls", total: 1, passed: 1 },
      { category: "middleware", total: 1, passed: 1 },
      { category: "migration", total: 1, passed: 0 },
    ]);
  });

  it("meets the target at exactly the target rate", () => {
    const passes = Array.from({ length: 9 }, () => resultOf(GET_PET, TaskOutcome.Passed));
    const results = [...passes, resultOf(AUTH, TaskOutcome.AgentFailed)];

    const summary = summarizeResults(results);

    expect(summary.passRate).toBe(PASS_RATE_TARGET);
    expect(summary.isTargetMet).toBe(true);
  });
});
