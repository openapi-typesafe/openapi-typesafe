import { parseRef } from "@redocly/openapi-core/lib/ref-utils.js";
import type { Logger } from "../application/ports/logger.js";
import { defaultLogger } from "./default-ports.js";

/** `$ref` resolution and the document walk that the generator's pre-pass uses. */

export interface ResolveRefOptions {
  silent: boolean;
  visited?: string[];
  /** @internal Where warnings go; the default terminal logger (respecting `silent`) if absent. */
  logger?: Logger;
}

/** Resolve a `$ref` in a document; warns and returns undefined when it cannot. */
export function resolveDocumentRef<T>(
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
    return resolveDocumentRef(schema, node.$ref, {
      ...options,
      logger,
      visited: [...visited, node.$ref],
    });
  }

  return node;
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
