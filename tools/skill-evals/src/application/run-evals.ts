import type { EvalTask } from "../domain/eval-task.ts";
import { summarizeResults, type TaskResult } from "../domain/task-result.ts";
import { findTaskProblems, type TaskValidationProblem } from "../domain/task-validation.ts";
import { mapWithConcurrency } from "./concurrency.ts";
import {
  type EvaluationDependencies,
  type EvaluationOptions,
  evaluateTask,
} from "./evaluate-task.ts";
import type { CodingAgent } from "./ports.ts";

/** Run every task with the agent of `dependencies` and log the summary. */
export async function runEvals(
  dependencies: EvaluationDependencies,
  options: EvaluationOptions,
  tasks: readonly EvalTask[],
): Promise<readonly TaskResult[]> {
  const { logger } = dependencies;
  logger.info("run_started", { run: options.runLabel, tasks: tasks.length });
  const results = await mapWithConcurrency(tasks, options.concurrency, (task) =>
    evaluateTask(dependencies, options, task),
  );
  const summary = summarizeResults(results);
  logger.info("run_finished", {
    run: options.runLabel,
    total: summary.total,
    passed: summary.passed,
    passRate: summary.passRate,
    isTargetMet: summary.isTargetMet,
  });
  return results;
}

export interface ValidationAgents {
  /** Copies each task's reference solution: every task must pass with it. */
  readonly reference: CodingAgent;
  /** Changes nothing: every task must fail with it. */
  readonly untouched: CodingAgent;
}

/** Check that the tasks themselves are sound, without a coding agent (see `findTaskProblems`). */
export async function validateTasks(
  dependencies: Omit<EvaluationDependencies, "agent">,
  agents: ValidationAgents,
  options: Omit<EvaluationOptions, "runLabel">,
  tasks: readonly EvalTask[],
): Promise<readonly TaskValidationProblem[]> {
  const reference = await runEvals(
    { ...dependencies, agent: agents.reference },
    { ...options, runLabel: "reference" },
    tasks,
  );
  const untouched = await runEvals(
    { ...dependencies, agent: agents.untouched },
    { ...options, runLabel: "untouched" },
    tasks,
  );
  const problems = findTaskProblems(reference, untouched);
  for (const problem of problems) {
    dependencies.logger.error("task_invalid", { task: problem.taskId, problem: problem.problem });
  }
  return problems;
}
