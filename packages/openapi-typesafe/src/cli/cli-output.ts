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

/** An output as the user wrote it: `source` names the schema, `output` is the path or URL. */
export interface NamedOutput {
  readonly source: string;
  readonly output: string;
}

/** A generated file: an output with the location of its local file. */
export interface OutputFile extends NamedOutput {
  readonly file: URL;
}

/**
 * A scheme of two or more characters (`https:`, `file:`). One letter is a Windows drive (`C:`), so
 * `C:\\specs\\api.yaml` stays a path.
 */
const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

/**
 * The URL of a location the user wrote: a URL, else a file path, absolute or relative to the
 * directory of `base` (a directory or file URL). A relative `file:` URL (`file:api.yaml`) resolves
 * against `base` too, as in openapi-typescript. A path is not parsed as a URL, so `#`, `?` and `%`
 * are part of the file name.
 */
export function resolveLocationUrl(location: string, base: URL): URL {
  if (URL_SCHEME.test(location)) {
    return new URL(location, base);
  }
  const baseDirectory = fileURLToPath(new URL(".", base));
  return pathToFileURL(path.resolve(baseDirectory, location));
}

const FILE_PROTOCOL = "file:";

/** A trailing `/`, or `\\` on Windows: the user named a directory, not a file. */
function endsWithSeparator(location: string): boolean {
  return location.endsWith("/") || location.endsWith(path.sep);
}

function invalidOutput(output: string, reason: string): Error {
  return cliError("CLI_OUTPUT_INVALID", `The output ${output} ${reason}`);
}

/** The URL of the output, if it is a local file that can be written; it may not exist yet. */
function outputUrlOf(run: CliRun, output: string, base: URL): URL {
  const file = parseLocationUrl(output, base);
  if (file?.protocol !== FILE_PROTOCOL) {
    throw invalidOutput(
      output,
      "is not a local file. Write the types to a file path or a file: URL.",
    );
  }
  if (!isLocalFile(file)) {
    throw invalidOutput(output, "names no file on this computer. Use a file path instead.");
  }
  if (endsWithSeparator(output) || run.deps.files.isDirectory(file)) {
    throw invalidOutput(output, "is a directory. Name the file to write the types to in it.");
  }
  return file;
}

/** A `file:` URL with a host, or with an encoded slash, names no path on this platform. */
function isLocalFile(file: URL): boolean {
  try {
    fileURLToPath(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * The output file of `source`, as the user wrote it in `output`, relative to `base`. Fails with
 * `CLI_OUTPUT_INVALID` before anything is generated when it is not a local file (a URL of
 * another scheme) or is a directory (a trailing separator, or a directory on disk). Without this
 * check, `-o dir/` wrote a file named `dir`.
 */
export function outputFileOf(run: CliRun, named: NamedOutput, base: URL): OutputFile {
  return { ...named, file: outputUrlOf(run, named.output, base) };
}

/** A file the CLI reads or writes: `name` is how an error names it, `location` where it is. */
export interface NamedFile {
  readonly name: string;
  readonly location: URL;
}

/** The `files` that are the local file `output`, also through a link or in another letter case. */
function filesAtOutput(run: CliRun, output: OutputFile, files: readonly NamedFile[]): NamedFile[] {
  return files.filter(
    ({ location }) =>
      location.protocol === FILE_PROTOCOL && run.deps.files.isSameFile(location, output.file),
  );
}

/**
 * Fail with `CLI_OUTPUT_IS_INPUT` when `output` is one of the `schemas`. Writing it would replace
 * the schema with the types, which upstream did without a word. Checked before generating, so
 * nothing is loaded or written.
 */
export function ensureOutputIsNotSchema(
  run: CliRun,
  output: OutputFile,
  schemas: readonly NamedFile[],
): void {
  const [schema] = filesAtOutput(run, output, schemas);
  if (schema) {
    throw cliError(
      "CLI_OUTPUT_IS_INPUT",
      `The output ${output.output} is the ${schema.name}: writing the types would ` +
        "overwrite it. Choose another output file.",
    );
  }
}

/**
 * Fail with `CLI_OUTPUT_DUPLICATE` when the output of an API is also one of `otherOutputs`.
 * Whichever write came last would win, so every API with that output fails, before anything is
 * generated.
 */
export function ensureOutputIsOwn(
  run: CliRun,
  output: OutputFile,
  otherOutputs: readonly NamedFile[],
): void {
  const clashes = filesAtOutput(run, output, otherOutputs);
  if (clashes.length > 0) {
    const others = clashes.map(({ name }) => name).join(", ");
    throw cliError(
      "CLI_OUTPUT_DUPLICATE",
      `The output ${output.output} of API ${output.source} is also the output of ${others}: they ` +
        "would overwrite each other. Give each API its own output file.",
    );
  }
}

/** As `resolveLocationUrl`, but undefined for a URL that does not parse instead of a throw. */
export function parseLocationUrl(location: string, base: URL): URL | undefined {
  if (URL_SCHEME.test(location)) {
    return URL.parse(location, base.href) ?? undefined;
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
