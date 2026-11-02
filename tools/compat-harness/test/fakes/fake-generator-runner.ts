import type {
  GeneratorRun,
  GeneratorRunner,
  GeneratorRunOutcome,
} from "../../src/application/ports.ts";
import { InMemoryFileStore } from "./in-memory-file-store.ts";

/** What the fake generator does for one run: write output, fail, or time out. */
export type FakeGeneration =
  | { readonly kind: "output"; readonly text: string }
  | { readonly kind: "fail"; readonly stderr: string }
  | { readonly kind: "timeout" };

/**
 * GeneratorRunner that writes scripted output into an InMemoryFileStore. The script picks the
 * behavior from the run (schema path and flags).
 */
export class FakeGeneratorRunner implements GeneratorRunner {
  readonly runs: GeneratorRun[] = [];
  readonly #store: InMemoryFileStore;
  readonly #script: (run: GeneratorRun) => FakeGeneration;

  constructor(store: InMemoryFileStore, script: (run: GeneratorRun) => FakeGeneration) {
    this.#store = store;
    this.#script = script;
  }

  async run(run: GeneratorRun): Promise<GeneratorRunOutcome> {
    this.runs.push(run);
    const generation = this.#script(run);
    switch (generation.kind) {
      case "output":
        await this.#store.writeText(InMemoryFileStore.toRelative(run.outputPath), generation.text);
        return { exitCode: 0, isTimedOut: false, stderr: "", durationMs: 5 };
      case "fail":
        return { exitCode: 1, isTimedOut: false, stderr: generation.stderr, durationMs: 3 };
      case "timeout":
        return { exitCode: null, isTimedOut: true, stderr: "", durationMs: run.timeoutMs };
    }
  }
}
