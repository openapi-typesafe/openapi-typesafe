import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type { SchemaContext } from "./schema-context.js";

/** Whether a property is `readOnly` or `writeOnly` (JSON Schema 2020-12 Validation §9.4). */
export interface AccessFlags {
  readonly isReadOnly: boolean;
  readonly isWriteOnly: boolean;
}

const NO_FLAGS: AccessFlags = { isReadOnly: false, isWriteOnly: false };

function ownFlags(schema: SchemaObject): AccessFlags {
  return { isReadOnly: Boolean(schema.readOnly), isWriteOnly: Boolean(schema.writeOnly) };
}

function merged(left: AccessFlags, right: AccessFlags): AccessFlags {
  return {
    isReadOnly: left.isReadOnly || right.isReadOnly,
    isWriteOnly: left.isWriteOnly || right.isWriteOnly,
  };
}

/**
 * The flags of a schema and of the schemas that always apply to the same value: the one its
 * `$ref` names and its `allOf` members, followed until a schema repeats. `readOnly` is an
 * annotation, and the annotations of those schemas are the value's (2020-12 Core §7.7.1); in
 * OpenAPI 3.0 a referenced schema is the property's definition. `anyOf` and `oneOf` members apply
 * only when they match, which the type cannot tell, so they are not read.
 */
function appliedFlags(
  schema: Schema | undefined,
  context: SchemaContext,
  seen: ReadonlySet<Schema>,
): AccessFlags {
  if (typeof schema !== "object" || schema === null || seen.has(schema)) {
    return NO_FLAGS;
  }
  const inner = new Set([...seen, schema]);
  // `readOnly` next to a `$ref` is read too, as the generator always has.
  const object = schema as SchemaObject & { readonly $ref?: unknown };
  const target =
    typeof object.$ref === "string" ? (context.refs.resolve(object.$ref) as Schema) : undefined;
  return (object.allOf ?? []).reduce<AccessFlags>(
    (flags, member) => merged(flags, appliedFlags(member, context, inner)),
    merged(ownFlags(object), appliedFlags(target, context, inner)),
  );
}

/**
 * The flags of a property schema. Without the `read-write-refs` fix only the keywords written on
 * it count, as in openapi-typescript; with it, also those of the schemas its `$ref` and `allOf`
 * apply (upstream #1938).
 */
export function propertyAccessFlags(value: Schema, context: SchemaContext): AccessFlags {
  if (typeof value !== "object") {
    return NO_FLAGS;
  }
  if (!context.options.fixes.has(FIX.READ_WRITE_REFS)) {
    return ownFlags(value as SchemaObject);
  }
  return appliedFlags(value, context, new Set());
}
