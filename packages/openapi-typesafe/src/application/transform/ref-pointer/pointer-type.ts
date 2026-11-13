import { irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { InvalidRefError, refType } from "../ref-type.js";
import type { RefResolver } from "../schema/schema-context.js";
import { AT_LOCATION, type SchemaRequest, type ValueAccess } from "../schema/schema-rule.js";
import { generatedLocationOf, type RecordOwner } from "./generated-location.js";
import { hasInlineCycle } from "./inline-cycles.js";
import { followRefs, isJsonObject } from "./located-node.js";
import { originalIndexFails } from "./original-index.js";
import { leadingSegmentsOf, pointerNode, type RefPointer, refPointerOf } from "./pointer-walk.js";
import { isWidenedRecordValue } from "./property-shape.js";
import { typedWalk } from "./typed-walk.js";

/**
 * The type of a schema `$ref` (ADR-026). The original indexed every segment of the pointer by
 * name (`refType`), also schema keywords the generated types do not have (`["schema"]`,
 * `["items"]`, `["allOf"]["0"]`), and did not look through optional or nullable values. Where that
 * type does not compile, the `$ref` now gets the type of what it points at; where it compiles
 * (through an index signature), it stays, and the `ref-pointers` fix gives the right type there.
 */

function pointerOf(ref: string): RefPointer {
  const pointer = refPointerOf(ref);
  if (pointer === null) {
    throw new InvalidRefError(ref);
  }
  return pointer;
}

/** The keywords whose list of schemas makes a tuple (`arrayType`). */
const TUPLE_KEYWORDS: ReadonlySet<string> = new Set(["prefixItems", "items"]);
const INDEX_RE = /^\d+$/;

/**
 * The schema whose tuple holds the target as an element (`…/prefixItems/1`), so the target is
 * typed as the element it is and shares its `--enum`; undefined for any other target.
 */
function tupleHolderOf(pointer: RefPointer, refs: RefResolver): SchemaObject | undefined {
  const { segments } = pointer;
  const isElement =
    TUPLE_KEYWORDS.has(segments.at(-2) ?? "") && INDEX_RE.test(segments.at(-1) ?? "");
  if (!isElement) {
    return undefined;
  }
  const holder = followRefs(
    pointerNode({ ...pointer, segments: segments.slice(0, -2) }, refs),
    refs,
  );
  return isJsonObject(holder) ? (holder as SchemaObject) : undefined;
}

/** The target of a pointer that crosses a segment with no type: its `$ref`, or its own type. */
function targetType(
  ref: string,
  pointer: RefPointer,
  request: SchemaRequest,
  seen: readonly string[],
) {
  const target = pointerNode(pointer, request.context.refs);
  if (isJsonObject(target) && typeof target.$ref === "string") {
    return seen.includes(target.$ref) ? null : schemaRefType(target.$ref, request, [...seen, ref]);
  }
  if (target === undefined || hasInlineCycle(ref, request.context.options, request.context.refs)) {
    return null;
  }
  // Typed where the generator types the node, so it shares the node's enum (`--enum`).
  const location = generatedLocationOf(ref, request.context.refs);
  return request.transformNested(
    target as never,
    { path: location.path, schema: target },
    valueAccessOf(location.recordOwner, request),
    tupleHolderOf(pointer, request.context.refs),
  );
}

/** How a target's type is read at its location, as `objectType` passes it down. */
function valueAccessOf(owner: RecordOwner | null, request: SchemaRequest): ValueAccess {
  if (owner === null) {
    return AT_LOCATION;
  }
  const { options, refs } = request.context;
  const isWidened = isWidenedRecordValue(owner.node, owner.keyword, options, refs);
  return isWidened ? "none" : "string-index";
}

function correctedType(
  ref: string,
  pointer: RefPointer,
  request: SchemaRequest,
  seen: readonly string[],
) {
  const { options, refs } = request.context;
  const result = typedWalk({ pointer, options, refs });
  return result.kind === "typed" ? result.walk.type : targetType(ref, pointer, request, seen);
}

function isCorrected(pointer: RefPointer, request: SchemaRequest): boolean {
  const { options, refs } = request.context;
  return options.fixes.has(FIX.REF_POINTERS) || originalIndexFails({ pointer, options, refs });
}

/** The type of a schema `$ref`. Throws InvalidRefError when the `$ref` has no pointer. */
export function schemaRefType(
  ref: string,
  request: SchemaRequest,
  seen: readonly string[] = [],
): IrType {
  const pointer = pointerOf(ref);
  if (pointer.segments.length <= leadingSegmentsOf(pointer) || !isCorrected(pointer, request)) {
    return refType(ref);
  }
  return correctedType(ref, pointer, request, seen) ?? refType(ref);
}

/**
 * The type of a `$ref` that `WithRequired` takes. A `$ref` to an optional or nullable value has
 * no keys (`keyof (T | undefined)` is `never`), so it is wrapped in `NonNullable` (TS2344).
 */
export function requirableRefType(ref: string, type: IrType, request: SchemaRequest): IrType {
  const { options, refs } = request.context;
  const result = typedWalk({ pointer: pointerOf(ref), options, refs });
  const isAbsent = result.kind === "typed" && result.walk.presence === "absent";
  return isAbsent ? irReference("NonNullable", [type]) : type;
}
