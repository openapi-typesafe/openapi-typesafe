/**
 * Terminal output of the CLI layer. Detailed events go to the log file; the terminal shows one-line
 * results.
 */
export function printLine(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function printError(text: string): void {
  process.stderr.write(`${text}\n`);
}
