import { appendPointer } from "../../../domain/openapi/json-pointer.js";
import type { RefResolver } from "../schema/schema-context.js";

/** Document nodes as the `$ref` pointer walks read them: with their place in the document. */

export type JsonObject = Readonly<Record<string, unknown>>;

/**
 * A schema node and its JSON Pointer in the document. The generator writes the type of a schema
 * reached by a `$ref` at the target, and the location decides whether a property with a `default`
 * is required (`isInputLocation`). Undefined for a node that is not in the document.
 */
export interface LocatedNode {
  readonly node: unknown;
  readonly location: string | undefined;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The schema a node stands for: a `$ref` is followed to its target. */
export function followRefs(node: unknown, refs: RefResolver): unknown {
  return isJsonObject(node) && typeof node.$ref === "string" ? refs.resolve(node.$ref) : node;
}

/** `followRefs` with the location: a `$ref` is followed to its target and the target's pointer. */
export function followLocated(located: LocatedNode, refs: RefResolver): LocatedNode {
  const { node } = located;
  return isJsonObject(node) && typeof node.$ref === "string"
    ? { node: refs.resolve(node.$ref), location: node.$ref }
    : located;
}

/** The location of a child of a node at `location`, or undefined outside the document. */
export function childLocation(location: string | undefined, ...segments: string[]) {
  return location === undefined ? undefined : appendPointer(location, segments);
}
