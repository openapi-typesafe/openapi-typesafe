import type { EvalSummary, TaskResult } from "../domain/task-result.ts";
import type { TaskValidationProblem } from "../domain/task-validation.ts";

const TASK_COLUMN_WIDTH = 32;
const PERCENT = 100;
const MILLISECONDS_PER_SECOND = 1_000;

function percent(rate: number): string {
  return `${(rate * PERCENT).toFixed(1)}%`;
}

/** One line per task, then the pass rate per category and in total. */
export function formatEvalReport(results: readonly TaskResult[], summary: EvalSummary): string {
  const lines = results.map((result) => {
    const seconds = Math.round(result.durationMs / MILLISECONDS_PER_SECOND);
    return `${result.taskId.padEnd(TASK_COLUMN_WIDTH)} ${result.outcome} (${seconds} s)`;
  });
  const categories = summary.categories.map(
    (category) => `  ${category.category}: ${category.passed}/${category.total}`,
  );
  const verdict = summary.isTargetMet ? "target met" : "TARGET MISSED";
  const total = `Passed ${summary.passed}/${summary.total} (${percent(summary.passRate)}), ${verdict}`;
  return [...lines, "", ...categories, total, ""].join("\n");
}

/** Every invalid task with the reason, or a single line when all tasks are sound. */
export function formatValidationReport(
  taskCount: number,
  problems: readonly TaskValidationProblem[],
): string {
  if (problems.length === 0) {
    return `All ${taskCount} tasks are valid.\n`;
  }
  const lines = problems.map((problem) =>
    [`${problem.taskId}: ${problem.problem}`, problem.detail].filter(Boolean).join("\n"),
  );
  return `${lines.join("\n\n")}\n\n${problems.length} problem(s) in ${taskCount} tasks.\n`;
}
