import colors from "ansi-colors";
import type { DebugGroup, Logger } from "../../application/ports/logger.js";
import { redactUrlSecrets } from "../../domain/url-secrets.js";

/**
 * The Logger port on a terminal, with the original output format: ` ⚠  ` warnings, ` ✘  `
 * errors, and `openapi-ts:<group>` debug lines filtered by `DEBUG` (ENGINEERING_PLAN 4.5). No
 * line shows the user info of a URL.
 */

/** Where the lines go: `console` in production, a recording sink in tests. */
export interface TerminalSink {
  debug(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}

export interface TerminalLoggerOptions {
  /**
   * Drop warnings and error lines; debug lines, which `DEBUG` asks for, are still written. The
   * error lines are the problems of a document that fails to load, which the thrown error lists.
   */
  readonly silent: boolean;
  /** The value of `DEBUG`: `*`, `openapi-ts:*` or `openapi-ts:<group>` turn debug lines on. */
  readonly debugFilter: string | undefined;
  readonly useColors: boolean;
  readonly sink: TerminalSink;
}

type Colors = ReturnType<typeof colors.create>;

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_MINUTE = 60_000;

/** A duration as the original prints it: one decimal, in ms, s or m. */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < MILLISECONDS_PER_SECOND) {
    return `${Math.round(10 * milliseconds) / 10}ms`;
  }
  if (milliseconds < MILLISECONDS_PER_MINUTE) {
    return `${Math.round(milliseconds / 100) / 10}s`;
  }
  return `${Math.round(milliseconds / 6000) / 10}m`;
}

function groupColor(palette: Colors, group: DebugGroup | undefined): (text: string) => string {
  const byGroup: Readonly<Partial<Record<DebugGroup, (text: string) => string>>> = {
    redoc: palette.cyanBright,
    lint: palette.yellowBright,
    bundle: palette.magentaBright,
    ts: palette.blueBright,
  };
  return (group && byGroup[group]) || palette.whiteBright;
}

/** Whether `DEBUG` asks for this group (the original check, case-insensitive for the group). */
export function isDebugEnabled(filter: string | undefined, group: DebugGroup | undefined): boolean {
  if (!filter) {
    return false;
  }
  return (
    !group ||
    filter === "*" ||
    filter === "openapi-ts:*" ||
    filter.toLocaleLowerCase() === `openapi-ts:${group.toLocaleLowerCase()}`
  );
}

class TerminalLogger implements Logger {
  readonly #options: TerminalLoggerOptions;
  readonly #palette: Colors;

  constructor(options: TerminalLoggerOptions) {
    this.#options = options;
    this.#palette = colors.create();
    this.#palette.enabled = options.useColors;
  }

  debug(message: string, group?: DebugGroup, durationMs?: number): void {
    if (!isDebugEnabled(this.#options.debugFilter, group)) {
      return;
    }
    const name = groupColor(this.#palette, group)(`openapi-ts:${group ?? "info"}`);
    // The original wrote no space without a duration (`openapi-ts:lintIgnored …`).
    const time =
      durationMs === undefined ? " " : this.#palette.green(` ${formatDuration(durationMs)} `);
    const text = redactUrlSecrets(message);
    this.#options.sink.debug(`  ${this.#palette.bold(name)}${time}${text}`);
  }

  warn(message: string): void {
    if (!this.#options.silent) {
      this.#options.sink.warn(this.#palette.yellow(` ⚠  ${redactUrlSecrets(message)}`));
    }
  }

  error(message: string): void {
    if (!this.#options.silent) {
      this.#options.sink.error(this.#palette.red(` ✘  ${redactUrlSecrets(message)}`));
    }
  }
}

/** A Logger that writes to a terminal sink. */
export function createTerminalLogger(options: TerminalLoggerOptions): Logger {
  return new TerminalLogger(options);
}
