import { childPointer, ROOT_POINTER } from "../../domain/openapi/json-pointer.js";

/** An object with a string `$ref`, and its JSON Pointer in the document. */
export interface RefHolder {
  readonly node: { $ref: string };
  readonly pointer: string;
}

/**
 * Keywords whose value is data, not OpenAPI: a `$ref` or a `discriminator` in an example, a
 * default, a `const` or an `enum` value, or an extension is part of the data and stays as written.
 */
const DATA_KEYWORDS = new Set(["example", "examples", "default", "const", "enum"]);
const EXTENSION_PREFIX = "x-";

/**
 * Keywords whose value maps names to objects: a property, a schema or a response may be named
 * `default` or `example`, and is OpenAPI all the same.
 */
const NAME_MAPS = new Set([
  "properties",
  "patternProperties",
  "dependentSchemas",
  "$defs",
  "definitions",
  "schemas",
  "responses",
  "parameters",
  "requestBodies",
  "headers",
  "securitySchemes",
  "links",
  "callbacks",
  "pathItems",
  "mediaTypes",
  "content",
  "encoding",
  "paths",
  "webhooks",
]);

interface PendingNode {
  readonly value: object;
  readonly pointer: string;
  /** Whether the keys of `value` are names (of properties, schemas, responses), not keywords. */
  readonly hasNameKeys: boolean;
}

function isDataKey(key: string): boolean {
  return DATA_KEYWORDS.has(key) || key.startsWith(EXTENSION_PREFIX);
}

/**
 * Every object of a parsed document that is OpenAPI, not data (`DATA_KEYWORDS`), with its JSON
 * Pointer, in no particular order. The walk uses its own stack, so a deeply nested document does
 * not run out of call stack, and a node shared by YAML aliases (or a cycle of them) is visited
 * once.
 */
function openApiNodes(document: unknown): PendingNode[] {
  const found: PendingNode[] = [];
  const visited = new WeakSet<object>();
  const pending: PendingNode[] = [];
  const enqueue = (value: unknown, pointer: string, hasNameKeys: boolean): void => {
    if (typeof value === "object" && value !== null && !visited.has(value)) {
      visited.add(value);
      pending.push({ value, pointer, hasNameKeys });
    }
  };
  enqueue(document, ROOT_POINTER, false);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    found.push(next);
    // One push per child: spreading an array of millions of children overflows the stack.
    for (const [key, child] of Object.entries(next.value)) {
      if (next.hasNameKeys || !isDataKey(key)) {
        enqueue(child, childPointer(next.pointer, key), !next.hasNameKeys && NAME_MAPS.has(key));
      }
    }
  }
  return found;
}

function hasStringRef(value: object): value is { $ref: string } {
  return !Array.isArray(value) && typeof (value as { $ref?: unknown }).$ref === "string";
}

/** Every object with a string `$ref` in a parsed document, outside data, in no particular order. */
export function findRefHolders(document: unknown): RefHolder[] {
  return openApiNodes(document).flatMap(({ value, pointer, hasNameKeys }) =>
    !hasNameKeys && hasStringRef(value) ? [{ node: value, pointer }] : [],
  );
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `discriminator.mapping` object of a parsed document, outside data. */
export function findMappings(document: unknown): Record<string, unknown>[] {
  return openApiNodes(document).flatMap(({ value, hasNameKeys }) => {
    const { discriminator } = value as { discriminator?: unknown };
    const mapping = !hasNameKeys && isMapping(discriminator) ? discriminator.mapping : undefined;
    return isMapping(mapping) ? [mapping] : [];
  });
}
