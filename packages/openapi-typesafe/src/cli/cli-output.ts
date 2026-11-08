import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

/**
 * A scheme of two or more characters (`https:`, `file:`). One letter is a Windows drive (`C:`), so
 * `C:\\specs\\api.yaml` stays a path.
 */
const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

/**
 * The URL of a location the user wrote: a URL as it is, else a file path, absolute or relative to
 * the directory of `base` (a directory or file URL). A path is not parsed as a URL, so `#`, `?` and
 * `%` are part of the file name.
 */
export function resolveLocationUrl(location: string, base: URL): URL {
  if (URL_SCHEME.test(location)) {
    return new URL(location);
  }
  const baseDirectory = fileURLToPath(new URL(".", base));
  return pathToFileURL(path.resolve(baseDirectory, location));
}

/** A schema the CLI reads: `name` is how the error names it, `location` where it is. */
export interface SchemaFile {
  readonly name: string;
  readonly location: URL;
}

const FILE_PROTOCOL = "file:";

/**
 * Fail with `CLI_OUTPUT_IS_INPUT` when `output` is one of the local `schemas`, also through a
 * link or in another letter case. Writing it would replace the schema with the types, which
 * upstream did without a word. Checked before generating, so nothing is loaded or written.
 */
export function ensureOutputIsNotSchema(
  run: CliRun,
  output: OutputFile,
  schemas: readonly SchemaFile[],
): void {
  if (output.file.protocol !== FILE_PROTOCOL) {
    return;
  }
  const schema = schemas.find(
    ({ location }) =>
      location.protocol === FILE_PROTOCOL && run.deps.files.isSameFile(location, output.file),
  );
  if (schema) {
    throw cliError(
      "CLI_OUTPUT_IS_INPUT",
      `The output ${output.output} is the schema ${schema.name}: writing the types would ` +
        "overwrite it. Choose another output file.",
    );
  }
}

/** As `resolveLocationUrl`, but undefined for a URL that does not parse instead of a throw. */
export function parseLocationUrl(location: string, base: URL): URL | undefined {
  if (URL_SCHEME.test(location)) {
    return URL.parse(location) ?? undefined;
  }
  return resolveLocationUrl(location, base);
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
