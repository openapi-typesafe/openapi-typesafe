import { isPassed, type TaskResult } from "./task-result.ts";

/** Why a task cannot measure the skill. */
export const TaskProblem = {
  /** The reference solution fails the checks: the task or its checks are wrong. */
  ReferenceFails: "reference-fails",
  /** The checks pass on the untouched project: they do not test the task. */
  PassesWithoutWork: "passes-without-work",
} as const;
export type TaskProblem = (typeof TaskProblem)[keyof typeof TaskProblem];

export interface TaskValidationProblem {
  readonly taskId: string;
  readonly problem: TaskProblem;
  readonly detail: string;
}

/**
 * A task is valid when its reference solution passes and the untouched project fails. Results
 * are matched by task id, so both lists may come in any order.
 */
export function findTaskProblems(
  referenceResults: readonly TaskResult[],
  untouchedResults: readonly TaskResult[],
): readonly TaskValidationProblem[] {
  const failingReferences = referenceResults
    .filter((result) => !isPassed(result))
    .map((result) => ({
      taskId: result.taskId,
      problem: TaskProblem.ReferenceFails,
      detail: result.detail,
    }));
  const vacuousChecks = untouchedResults.filter(isPassed).map((result) => ({
    taskId: result.taskId,
    problem: TaskProblem.PassesWithoutWork,
    detail: "",
  }));
  return [...failingReferences, ...vacuousChecks];
}
