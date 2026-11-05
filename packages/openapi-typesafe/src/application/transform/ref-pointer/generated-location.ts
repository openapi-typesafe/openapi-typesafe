import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { RefResolver } from "../schema/schema-context.js";
import { isJsonObject } from "./generated-shape.js";
import {
  leadingSegmentsOf,
  type RefPointer,
  refPointerOf,
  startsInSchema,
} from "./pointer-walk.js";

/**
 * Where the generator types the node a `$ref` points at: the location path it passes down, which
 * also names the node's `--enum` declaration and `--enum-values` array. A target written inline
 * (ADR-026) is typed there, so it shares the generator's enum instead of declaring a second one
 * named after the pointer: two TypeScript enums with the same members are not assignable.
 *
 * The path follows the generator: `properties` is skipped; `allOf/N`, `items`, `prefixItems/N`,
 * `patternProperties/P` and `additionalProperties` type their schema at the parent's location;
 * the `schema` of a parameter, header or media type is typed at the container's; a positional
 * parameter is named by `in` and `name`. A `$ref` crossed on the way continues at its target's
 * location. Other segments (`definitions/A`, `not`) are kept: the generator does not type them.
 */

export interface GeneratedLocation {
  readonly path: string;
  /** The node is an `additionalProperties` value, as `transformNested` is told. */
  readonly isFromAdditionalProperties: boolean;
}

interface LocationWalk {
  readonly path: readonly string[];
  readonly node: unknown;
  readonly isSchema: boolean;
  readonly isFromAdditionalProperties: boolean;
}

/** One step: the segments it adds to the path, the node it moves to, the segments it reads. */
interface Step {
  readonly path: readonly string[];
  readonly child: unknown;
  readonly length: 1 | 2;
  readonly isSchema: boolean;
  readonly isFromAdditionalProperties?: boolean;
}

/** Keywords followed by a name or position whose schema is typed at the parent's location. */
const PARENT_LOCATION_PAIRS: ReadonlySet<string> = new Set([
  "allOf",
  "prefixItems",
  "patternProperties",
]);
/** Keywords whose schema is typed at the parent's location as a record value. */
const RECORD_VALUE_KEYWORDS: ReadonlySet<string> = new Set([
  "additionalProperties",
  "unevaluatedProperties",
]);
/** Keywords followed by a name or position that both stay in the location. */
const KEPT_PAIRS: ReadonlySet<string> = new Set(["anyOf", "oneOf", "$defs"]);
const INDEX_RE = /^\d+$/;

function childOf(node: unknown, segment: string | undefined): unknown {
  return (isJsonObject(node) || Array.isArray(node)) && segment !== undefined
    ? (node as Readonly<Record<string, unknown>>)[segment]
    : undefined;
}

function pairStep(value: unknown, next: string | undefined, path: readonly string[]): Step {
  return { path, child: childOf(value, next), length: 2, isSchema: true };
}

function schemaStep(node: unknown, segment: string, next: string | undefined): Step {
  const value = childOf(node, segment);
  const named = next === undefined ? [] : [next];
  if (segment === "properties") {
    return pairStep(value, next, named);
  }
  if (PARENT_LOCATION_PAIRS.has(segment) || (segment === "items" && Array.isArray(value))) {
    return pairStep(value, next, []);
  }
  if (KEPT_PAIRS.has(segment)) {
    return pairStep(value, next, [segment, ...named]);
  }
  const isRecordValue = RECORD_VALUE_KEYWORDS.has(segment);
  const path = isRecordValue || segment === "items" ? [] : [segment];
  return {
    path,
    child: value,
    length: 1,
    isSchema: true,
    isFromAdditionalProperties: isRecordValue,
  };
}

/** A path item's own parameters sit under one more `parameters` segment (`pathItemType`). */
function isPathItem(path: readonly string[]): boolean {
  const [root, section] = path;
  return (
    (path.length === 2 && (root === "paths" || root === "webhooks")) ||
    (path.length === 3 && root === "components" && section === "pathItems")
  );
}

