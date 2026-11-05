import type { Readable } from "node:stream";
import type { FileReader, FileWriter } from "../application/ports/file-system.js";
import type { Logger } from "../application/ports/logger.js";
import type { RedoclyConfigSource } from "../application/ports/redocly-config-source.js";
import type { GeneratorOptions, SchemaSource } from "../types.js";

/** What the CLI needs from the outside world; `main.ts` wires the real adapters (ADR-012). */

/** Plain output lines: `info` goes to stdout, `notice` to stderr, both without a prefix. */
export interface CliConsole {
  info(text: string): void;
  notice(text: string): void;
}

/** The terminal styles of the CLI's own lines; they return the text unchanged without colors. */
export interface TextStyle {
  bold(text: string): string;
  green(text: string): string;
  dim(text: string): string;
}

/** Generate the printed declarations, with the comment header, for one schema. */
export type GenerateTypes = (source: SchemaSource, options: GeneratorOptions) => Promise<string>;

export interface CliDependencies {
  /** The working directory, as a directory URL (with a trailing slash). */
  readonly cwd: URL;
  readonly version: string;
  /** Warnings and the final error line; never silent. */
  readonly logger: Logger;
  readonly console: CliConsole;
  /** The generated types when there is no `--output`. */
  readonly writeStdout: (text: string) => void;
  /** Read only when the schema comes from stdin: opening it early can keep the process alive. */
  readonly stdin: () => Readable;
  /**
   * Whether stdin is a terminal. Then nothing is piped in, and reading it would wait for typed
   * input with no prompt, which looks like a hang (upstream #1905).
   */
  readonly isStdinTerminal: () => boolean;
  readonly files: FileReader & FileWriter;
  readonly redoclyConfigs: RedoclyConfigSource;
  readonly generate: GenerateTypes;
  /** A monotonic time in milliseconds, for the time printed after each output. */
  readonly now: () => number;
  readonly style: TextStyle;
}
