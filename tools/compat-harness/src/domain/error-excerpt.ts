/** Keep reports readable: the error line and a few stack frames say where it failed. */
const EXCERPT_LINE_COUNT = 5;

/** A thrown error as Node prints it, for example `Error: Unsupported OpenAPI version: 3.2.0`. */
const THROWN_ERROR_LINE = /^\w*Error\b/;

/** The generator's own error line, for example ` ✘  Can't resolve $ref at #/paths/...`. */
const GENERATOR_ERROR_LINE = /^\s*✘/;

/**
 * Pick the informative part of a generator's stderr. Node prints the source line of an uncaught
 * error before the message, and the generator prints a banner first, so the excerpt starts at the
 * thrown error line, else at the generator's error line, else at the top.
 */
export function extractErrorExcerpt(stderr: string): string {
  const lines = stderr.trim().split("\n");
  const thrownIndex = lines.findIndex((line) => THROWN_ERROR_LINE.test(line));
  const generatorIndex = lines.findIndex((line) => GENERATOR_ERROR_LINE.test(line));
  const start = thrownIndex >= 0 ? thrownIndex : Math.max(generatorIndex, 0);
  return lines.slice(start, start + EXCERPT_LINE_COUNT).join("\n");
}
