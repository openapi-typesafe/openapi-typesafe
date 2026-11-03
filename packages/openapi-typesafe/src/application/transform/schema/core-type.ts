import { irKeyword, irReference, irUnion } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { isRawBinarySchema } from "../../../domain/openapi/binary-content.js";
import type {
  Schema,
  SchemaObject,
  SchemaTypeName,
} from "../../../domain/openapi/schema-object.js";
import { unionOf } from "../type-combinators.js";
import { arrayType } from "./array-type.js";
import { objectType } from "./object-type.js";
import type { SchemaRequest, SchemaRule } from "./schema-rule.js";

const PRIMITIVE_TYPE_NAMES: ReadonlySet<SchemaTypeName | null> = new Set([
  "boolean",
  "string",
  "number",
  "integer",
  "null",
]);

/** Each `type` of a list becomes a union member; one already listed in `oneOf` is skipped. */
function multipleTypes(schema: SchemaObject, request: SchemaRequest): IrType {
  const typeNames = schema.type as readonly (SchemaTypeName | null)[];
  const { oneOf } = schema;
  const members: IrType[] = [];
  for (const typeName of typeNames) {
    const isInOneOf =
      Array.isArray(oneOf) &&
      PRIMITIVE_TYPE_NAMES.has(typeName) &&
      oneOf.some(
        (variant) => typeof variant === "object" && "type" in variant && variant.type === typeName,
      );
    if (isInOneOf) {
      continue;
    }
    // With oneOf, the member drops it, so oneOf is not applied once per member.
    const variant = Array.isArray(oneOf)
      ? { ...schema, type: typeName, oneOf: undefined }
      : { ...schema, type: typeName };
    members.push(
      typeName === "null" || typeName === null
        ? irKeyword("null")
        : request.transformNested(variant as Schema, request.location),
    );
  }
  return unionOf(members);
}

function keywordRule(
  name: string,
  typeNames: readonly string[],
  keyword: "null" | "number" | "boolean",
): SchemaRule {
  return {
    name,
    matches: (schema) => typeNames.includes(schema.type as string),
    transform: () => irKeyword(keyword),
  };
}

/** The global type of raw binary data with `--binary-as-blob` (DOM lib, `@types/node`). */
const BLOB_TYPE_NAME = "Blob";

function isBinaryAsBlob(schema: SchemaObject, request: SchemaRequest): boolean {
  return request.context.options.binaryAsBlob && isRawBinarySchema(schema);
}

function stringType(schema: SchemaObject, request: SchemaRequest): IrType {
  return isBinaryAsBlob(schema, request) ? irReference(BLOB_TYPE_NAME) : irKeyword("string");
}

/** Rules for schemas with a `type`, in the original order. */
const TYPED_RULES: readonly SchemaRule[] = [
  keywordRule("null", ["null"], "null"),
  { name: "string", matches: (schema) => schema.type === "string", transform: stringType },
  keywordRule("number", ["number", "integer"], "number"),
  keywordRule("boolean", ["boolean"], "boolean"),
  { name: "array", matches: (schema) => schema.type === "array", transform: arrayType },
  {
    name: "multiple types",
    matches: (schema) => Array.isArray(schema.type),
    transform: multipleTypes,
  },
];

/** The `transform` callback's type; a `questionToken` adds `undefined` here. */
function customType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  const custom = request.context.callbacks.transform(schema, request.location);
  if (custom === null) {
    return null;
  }
  return custom.isOptional ? irUnion([custom.type, irKeyword("undefined")]) : custom.type;
}

/**
 * The schema without composition keywords: the `transform` callback, then a typed rule, then raw
 * binary without `type` (OpenAPI 3.1 allows leaving it out), then the object keywords. Null means
 * the schema has no type of its own.
 */
export function coreType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  if ("type" in schema && schema.type) {
    const custom = customType(schema, request);
    if (custom !== null) {
      return custom;
    }
    const rule = TYPED_RULES.find((candidate) => candidate.matches(schema));
    if (rule !== undefined) {
      return rule.transform(schema, request);
    }
  } else if (isBinaryAsBlob(schema, request)) {
    return irReference(BLOB_TYPE_NAME);
  }
  return objectType(schema, request);
}
