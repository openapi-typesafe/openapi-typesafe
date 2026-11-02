import type { CommandOutcome, CommandRun, CommandRunner } from "../../src/application/ports.ts";
import { InMemoryFileStore } from "./in-memory-file-store.ts";

/** What the fake does for one command: its outcome and files it writes relative to `cwd`. */
export interface FakeCommandEffect {
  readonly exitCode?: number | null;
  readonly isTimedOut?: boolean;
  readonly outputTail?: string;
  readonly writes?: Readonly<Record<string, string>>;
}

/**
 * CommandRunner driven by a script. Commands succeed unless the script says otherwise; written
 * files land in an InMemoryFileStore whose `resolve` produced the run's `cwd`.
 */
export class FakeCommandRunner implements CommandRunner {
  readonly runs: CommandRun[] = [];
  readonly #store: InMemoryFileStore;
  readonly #script: (run: CommandRun) => FakeCommandEffect;

  constructor(
    store: InMemoryFileStore,
    script: (run: CommandRun) => FakeCommandEffect = () => ({}),
  ) {
    this.#store = store;
    this.#script = script;
  }

  /** The commands run so far, each joined with spaces. */
  get commandLines(): string[] {
    return this.runs.map((run) => run.command.join(" "));
  }

  async run(run: CommandRun): Promise<CommandOutcome> {
    this.runs.push(run);
    const effect = this.#script(run);
    for (const [path, text] of Object.entries(effect.writes ?? {})) {
      await this.#store.writeText(`${InMemoryFileStore.toRelative(run.cwd)}/${path}`, text);
    }
    return {
      exitCode: effect.exitCode === undefined ? 0 : effect.exitCode,
      isTimedOut: effect.isTimedOut ?? false,
      outputTail: effect.outputTail ?? "",
      durationMs: 7,
    };
  }
}
