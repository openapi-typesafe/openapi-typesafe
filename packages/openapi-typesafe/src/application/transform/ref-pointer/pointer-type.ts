import { irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { OutputFix } from "../../../domain/output-fixes.js";
import { InvalidRefError, refType } from "../ref-type.js";
import type { SchemaRequest } from "../schema/schema-rule.js";
import { generatedLocationOf } from "./generated-location.js";
import { isJsonObject } from "./generated-shape.js";
import { hasInlineCycle } from "./inline-cycles.js";
import { originalIndexFails } from "./original-index.js";
import { leadingSegmentsOf, pointerNode, type RefPointer, refPointerOf } from "./pointer-walk.js";
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
    location.isFromAdditionalProperties,
  );
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
  return (
    options.fixes.has(OutputFix.REF_POINTERS) || originalIndexFails({ pointer, options, refs })
  );
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
