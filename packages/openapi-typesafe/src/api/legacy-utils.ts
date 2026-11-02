import { escapePointer, parseRef } from "@redocly/openapi-core/lib/ref-utils.js";
import c from "ansi-colors";
import { formatDuration } from "../adapters/terminal-logger/terminal-logger.js";
import type { DebugGroup, Logger } from "../application/ports/logger.js";
import { discriminatorProperty } from "../application/transform/schema/discriminator-property.js";
import type { IrPropertySignature } from "../domain/ir/nodes.js";
import type { DiscriminatorObject } from "../types.js";
import { defaultLogger, terminalSupportsColor } from "./default-ports.js";

/**
 * The original's exported utilities, kept for 1.x (ADR-004, decision 9). The generator itself
 * logs through the Logger port; `debug`, `warn` and `error` here write through the default one.
 */

// The exported `c` is the shared ansi-colors instance, switched off at import when the terminal has
// no colors, as the original did. The generator's own logger uses a separate instance.
if (!terminalSupportsColor()) {
  c.enabled = false;
}

export { c };

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
  let pointer = "#";
  for (const part of parts) {
    if (part === undefined || part === null || part === "") {
      continue;
    }
    const maybeRef = parseRef(String(part)).pointer;
    if (maybeRef.length) {
      for (const refPart of maybeRef) {
        pointer += `/${escapePointer(refPart)}`;
      }
    } else {
      pointer += `/${escapePointer(part)}`;
    }
  }
  return pointer;
}

/** Print debug message (cribbed from the `debug` package, but without all the bells & whistles */
export function debug(msg: string, group?: string, time?: number) {
  // Any group name was accepted; one the logger does not know prints in white, as before.
  defaultLogger(false).debug(msg, group as DebugGroup | undefined, time);
}

/** Print error message */
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

export interface ResolveRefOptions {
  silent: boolean;
  visited?: string[];
  /** @internal Where warnings go; the default terminal logger (respecting `silent`) if absent. */
  logger?: Logger;
}

/** resolve a $ref in a schema */
export function resolveRef<T>(
  schema: any,
  $ref: string,
  options: ResolveRefOptions,
): T | undefined {
  const { visited = [] } = options;
  const logger = options.logger ?? defaultLogger(options.silent ?? false);
  const { pointer } = parseRef($ref);
  if (!pointer.length) {
    return undefined;
  }
  let node = schema;
  for (const key of pointer) {
    if (node && typeof node === "object" && node[key]) {
      node = node[key];
    } else {
      logger.warn(`Could not resolve $ref "${$ref}"`);
      return undefined;
    }
  }

  // if this is also a $ref, keep tracing
  if (node && typeof node === "object" && node.$ref) {
    if (visited.includes(node.$ref)) {
      logger.warn(`Could not resolve circular $ref "${$ref}"`);
      return undefined;
    }
    return resolveRef(schema, node.$ref, { ...options, logger, visited: [...visited, node.$ref] });
  }

  return node;
}

/** Walk through any JSON-serializable (i.e. non-circular) object */
export function walk(
  obj: unknown,
  cb: (value: Record<string, unknown>, path: (string | number)[]) => void,
  path: (string | number)[] = [],
): void {
  if (!obj || typeof obj !== "object") {
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      walk(obj[i], cb, path.concat(i));
    }
    return;
  }
  cb(obj as Record<string, unknown>, path);
  for (const k of Object.keys(obj)) {
    walk((obj as Record<string, unknown>)[k], cb, path.concat(k));
  }
}

/** Print warning message */
export function warn(msg: string, silent = false) {
  defaultLogger(silent).warn(msg);
}
