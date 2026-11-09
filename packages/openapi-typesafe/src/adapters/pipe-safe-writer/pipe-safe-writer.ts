import type { Writable } from "node:stream";

/**
 * A writer for the CLI's stdout that stops when the reader closes the pipe (`| head`): the write
 * fails with `EPIPE`, which Node raises as an unhandled `error` event and a crash with exit code
 * 1. The reader has all it wanted, so the rest is dropped and the run ends as it would have.
 * Every other write error is thrown again, as before.
 */

const BROKEN_PIPE = "EPIPE";

function isBrokenPipe(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === BROKEN_PIPE;
}

/**
 * The text writer of the stream. After `EPIPE` the stream is destroyed, so later writes are
 * dropped by the stream itself and raise no second error.
 */
export function createPipeSafeWriter(stream: Writable): (text: string) => void {
  stream.on("error", (error: Error) => {
    if (!isBrokenPipe(error)) {
      throw error;
    }
  });
  return (text) => {
    stream.write(text);
  };
}
