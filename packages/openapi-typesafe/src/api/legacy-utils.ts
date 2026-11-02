import colors from "ansi-colors";
import { formatDuration } from "../adapters/terminal-logger/terminal-logger.js";
import type { DebugGroup } from "../application/ports/logger.js";
import { discriminatorProperty } from "../application/transform/schema/discriminator-property.js";
import type { IrPropertySignature } from "../domain/ir/nodes.js";
import { createRef as createDomainRef } from "../domain/openapi/json-pointer.js";
import type { DiscriminatorObject } from "../types.js";
import { defaultLogger, terminalSupportsColor } from "./default-ports.js";
import { type ResolveRefOptions, resolveDocumentRef, walkDocument } from "./document-refs.js";

/**
 * The original's exported utilities, kept for 1.x (ADR-004, decision 9). The generator itself
 * logs through the Logger port; `debug`, `warn` and `error` here write through the default one.
 */

// The exported `c` is the shared ansi-colors instance, switched off at import when the terminal has
// no colors, as the original did. The generator's own logger uses a separate instance.
if (!terminalSupportsColor()) {
  colors.enabled = false;
}

/**
 * The shared ansi-colors instance.
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9). Use a color library directly.
 */
export const c = colors;

/**
 * The discriminator property of a schema at `path`, typed as its discriminator value. Returns IR
 * (task 6.2), like the exported transformers.
 */
export function createDiscriminatorProperty(
  discriminator: DiscriminatorObject,
  { path, readonly = false }: { path: string; readonly?: boolean },
): IrPropertySignature {
  return discriminatorProperty(discriminator, path, readonly);
}

/** Create a $ref pointer (even from other $refs) */
export function createRef(parts: (number | string | undefined | null)[]): string {
  return createDomainRef(parts);
}

/**
 * Print debug message (cribbed from the `debug` package, but without all the bells & whistles
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function debug(msg: string, group?: string, time?: number) {
  // Any group name was accepted; one the logger does not know prints in white, as before.
  defaultLogger(false).debug(msg, group as DebugGroup | undefined, time);
}

/**
 * Print error message
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function error(msg: string) {
  defaultLogger(false).error(msg);
}

/** Format a performance log in a friendly format */
export function formatTime(t: number) {
  return typeof t === "number" ? formatDuration(t) : t;
}

/** Call Object.entries() and optionally sort */
export function getEntries<T>(
  obj: ArrayLike<T> | Record<string, T>,
  options?: {
    alphabetize?: boolean;
    excludeDeprecated?: boolean;
  },
) {
  let entries = Object.entries(obj);
  if (options?.alphabetize) {
    entries.sort(([a], [b]) => a.localeCompare(b, "en-us", { numeric: true }));
  }
  if (options?.excludeDeprecated) {
    entries = entries.filter(
      ([, v]) => !(v && typeof v === "object" && "deprecated" in v && v.deprecated),
    );
  }
  return entries;
}

export type { ResolveRefOptions } from "./document-refs.js";

/**
 * resolve a $ref in a schema
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function resolveRef<T>(
  schema: any,
  $ref: string,
  options: ResolveRefOptions,
): T | undefined {
  return resolveDocumentRef<T>(schema, $ref, options);
}

/**
 * Walk through any JSON-serializable (i.e. non-circular) object
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function walk(
  obj: unknown,
  cb: (value: Record<string, unknown>, path: (string | number)[]) => void,
  path: (string | number)[] = [],
): void {
  walkDocument(obj, cb, path);
}

/**
 * Print warning message
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function warn(msg: string, silent = false) {
  defaultLogger(silent).warn(msg);
}