/** `parameters/N`: the parameter is named by `in` and `name` (a `$ref` one is crossed later). */
function parameterStep(walk: LocationWalk, next: string): Step {
  const entry = childOf(childOf(walk.node, "parameters"), next);
  const where = isJsonObject(entry) ? [String(entry.in), String(entry.name)] : [];
  const prefix = isPathItem(walk.path) ? ["parameters"] : [];
  return { path: [...prefix, "parameters", ...where], child: entry, length: 2, isSchema: false };
}

function documentStep(walk: LocationWalk, segments: readonly string[], index: number): Step {
  const segment = segments[index] as string;
  const next = segments[index + 1];
  const value = childOf(walk.node, segment);
  if (segment === "schema") {
    return { path: [], child: value, length: 1, isSchema: true };
  }
  if (segment === "parameters" && next !== undefined && INDEX_RE.test(next)) {
    return parameterStep(walk, next);
  }
  // A header's `content` entries are typed at `headers/<name>/<media type>` (`headerType`).
  if (segment === "content" && segments[index - 2] === "headers") {
    const path = next === undefined ? [] : [next];
    return { path, child: childOf(value, next), length: 2, isSchema: false };
  }
  return { path: [segment], child: value, length: 1, isSchema: false };
}

function stepAt(walk: LocationWalk, pointer: RefPointer, index: number): Step {
  const { segments } = pointer;
  const segment = segments[index] as string;
  if (index < leadingSegmentsOf(pointer)) {
    const child = childOf(walk.node, segment);
    return { path: [segment], child, length: 1, isSchema: startsInSchema(pointer) };
  }
  return walk.isSchema
    ? schemaStep(walk.node, segment, segments[index + 1])
    : documentStep(walk, segments, index);
}

function refOf(node: unknown): string | null {
  return isJsonObject(node) && typeof node.$ref === "string" ? node.$ref : null;
}

/**
 * The walk at a crossed `$ref`'s target, through `$ref`s to `$ref`s. A cycle of `$ref`s has no
 * node; an external `$ref` keeps the pointer's own path.
 */
function crossed(
  walk: LocationWalk,
  ref: string,
  refs: RefResolver,
  seen: readonly string[],
): LocationWalk {
  if (seen.includes(ref)) {
    return { ...walk, node: undefined };
  }
  const target = walkTo(ref, refs, seen) ?? { ...walk, node: refs.resolve(ref) };
  const inner = refOf(target.node);
  return inner === null ? target : crossed(target, inner, refs, [...seen, ref]);
}

function walkTo(ref: string, refs: RefResolver, seen: readonly string[]): LocationWalk | null {
  const pointer = refPointerOf(ref);
  if (pointer === null || seen.includes(ref)) {
    return null;
  }
  const root = pointer.rootSegment;
  let walk: LocationWalk = {
    path: [root],
    node: refs.resolve(`#/${root}`),
    isSchema: false,
    isFromAdditionalProperties: false,
  };
  for (let index = 0; index < pointer.segments.length; ) {
    const step = stepAt(walk, pointer, index);
    index += step.length;
    walk = {
      path: [...walk.path, ...step.path],
      node: step.child,
      isSchema: step.isSchema,
      isFromAdditionalProperties: step.isFromAdditionalProperties === true,
    };
    const inner = refOf(walk.node);
    if (inner !== null && index < pointer.segments.length) {
      walk = crossed(walk, inner, refs, [...seen, ref]);
    }
  }
  return walk;
}

/** The location the generator types the node at `ref` with; see the module comment. */
export function generatedLocationOf(ref: string, refs: RefResolver): GeneratedLocation {
  const walk = walkTo(ref, refs, []);
  return {
    path: walk === null ? ref : createRef(walk.path),
    isFromAdditionalProperties: walk?.isFromAdditionalProperties ?? false,
  };
}
