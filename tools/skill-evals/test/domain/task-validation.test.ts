import { describe, expect, it } from "vitest";
import { TaskOutcome } from "../../src/domain/task-result.ts";
import { findTaskProblems, TaskProblem } from "../../src/domain/task-validation.ts";
import { AUTH, GET_PET, resultOf } from "../fakes/tasks.ts";

describe("findTaskProblems", () => {
  it("finds nothing when references pass and untouched projects fail", () => {
    const reference = [resultOf(GET_PET, TaskOutcome.Passed)];
    const untouched = [resultOf(GET_PET, TaskOutcome.TypecheckFailed)];

    expect(findTaskProblems(reference, untouched)).toEqual([]);
  });

  it("reports a failing reference with its output and a check that passes without work", () => {
    const reference = [
      { ...resultOf(GET_PET, TaskOutcome.TestsFailed), detail: "expected Rex" },
      resultOf(AUTH, TaskOutcome.Passed),
    ];
    const untouched = [
      resultOf(GET_PET, TaskOutcome.TypecheckFailed),
      resultOf(AUTH, TaskOutcome.Passed),
    ];

    expect(findTaskProblems(reference, untouched)).toEqual([
      { taskId: GET_PET.id, problem: TaskProblem.ReferenceFails, detail: "expected Rex" },
      { taskId: AUTH.id, problem: TaskProblem.PassesWithoutWork, detail: "" },
    ]);
  });
});
