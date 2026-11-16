import { irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { ParameterObject } from "../../../domain/openapi/parameter-object.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { isExplodedQueryObject } from "../document/exploded-query.js";
import { InvalidRefError, refType } from "../ref-type.js";
import type { RefResolver } from "../schema/schema-context.js";
import { AT_LOCATION, type SchemaRequest, type ValueAccess } from "../schema/schema-rule.js";
import {
  generatedLocationOf,
  type IsExplodedParameter,
  type RecordOwner,
} from "./generated-location.js";
import { hasInlineCycle } from "./inline-cycles.js";
import { followRefs, isJsonObject, type JsonObject } from "./located-node.js";
import { withoutOptionalUndefined } from "./optional-target.js";
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

/**
 * Whether the target can be written in place: a `$ref`, or a schema that is not written inside
 * itself (`hasInlineCycle`). The others keep the original type, which no check changes.
 */
function hasInlineType(ref: string, pointer: RefPointer, request: SchemaRequest): boolean {
  const { options, refs } = request.context;
  const target = pointerNode(pointer, refs);
  if (isJsonObject(target) && typeof target.$ref === "string") {
    return true;
  }
  return target !== undefined && !hasInlineCycle(ref, options, refs);
}

/** A `$ref`'s pointer and the schema to type for it: the node it points at, or what it replaced. */
interface PointedSchema {
  readonly ref: string;
  readonly pointer: RefPointer;
  readonly target: unknown;
}

/** The target of a pointer that crosses a segment with no type: its `$ref`, or its own type. */
function targetType(
  ref: string,
  pointer: RefPointer,
  request: SchemaRequest,
  seen: readonly string[],
) {
  return pointedSchemaType(
    { ref, pointer, target: pointerNode(pointer, request.context.refs) },
    request,
    seen,
  );
}

/** The type of the schema of a pointer, typed where the generator types the pointer's node. */
function pointedSchemaType(
  { ref, pointer, target }: PointedSchema,
  request: SchemaRequest,
  seen: readonly string[],
) {
  if (isJsonObject(target) && typeof target.$ref === "string") {
    return seen.includes(target.$ref) ? null : schemaRefType(target.$ref, request, [...seen, ref]);
  }
  if (target === undefined || hasInlineCycle(ref, request.context.options, request.context.refs)) {
    return null;
  }
  // Typed where the generator types the node, so it shares the node's enum (`--enum`).
  const location = generatedLocationOf(ref, request.context.refs, explodedParameters(request));
  return request.transformNested(
    target as never,
    { path: location.path, schema: target },
    {
      valueAccess: valueAccessOf(location.recordOwner, request),
      parent: tupleHolderOf(pointer, request.context.refs),
      isThroughRef: true,
      isAtSharedLocation: location.isShared,
      typePlacement: location.typePlacement,
    },
  );
}

/** The parameters whose keys are keys of `query` in this run (`exploded-query-objects`). */
function explodedParameters({ context }: SchemaRequest): IsExplodedParameter {
  if (!context.options.fixes.has(FIX.EXPLODED_QUERY_OBJECTS)) {
    return () => false;
  }
  return (parameter) =>
    isParameterObject(parameter) && isExplodedQueryObject(parameter, context.refs);
}

/** A parameter object as far as `isExplodedQueryObject` reads it; a `$ref` is none. */
function isParameterObject(node: unknown): node is ParameterObject {
  return isJsonObject(node) && typeof node.in === "string" && typeof node.name === "string";
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
  if (result.kind !== "typed") {
    return targetType(ref, pointer, request, seen);
  }
  return options.fixes.has(FIX.REF_POINTERS)
    ? withoutOptionalUndefined(result.walk.type, pointer, options, refs)
    : result.walk.type;
}

function isCorrected(pointer: RefPointer, request: SchemaRequest): boolean {
  const { options, refs } = request.context;
  return options.fixes.has(FIX.REF_POINTERS) || originalIndexFails({ pointer, options, refs });
}

function isNeverKeyword(type: IrType): boolean {
  return type.kind === "keyword" && type.keyword === "never";
}

/** The values of an `enum`, as JSON in sorted order; null for a schema without one. */
function enumKey(node: unknown): string | null {
  const values = isJsonObject(node) ? node.enum : undefined;
  return Array.isArray(values)
    ? JSON.stringify(values.map((value) => JSON.stringify(value)).sort())
    : null;
}

/** Whether a declared schema lists exactly the values of the enum that replaced it. */
function haveSameValues(declared: unknown, added: JsonObject): boolean {
  return enumKey(declared) === enumKey(added);
}

/**
 * The schema the document declares at the pointer, where the discriminator scan replaced it with
 * the enum of a mapped schema (`{ type: string }` replaced by `["dog"]`) that lists other values;
 * undefined for any other pointer. The injected value belongs to the member's type, not to the
 * property schema the pointer names, so the pointer is typed by that schema (ADR-026).
 */
function replacedTarget(pointer: RefPointer, request: SchemaRequest): unknown {
  const { refs, discriminators } = request.context;
  const target = pointerNode(pointer, refs);
  const replaced = isJsonObject(target) ? discriminators.replacedPropertyOf(target) : undefined;
  if (!isJsonObject(target) || replaced === undefined) {
    return undefined;
  }
  return haveSameValues(followRefs(replaced, refs), target) ? undefined : replaced;
}

/** The type of a schema `$ref`. Throws InvalidRefError when the `$ref` has no pointer. */
export function schemaRefType(
  ref: string,
  request: SchemaRequest,
  seen: readonly string[] = [],
): IrType {
  const pointer = pointerOf(ref);
  if (pointer.segments.length <= leadingSegmentsOf(pointer)) {
    return refType(ref);
  }
  const replaced = replacedTarget(pointer, request);
  if (replaced !== undefined) {
    return pointedSchemaType({ ref, pointer, target: replaced }, request, seen) ?? refType(ref);
  }
  const checks = request.context.pointerChecks;
  if (checks?.isInPlace(ref)) {
    // An earlier pass found this pointer type to be an error or to have no value. A target
    // without a value either (a `false` schema) keeps the type written before.
    const inPlace = targetType(ref, pointer, request, seen);
    const isNoValueEither = inPlace === null || isNeverKeyword(inPlace);
    if (!(checks.isNeverRead(ref) && isNoValueEither)) {
      return inPlace ?? refType(ref);
    }
  }
  const type = isCorrected(pointer, request)
    ? (correctedType(ref, pointer, request, seen) ?? refType(ref))
    : refType(ref);
  if (checks !== undefined && hasInlineType(ref, pointer, request)) {
    checks.record(ref, type);
  }
  return type;
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
