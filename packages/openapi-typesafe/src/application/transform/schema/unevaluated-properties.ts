import { irObject, irStringIndexSignature } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { declaredValueTypes } from "../declared-value-types.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { unionOf } from "../type-combinators.js";
import { recordValueAccess } from "./object-type.js";
import type { SchemaRequest } from "./schema-rule.js";
import { unevaluatedSchemaOf } from "./unevaluated-schema.js";

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

/** `true` or `{}`: the index signature is `unknown`, with no declared types next to it. */
function isAnySchema(schema: Schema): boolean {
  return schema === true || (typeof schema === "object" && Object.keys(schema).length === 0);
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
  const unevaluated = unevaluatedSchemaOf(schema, request.context.options);
  if (unevaluated === null) {
    return null;
  }
  const valueTypes = isAnySchema(unevaluated)
    ? [UNKNOWN_TYPE]
    : [
        request.transformNested(
          unevaluated,
          request.location,
          recordValueAccess(schema, "unevaluatedProperties", request),
        ),
        ...(composed === null ? [] : declaredValueTypes(composed, request.context.footer)),
      ];
  const { immutable } = request.context.options;
  return irObject([irStringIndexSignature("key", unionOf(valueTypes), immutable)]);
}
