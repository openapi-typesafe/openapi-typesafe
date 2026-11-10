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

/**
 * The child of a node under a pointer key. A pointer may pass through a `$ref`
 * (`#/components/schemas/Wrap/properties/o/properties/v`, where `o` is a `$ref`): a key the node
 * does not have is read from the node's target, as the generated types index it (ADR-026). A key
 * the node has is read from it, so a pointer to a sibling of a `$ref` (OpenAPI 3.1) stays as
 * written.
 */
function childOf(
  schema: unknown,
  node: unknown,
  key: string,
  options: ResolveRefOptions & { logger: Logger },
): unknown {
  if (!isObject(node)) {
    return undefined;
  }
  const { visited = [] } = options;
  const target = node.$ref;
  if (node[key] || typeof target !== "string" || visited.includes(target)) {
    return node[key];
  }
  const resolved = resolveDocumentRef(schema, target, {
    ...options,
    visited: [...visited, target],
  });
  return isObject(resolved) ? resolved[key] : undefined;
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
    const child = childOf(schema, node, key, { ...options, logger });
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
