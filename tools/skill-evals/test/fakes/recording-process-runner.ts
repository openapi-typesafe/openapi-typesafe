import type {
  ProcessOutcome,
  ProcessRun,
  ProcessRunner,
} from "../../src/adapters/node-process-runner.ts";

/** Records every run and answers with one scripted outcome. */
export class RecordingProcessRunner implements ProcessRunner {
  readonly runs: ProcessRun[] = [];
  readonly #outcome: ProcessOutcome;

  constructor(outcome: ProcessOutcome) {
    this.#outcome = outcome;
  }

  async run(run: ProcessRun): Promise<ProcessOutcome> {
    this.runs.push(run);
    return this.#outcome;
  }
}
