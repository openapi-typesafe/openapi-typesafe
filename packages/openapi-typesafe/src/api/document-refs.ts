import { parseRef } from "@redocly/openapi-core/lib/ref-utils.js";
import type { Logger } from "../application/ports/logger.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import { defaultLogger } from "./default-ports.js";

/** `$ref` resolution and the document walk that the generator's pre-pass uses. */

export interface ResolveRefOptions {
  silent: boolean;
  visited?: string[];
  /** @internal Where warnings go; the default terminal logger (respecting `silent`) if absent. */
  logger?: Logger;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Resolve a `$ref` in a document; warns and returns undefined when it cannot. */
export function resolveDocumentRef<T>(
  schema: unknown,
  $ref: string,
  options: ResolveRefOptions,
): T | undefined {
  const { visited = [] } = options;
  const logger = options.logger ?? defaultLogger(options.silent ?? false);
  const { pointer } = parseRef($ref);
  if (!pointer.length) {
    return undefined;
  }
  let node: unknown = schema;
  for (const key of pointer) {
    const child = isObject(node) ? node[key] : undefined;
    if (!child) {
      logger.warn(warningText(`Could not resolve $ref "${$ref}"`, WARNING_CODES.REF_NOT_FOUND));
      return undefined;
    }
    node = child;
  }

  // if this is also a $ref, keep tracing
  const next = isObject(node) ? node.$ref : undefined;
  if (typeof next === "string" && next) {
    if (visited.includes(next)) {
      logger.warn(
        warningText(`Could not resolve circular $ref "${$ref}"`, WARNING_CODES.REF_CIRCULAR),
      );
      return undefined;
    }
    return resolveDocumentRef(schema, next, { ...options, logger, visited: [...visited, next] });
  }

  return node as T;
}

/** Call `cb` for every object in a JSON-serializable (non-circular) value, depth first. */
export function walkDocument(
  obj: unknown,
  cb: (value: Record<string, unknown>, path: (string | number)[]) => void,
  path: (string | number)[] = [],
): void {
  if (!obj || typeof obj !== "object") {
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      walkDocument(obj[i], cb, path.concat(i));
    }
    return;
  }
  cb(obj as Record<string, unknown>, path);
  for (const k of Object.keys(obj)) {
    walkDocument((obj as Record<string, unknown>)[k], cb, path.concat(k));
  }
}
