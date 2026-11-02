import { TASK_CATEGORIES, type TaskCategory } from "./eval-task.ts";

/** How a task ended. Every outcome but `passed` names the first step that failed. */
export const TaskOutcome = {
  Passed: "passed",
  AgentFailed: "agent-failed",
  TypecheckFailed: "typecheck-failed",
  TestsFailed: "tests-failed",
} as const;
export type TaskOutcome = (typeof TaskOutcome)[keyof typeof TaskOutcome];

export interface TaskResult {
  readonly taskId: string;
  readonly category: TaskCategory;
  readonly outcome: TaskOutcome;
  readonly durationMs: number;
  /** Output of the step that failed; empty when the task passed. */
  readonly detail: string;
}

/** ENGINEERING_PLAN 10.4: the skill passes when at least 90% of the tasks pass. */
export const PASS_RATE_TARGET = 0.9;

export interface CategorySummary {
  readonly category: TaskCategory;
  readonly total: number;
  readonly passed: number;
}

export interface EvalSummary {
  readonly total: number;
  readonly passed: number;
  /** Passed divided by total; 0 for an empty run. */
  readonly passRate: number;
  readonly isTargetMet: boolean;
  /** Only the categories that have tasks, in catalog order. */
  readonly categories: readonly CategorySummary[];
}

export function isPassed(result: TaskResult): boolean {
  return result.outcome === TaskOutcome.Passed;
}

export function summarizeResults(results: readonly TaskResult[]): EvalSummary {
  const passed = results.filter(isPassed).length;
  const passRate = results.length === 0 ? 0 : passed / results.length;
  const categories = TASK_CATEGORIES.flatMap((category) => {
    const inCategory = results.filter((result) => result.category === category);
    return inCategory.length === 0
      ? []
      : [{ category, total: inCategory.length, passed: inCategory.filter(isPassed).length }];
  });
  return {
    total: results.length,
    passed,
    passRate,
    isTargetMet: results.length > 0 && passRate >= PASS_RATE_TARGET,
    categories,
  };
}
