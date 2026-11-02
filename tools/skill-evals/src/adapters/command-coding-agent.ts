import { join } from "node:path";
import type { AgentOutcome, AgentRequest, CodingAgent } from "../application/ports.ts";
import type { ProcessRunner } from "./node-process-runner.ts";

/** A coding agent run as a command line program that reads the prompt on standard input. */
export interface AgentCommand {
  readonly command: readonly string[];
  /** Environment variables the agent needs beyond the basic ones, such as an API key. */
  readonly passedVariables: readonly string[];
}

export interface CommandCodingAgentOptions {
  readonly agent: AgentCommand;
  readonly runner: ProcessRunner;
  readonly timeoutMs: number;
  /** One full transcript per task: `<transcriptDir>/<task id>.log`. */
  readonly transcriptDir: string;
}

/** Runs the agent in the workspace; it completed when it exited with 0 before the timeout. */
export class CommandCodingAgent implements CodingAgent {
  readonly #options: CommandCodingAgentOptions;

  constructor(options: CommandCodingAgentOptions) {
    this.#options = options;
  }

  async solve(request: AgentRequest): Promise<AgentOutcome> {
    const { agent, runner, timeoutMs, transcriptDir } = this.#options;
    const outcome = await runner.run({
      command: agent.command,
      cwd: request.directory,
      timeoutMs,
      input: request.prompt,
      logPath: join(transcriptDir, `${request.task.id}.log`),
      passedVariables: agent.passedVariables,
    });
    const isCompleted = outcome.exitCode === 0 && !outcome.isTimedOut;
    const timeoutNote = outcome.isTimedOut ? `\n(agent timed out after ${timeoutMs} ms)` : "";
    return { isCompleted, output: `${outcome.outputTail}${timeoutNote}` };
  }
}
