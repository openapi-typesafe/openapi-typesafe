import {
  irKeyword,
  irObject,
  irReference,
  irStringIndexSignature,
} from "../../../domain/ir/constructors.js";
import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { HELPER_TYPES } from "../helper-types.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { unionOf } from "../type-combinators.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * The `unevaluated-properties` fix (ADR-021, roadmap R11; upstream #2839, #2880). Without it
 * `unevaluatedProperties` is ignored, so its value type is lost and an object with only that
 * keyword is `Record<string, never>`. With it the composed type is intersected with an index
 * signature, as `additionalProperties` gives: every key that no other keyword declares has the
 * `unevaluatedProperties` type. TypeScript checks that index signature against every key of a
 * value, declared ones included, so its type also holds the types of the declared properties
 * (of this schema and of its `allOf`, `anyOf` and `oneOf` members); otherwise a valid value would
 * not be assignable. `false` adds nothing, like `additionalProperties: false`: TypeScript has no
 * closed object type.
 */

/**
 * Whether `unevaluatedProperties` applies. It types the keys left over at this level, so it
 * does nothing next to `additionalProperties` (which already types them all), and only an object
 * schema has keys. A `type` list is typed one listed type at a time, so its object gets it.
 */
function unevaluatedSchemaOf(schema: SchemaObject, request: SchemaRequest): Schema | null {
  const { unevaluatedProperties } = schema;
  if (
    !request.context.options.fixes.has(FIX.UNEVALUATED_PROPERTIES) ||
    unevaluatedProperties === undefined ||
    unevaluatedProperties === false ||
    schema.additionalProperties !== undefined
  ) {
    return null;
  }
  return schema.type === undefined || schema.type === "object" ? unevaluatedProperties : null;
}

function isAnySchema(schema: Schema): boolean {
  return schema === true || (typeof schema === "object" && Object.keys(schema).length === 0);
}

function memberValueTypes(member: IrMember): IrType[] {
  if (member.kind === "indexSignature") {
    return [member.type];
  }
  return member.isOptional ? [member.type, irKeyword("undefined")] : [member.type];
}

/**
 * The value types a key of the composed type can have, read from its IR: the members of object
 * types, through unions and intersections. A reference (a `$ref`, `Omit`, `WithRequired`) or a raw
 * type is read with `PropertyValues`. Primitives, literals and arrays declare no keys.
 */
function declaredValueTypes(type: IrType, request: SchemaRequest): IrType[] {
  switch (type.kind) {
    case "object":
      return type.members.flatMap(memberValueTypes);
    case "union":
    case "intersection":
      return type.types.flatMap((member) => declaredValueTypes(member, request));
    case "reference":
    case "indexedAccess":
    case "raw":
      request.context.footer.requirePropertyValues();
      return [irReference(HELPER_TYPES.propertyValues.name, [type])];
    case "keyword":
    case "stringLiteral":
    case "numberLiteral":
    case "booleanLiteral":
    case "array":
    case "tuple":
    case "readonly":
      return [];
  }
}

/**
 * The index signature object for `unevaluatedProperties`, given the composed type of the other
 * keywords (null when there is none). Null when the fix is off or the keyword does not apply.
 */
export function unevaluatedPropertiesType(
  schema: SchemaObject,
  composed: IrType | null,
  request: SchemaRequest,
): IrType | null {
  const unevaluated = unevaluatedSchemaOf(schema, request);
  if (unevaluated === null) {
    return null;
  }
  const valueTypes = isAnySchema(unevaluated)
    ? [UNKNOWN_TYPE]
    : [
        request.transformNested(unevaluated, request.location, true),
        ...(composed === null ? [] : declaredValueTypes(composed, request)),
      ];
  const { immutable } = request.context.options;
  return irObject([irStringIndexSignature("key", unionOf(valueTypes), immutable)]);
}
