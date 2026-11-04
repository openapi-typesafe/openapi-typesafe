import type {
  DiscriminatorObject,
  ObjectSubtype,
  ReferenceObject,
  SchemaObject,
} from "../types.js";

/**
 * The in-place patch of the discriminator pre-pass: a mapped schema gets a required enum property
 * with its discriminator values, so that TypeScript can narrow the generated union.
 */

/** One mapped schema to patch: `ref` is the schema; `discriminatorRef` owns the discriminator. */
export interface EnumPatch {
  readonly ref: string;
  readonly values: string[];
  readonly discriminator: DiscriminatorObject;
  readonly discriminatorRef: string;
}

function discriminatorEnum(values: string[], previous?: SchemaObject): SchemaObject {
  return {
    type: "string",
    enum: values,
    description: previous?.description
      ? `${previous.description} (enum property replaced by openapi-typesafe)`
      : "discriminator enum property added by openapi-typesafe",
  };
}

/** An `allOf` schema gets one more item that holds the required enum property. */
function patchAllOf(allOf: (SchemaObject | ReferenceObject)[], patch: EnumPatch): SchemaObject {
  const added = discriminatorEnum(patch.values);
  allOf.push({
    type: "object",
    required: [patch.discriminator.propertyName],
    properties: { [patch.discriminator.propertyName]: added },
  });
  return added;
}

/** An object schema gets the enum property, which is always required, added or replaced. */
function patchObjectSchema(schema: SchemaObject & ObjectSubtype, patch: EnumPatch): SchemaObject {
  const name = patch.discriminator.propertyName;
  if (!schema.properties) {
    schema.properties = {};
  }
  if (!schema.required) {
    schema.required = [name];
  } else if (!schema.required.includes(name)) {
    schema.required.push(name);
  }
  const added = discriminatorEnum(patch.values, schema.properties[name] as SchemaObject);
  schema.properties[name] = added;
  return added;
}

function isObjectSchema(schema: unknown): schema is SchemaObject & ObjectSubtype {
  return (
    typeof schema === "object" && schema !== null && "type" in schema && schema.type === "object"
  );
}

/** The values a property schema allows, from `const` or `enum`; null when it lists none. */
function listedValues(property: unknown): readonly unknown[] | null {
  if (typeof property !== "object" || property === null) {
    return null;
  }
  const { const: constant, enum: values } = property as SchemaObject;
  if (constant !== undefined) {
    return [constant];
  }
  return Array.isArray(values) ? values : null;
}

/** Whether one schema object requires the property and allows exactly the values. */
function requiresValues(schema: unknown, name: string, values: readonly string[]): boolean {
  if (typeof schema !== "object" || schema === null || "$ref" in schema) {
    return false;
  }
  const { required, properties } = schema as SchemaObject & ObjectSubtype;
  const listed = listedValues(properties?.[name]);
  return (
    Boolean(required?.includes(name)) &&
    listed !== null &&
    listed.length === values.length &&
    values.every((value) => listed.includes(value))
  );
}

/**
 * Whether `schema`, or an inline `allOf` item of it, already requires the discriminator property
 * with exactly the patch's values (the `discriminator-declared-value` fix). Then a patch would
 * only repeat it (#2124).
 */
export function declaresValues(schema: SchemaObject | undefined, patch: EnumPatch): boolean {
  const name = patch.discriminator.propertyName;
  return [schema, ...(schema?.allOf ?? [])].some((item) =>
    requiresValues(item, name, patch.values),
  );
}

/**
 * Add or replace the enum property in `schema`, an `allOf` or object schema. Returns the added
 * enum schema, or null for another kind of schema, which is left as it is.
 */
export function addEnumProperty(
  schema: SchemaObject | undefined,
  patch: EnumPatch,
): SchemaObject | null {
  if (schema?.allOf) {
    return patchAllOf(schema.allOf, patch);
  }
  return isObjectSchema(schema) ? patchObjectSchema(schema, patch) : null;
}
