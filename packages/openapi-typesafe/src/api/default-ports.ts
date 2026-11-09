import { performance } from "node:perf_hooks";
import { createConfig, type Config as RedoclyConfig } from "@redocly/openapi-core";
import supportsColor from "supports-color";
import { createNodeDeprecationReporter } from "../adapters/node-deprecations/node-deprecations.js";
import type { RemoteDocumentLimits } from "../adapters/redocly-loader/remote-fetch.js";
import {
  createTerminalLogger,
  type TerminalSink,
} from "../adapters/terminal-logger/terminal-logger.js";
import type { DeprecationReporter } from "../application/ports/deprecation-reporter.js";
import type { Logger } from "../application/ports/logger.js";

/**
 * The default adapters of the Node API (ENGINEERING_PLAN 4.5): this module and the CLI's
 * composition root are where the process environment is read.
 */

/** Colors when the terminal supports them, as the original decided. */
export function terminalSupportsColor(): boolean {
  const stdout = supportsColor.stdout;
  return Boolean(stdout) && stdout !== false && stdout.hasBasic !== false;
}

/**
 * Every line of the logger goes to stderr: the CLI writes the types to stdout, and `console.debug`
 * writes there too, so debug lines would end up inside the generated file.
 */
const STDERR_SINK: TerminalSink = {
  // biome-ignore lint/suspicious/noConsole: the terminal logger's own channel
  debug: (line) => console.error(line),
  // biome-ignore lint/suspicious/noConsole: the terminal logger's own channel
  warn: (line) => console.warn(line),
  // biome-ignore lint/suspicious/noConsole: the terminal logger's own channel
  error: (line) => console.error(line),
};

/** The terminal logger with `DEBUG` from the environment, writing to stderr. */
export function defaultLogger(silent: boolean): Logger {
  return createTerminalLogger({
    silent,
    debugFilter: process.env.DEBUG,
    useColors: terminalSupportsColor(),
    sink: STDERR_SINK,
  });
}

/** Deprecations as Node.js `DeprecationWarning`s, each code once per process. */
export function defaultDeprecationReporter(): DeprecationReporter {
  return createNodeDeprecationReporter();
}

/**
 * How long one remote `$ref` (or a remote source) may take to load. Large documents (the 27 MB
 * Cloudflare spec) download in seconds; a minute covers slow hosts, while Node's own fetch would
 * wait five minutes for a server that never answers (ENGINEERING_PLAN 8.5).
 */
export const REMOTE_REF_TIMEOUT_MS = 60_000;

const MEBIBYTE = 1024 * 1024;

/**
 * Bounds on the remote documents of one run (ADR-033). Large split documents have a few thousand
 * files, so 10,000 leaves room and still ends an endless fan-out. 16 parallel fetches keep a
 * multi-file document fast without exhausting local ports.
 *
 * The size limits count decoded bytes (threat model T2). The largest document of the 1,820-entry
 * compatibility corpus is Microsoft Graph beta, 71 MiB; 256 MiB per document is more than three
 * times that, and half of the longest string V8 can hold (about 512 MiB), so a document that
 * passes can still be parsed. 512 MiB for the whole run lets a split document use twice the
 * largest single one, and bounds the memory a crafted set of documents can take to that much text
 * and its parsed form.
 */
export const DEFAULT_REMOTE_DOCUMENT_LIMITS: RemoteDocumentLimits = {
  maxDocuments: 10_000,
  maxParallelFetches: 16,
  maxDocumentBytes: 256 * MEBIBYTE,
  maxTotalBytes: 512 * MEBIBYTE,
};

/** The working directory of the process: the default `cwd` of an inline source. */
export function processCwd(): string {
  return process.cwd();
}

/** A monotonic clock in milliseconds, for debug durations. */
export function monotonicNow(): number {
  return performance.now();
}

/** The default Redocly config: minimal rules, and duplicate operation IDs are an error. */
export function defaultRedoclyConfig(): Promise<RedoclyConfig> {
  const rules = { "operation-operationId-unique": { severity: "error" as const } };
  return createConfig({ rules }, { extends: ["minimal"] });
}
