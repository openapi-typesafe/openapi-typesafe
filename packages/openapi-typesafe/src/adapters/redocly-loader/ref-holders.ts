import { escapePointerSegment } from "../../domain/openapi/json-pointer.js";

/** An object with a string `$ref`, and its JSON Pointer in the document. */
export interface RefHolder {
  readonly node: { $ref: string };
  readonly pointer: string;
}

interface PendingNode {
  readonly value: object;
  readonly pointer: string;
}

function hasStringRef(value: object): value is { $ref: string } {
  return !Array.isArray(value) && typeof (value as { $ref?: unknown }).$ref === "string";
}

/**
 * Every object with a string `$ref` in a parsed document, in no particular order. The walk uses
 * its own stack, so a deeply nested document does not run out of call stack, and a node shared by
 * YAML aliases (or a cycle of them) is visited once.
 */
export function findRefHolders(document: unknown): RefHolder[] {
  const found: RefHolder[] = [];
  const visited = new WeakSet<object>();
  const pending: PendingNode[] = [];
  const enqueue = (value: unknown, pointer: string): void => {
    if (typeof value === "object" && value !== null && !visited.has(value)) {
      visited.add(value);
      pending.push({ value, pointer });
    }
  };
  enqueue(document, "#");
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (hasStringRef(next.value)) {
      found.push({ node: next.value, pointer: next.pointer });
    }
    for (const [key, child] of Object.entries(next.value)) {
      enqueue(child, `${next.pointer}/${escapePointerSegment(key)}`);
    }
  }
  return found;
}
