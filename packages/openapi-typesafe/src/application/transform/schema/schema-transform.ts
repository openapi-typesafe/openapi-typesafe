import { ERROR_CODES, OpenAPITypesafeError } from "../../../domain/errors.js";
import { irKeyword } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { literalType } from "../literal-type.js";
import { schemaRefType } from "../ref-pointer/pointer-type.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { compositionType } from "./composition-type.js";
import { enumRule } from "./enum-rule.js";
import { refWithSiblingsAsAllOf } from "./ref-siblings.js";
import type { SchemaContext, SchemaLocation } from "./schema-context.js";
import type { SchemaRequest, SchemaRule } from "./schema-rule.js";

export class InvalidSchemaError extends OpenAPITypesafeError {
  constructor(schema: unknown, path: string | undefined) {
    const received = Array.isArray(schema) ? "Array" : typeof schema;
    super({
      code: ERROR_CODES.SCHEMA_OBJECT_INVALID,
      message: `Expected SchemaObject, received ${received} at ${path}`,
      details: { path, received },
    });
    this.name = "InvalidSchemaError";
  }
}

/** Shape rules in the original precedence; composition handles everything they do not match. */
const SHAPE_RULES: readonly SchemaRule[] = [
  {
    name: "$ref",
    matches: (schema) => "$ref" in schema,
    transform: (schema, request) => schemaRefType((schema as { $ref: string }).$ref, request),
  },
  {
    name: "const",
    // `const: null` is the value null (JSON Schema §6.1.3); the original read it as no `const`.
    matches: (schema) => schema.const !== undefined,
    transform: (schema) => literalType(schema.const),
  },
  enumRule,
];

/** A schema checked for its input shape, or the type of a non-object schema. */
type CheckedSchema = { readonly type: IrType } | { readonly schema: SchemaObject };

/** A missing schema is `never`; `true` allows anything; other non-objects are invalid. */
function checkSchema(schema: unknown, path: string | undefined): CheckedSchema {
  if (!schema) {
    return { type: irKeyword("never") };
  }
  if (schema === true) {
    return { type: UNKNOWN_TYPE };
  }
  if (Array.isArray(schema) || typeof schema !== "object") {
    throw new InvalidSchemaError(schema, path);
  }
  return { schema: schema as SchemaObject };
}

function request(
  location: SchemaLocation,
  context: SchemaContext,
  isFromAdditionalProperties: boolean,
): SchemaRequest {
  return {
    location,
    context,
    isFromAdditionalProperties,
    transformNested: (schema, nestedLocation, isNestedFromAdditionalProperties = false) =>
      transformSchema(schema, nestedLocation, context, isNestedFromAdditionalProperties),
  };
}

/**
 * Transform a schema without the `postTransform` callback (the original
 * `transformSchemaObjectWithComposition`). Nested schemas still get `postTransform`.
 */
export function transformSchemaShape(
  schema: Schema | null | undefined,
  location: SchemaLocation,
  context: SchemaContext,
  isFromAdditionalProperties = false,
): IrType {
  const checked = checkSchema(schema, location.path);
  if ("type" in checked) {
    return checked.type;
  }
  const current = request(location, context, isFromAdditionalProperties);
  const shaped = refWithSiblingsAsAllOf(checked.schema, context.options) ?? checked.schema;
  const rule = SHAPE_RULES.find((candidate) => candidate.matches(shaped));
  return rule ? rule.transform(shaped, current) : compositionType(shaped, current);
}

/** Transform a schema to IR, then apply `postTransform` (the original `transformSchemaObject`). */
export function transformSchema(
  schema: Schema | null | undefined,
  location: SchemaLocation,
  context: SchemaContext,
  isFromAdditionalProperties = false,
): IrType {
  const type = transformSchemaShape(schema, location, context, isFromAdditionalProperties);
  return context.callbacks.postTransform(type, location) ?? type;
}
