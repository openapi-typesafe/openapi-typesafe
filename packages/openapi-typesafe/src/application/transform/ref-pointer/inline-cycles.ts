import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { isJsonObject } from "./generated-shape.js";
import { pointerNode, refPointerOf } from "./pointer-walk.js";
import { typedWalk } from "./typed-walk.js";

/**
 * A `$ref` whose pointer crosses a segment with no type (`definitions/A`) is typed by writing its
 * target inline. If the target, directly or through other such `$ref`s, points back at itself,
 * writing it inline never ends; such a `$ref` keeps the original type.
 */

interface CycleInput {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
}

function refsIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      refsIn(item, found);
    }
  } else if (isJsonObject(node)) {
    if (typeof node.$ref === "string") {
      found.push(node.$ref);
    }
    for (const value of Object.values(node)) {
      refsIn(value, found);
    }
  }
  return found;
}

function isWrittenInline(ref: string, input: CycleInput): boolean {
  const pointer = refPointerOf(ref);
  return pointer !== null && typedWalk({ pointer, ...input }).kind === "untyped";
}

/** Depth-first search with the usual colors: a `$ref` met again while it is open is a cycle. */
function reachesOpenRef(ref: string, open: Map<string, boolean>, input: CycleInput): boolean {
  if (open.has(ref)) {
    return open.get(ref) === true;
  }
  open.set(ref, true);
  const pointer = refPointerOf(ref);
  const target = pointer === null ? undefined : pointerNode(pointer, input.refs);
  const isCycle = refsIn(target).some(
    (inner) => isWrittenInline(inner, input) && reachesOpenRef(inner, open, input),
  );
  open.set(ref, false);
  return isCycle;
}

/** Whether writing the target of `ref` inline would write it again inside itself. */
export function hasInlineCycle(ref: string, options: SchemaOptions, refs: RefResolver): boolean {
  return reachesOpenRef(ref, new Map(), { options, refs });
}
