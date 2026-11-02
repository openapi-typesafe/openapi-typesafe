import type { EvalTask } from "../domain/eval-task.ts";
import {
  TaskOutcome as Outcome,
  type TaskOutcome,
  type TaskResult,
} from "../domain/task-result.ts";
import type { Clock, CodingAgent, Logger, ProjectChecks, Workspaces } from "./ports.ts";
import { buildPrompt } from "./prompt.ts";

export interface EvaluationDependencies {
  readonly workspaces: Workspaces;
  readonly agent: CodingAgent;
  readonly checks: ProjectChecks;
  readonly logger: Logger;
  readonly clock: Clock;
}

export interface EvaluationOptions {
  /** Names the run in every log record, so two runs in one log stay apart. */
  readonly runLabel: string;
  readonly concurrency: number;
  /** Keep the workspaces for inspection instead of deleting them. */
  readonly isKeepingWorkspaces: boolean;
}

/** Tool output kept in the log: enough for the first errors, bounded for large failures. */
const MAX_LOGGED_OUTPUT_LENGTH = 4_000;

interface StepResult {
  readonly outcome: TaskOutcome;
  readonly detail: string;
}

/** Run one task: fresh workspace, agent, then the hidden checks. The workspace is always removed. */
export async function evaluateTask(
  dependencies: EvaluationDependencies,
  options: EvaluationOptions,
  task: EvalTask,
): Promise<TaskResult> {
  const { clock, logger, workspaces } = dependencies;
  const startedAt = clock.now().getTime();
  const directory = await workspaces.create(task);
  logger.info("task_started", { run: options.runLabel, task: task.id, directory });
  try {
    const { outcome, detail } = await solveAndCheck(dependencies, options, task, directory);
    const durationMs = clock.now().getTime() - startedAt;
    const fields = { run: options.runLabel, task: task.id, outcome, durationMs };
    if (outcome === Outcome.Passed) {
      logger.info("task_finished", fields);
    } else {
      logger.error("task_finished", fields);
    }
    return { taskId: task.id, category: task.category, outcome, durationMs, detail };
  } finally {
    if (!options.isKeepingWorkspaces) {
      await workspaces.remove(directory);
    }
  }
}

async function solveAndCheck(
  { agent, checks, logger, workspaces }: EvaluationDependencies,
  options: EvaluationOptions,
  task: EvalTask,
  directory: string,
): Promise<StepResult> {
  const logStep = (step: string, isPassed: boolean, output: string): void => {
    const fields = { run: options.runLabel, task: task.id, step, isPassed };
    if (isPassed) {
      logger.info("step_finished", fields);
    } else {
      logger.error("step_finished", { ...fields, output: output.slice(-MAX_LOGGED_OUTPUT_LENGTH) });
    }
  };
  const solved = await agent.solve({ task, directory, prompt: buildPrompt(task) });
  logStep("agent", solved.isCompleted, solved.output);
  if (!solved.isCompleted) {
    return { outcome: Outcome.AgentFailed, detail: solved.output };
  }
  await workspaces.addChecks(task, directory);
  const typecheck = await checks.typecheck(directory);
  logStep("typecheck", typecheck.isPassed, typecheck.output);
  if (!typecheck.isPassed) {
    return { outcome: Outcome.TypecheckFailed, detail: typecheck.output };
  }
  const tests = await checks.test(directory);
  logStep("tests", tests.isPassed, tests.output);
  return tests.isPassed
    ? { outcome: Outcome.Passed, detail: "" }
    : { outcome: Outcome.TestsFailed, detail: tests.output };
}
