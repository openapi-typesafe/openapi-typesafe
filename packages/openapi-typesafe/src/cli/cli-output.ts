import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatDuration } from "../adapters/terminal-logger/terminal-logger.js";
import type { CliArguments } from "./cli-arguments.js";
import type { CliDependencies } from "./cli-dependencies.js";
import { cliError } from "./cli-errors.js";

/** Writing one generated file, or checking it with `--check`, and the line printed for it. */

/** One CLI run: its dependencies, its arguments and when it started. */
export interface CliRun {
  readonly deps: CliDependencies;
  readonly args: CliArguments;
  readonly startedAt: number;
}

/** A generated file: `source` names the schema and `output` is the path as the user wrote it. */
export interface OutputFile {
  readonly source: string;
  readonly output: string;
  readonly file: URL;
}

/** A file URL for a path that is absolute, or relative to `base` (a directory or file URL). */
export function resolveFileUrl(filePath: string, base: URL): URL {
  return path.isAbsolute(filePath) ? pathToFileURL(filePath) : new URL(filePath, base);
}

function printDone(run: CliRun, output: OutputFile): void {
  const { style, now } = run.deps;
  const target = style.green(`${output.source} → ${style.bold(output.output)}`);
  const duration = style.dim(`[${formatDuration(now() - run.startedAt)}]`);
  run.deps.console.info(`🚀 ${target} ${duration}`);
}

/**
 * With `--check`, fail with `OUTPUT_STALE` when the file differs from `contents` and leave it
 * alone otherwise. Without it, write the file and print where it went.
 */
export function emitOutput(run: CliRun, output: OutputFile, contents: string): void {
  if (run.args.isCheck) {
    if (run.deps.files.readText(output.file) !== contents) {
      // The original message, then the file: with several APIs it tells which one is stale.
      throw cliError(
        "OUTPUT_STALE",
        `Generated types are not up-to-date! ${output.output} differs from its schema.`,
      );
    }
    return;
  }
  run.deps.files.writeText(output.file, contents);
  printDone(run, output);
}
