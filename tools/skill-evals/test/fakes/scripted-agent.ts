import type { AgentOutcome, AgentRequest, CodingAgent } from "../../src/application/ports.ts";

/** Answers each task with a scripted outcome (completed by default) and records the requests. */
export class ScriptedAgent implements CodingAgent {
  readonly requests: AgentRequest[] = [];
  readonly #outcomes: Readonly<Record<string, AgentOutcome>>;

  constructor(outcomes: Readonly<Record<string, AgentOutcome>> = {}) {
    this.#outcomes = outcomes;
  }

  async solve(request: AgentRequest): Promise<AgentOutcome> {
    this.requests.push(request);
    return this.#outcomes[request.task.id] ?? { isCompleted: true, output: "done" };
  }
}

/** An agent that fails unexpectedly, as a crashing adapter would. */
export class ThrowingAgent implements CodingAgent {
  async solve(): Promise<AgentOutcome> {
    throw new Error("agent adapter crashed");
  }
}
