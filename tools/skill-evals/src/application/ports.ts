/**
 * Ports: every effect the skill evals need from the outside world. The use cases depend only on
 * these interfaces; Node implementations live in `adapters/`, in-memory fakes in `test/fakes/`.
 */
import type { EvalTask } from "../domain/eval-task.ts";

/** Structured log fields; values must be JSON-serializable. */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface Clock {
  now(): Date;
}

/** The task definitions (`tasks/<id>/task.json`). */
export interface TaskCatalog {
  list(): Promise<readonly EvalTask[]>;
}

/** Throwaway project directories, one per task run. */
export interface Workspaces {
  /** A fresh copy of the template project with the task's starting files; returns its path. */
  create(task: EvalTask): Promise<string>;
  /** Add the hidden checks, after the agent has finished. */
  addChecks(task: EvalTask, directory: string): Promise<void>;
  remove(directory: string): Promise<void>;
}

export interface AgentRequest {
  readonly task: EvalTask;
  readonly directory: string;
  readonly prompt: string;
}

export interface AgentOutcome {
  /** False when the agent crashed or timed out; its changes are then not checked. */
  readonly isCompleted: boolean;
  readonly output: string;
}

/** Something that edits a workspace to solve a task: a coding agent, or a stand-in. */
export interface CodingAgent {
  solve(request: AgentRequest): Promise<AgentOutcome>;
}

export interface CheckOutcome {
  readonly isPassed: boolean;
  /** The end of the tool output, for the log. */
  readonly output: string;
}

/** The two checks of ENGINEERING_PLAN 10.4: the type check and the tests of a workspace. */
export interface ProjectChecks {
  typecheck(directory: string): Promise<CheckOutcome>;
  test(directory: string): Promise<CheckOutcome>;
}
