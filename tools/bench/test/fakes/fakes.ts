import type {
  DocumentFiles,
  GeneratorRun,
  GeneratorRunner,
  ProgressReporter,
  RunEvent,
} from "../../src/application/ports.ts";
import type { RunMeasurement } from "../../src/domain/benchmark.ts";

/** Answers each run with the next measurement of its CLI's queue and records every run. */
export class ScriptedGeneratorRunner implements GeneratorRunner {
  readonly runs: GeneratorRun[] = [];
  readonly #queues: Map<string, RunMeasurement[]>;

  constructor(queues: Readonly<Record<string, readonly RunMeasurement[]>>) {
    this.#queues = new Map(Object.entries(queues).map(([cli, runs]) => [cli, [...runs]]));
  }

  async run(run: GeneratorRun): Promise<RunMeasurement> {
    this.runs.push(run);
    const next = this.#queues.get(run.cliPath)?.shift();
    if (next === undefined) {
      throw new Error(`no scripted run left for ${run.cliPath}`);
    }
    return next;
  }
}

/** Document sizes from a map; a path that is not in it is missing. */
export class InMemoryDocumentFiles implements DocumentFiles {
  readonly #sizes: ReadonlyMap<string, number>;

  constructor(sizes: Readonly<Record<string, number>>) {
    this.#sizes = new Map(Object.entries(sizes));
  }

  async byteLength(path: string): Promise<number> {
    const size = this.#sizes.get(path);
    if (size === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return size;
  }
}

export class RecordingProgressReporter implements ProgressReporter {
  readonly lines: string[] = [];

  runFinished(event: RunEvent): void {
    this.lines.push(`${event.label}: ${event.run} ${event.wallMs}`);
  }
}
