import type { ProgressReporter, RunEvent } from "../application/ports.ts";
import { formatDuration } from "../domain/report.ts";

/** One line per finished run, written to a stream such as standard error. */
export class StreamProgressReporter implements ProgressReporter {
  readonly #write: (text: string) => void;

  constructor(write: (text: string) => void) {
    this.#write = write;
  }

  runFinished(event: RunEvent): void {
    this.#write(`${event.label}: ${event.run} ${formatDuration(event.wallMs)}\n`);
  }
}
