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
function patchAllOf(allOf: (SchemaObject | ReferenceObject)[], patch: EnumPatch): AddedEnum {
  const added = discriminatorEnum(patch.values);
  allOf.push({
    type: "object",
    required: [patch.discriminator.propertyName],
    properties: { [patch.discriminator.propertyName]: added },
  });
  return { added };
}

/** An added enum, and the property schema it replaced in the document, if there was one. */
export interface AddedEnum {
  readonly added: SchemaObject;
  readonly replaced?: unknown;
}

/** An object schema gets the enum property, which is always required, added or replaced. */
function patchObjectSchema(schema: SchemaObject & ObjectSubtype, patch: EnumPatch): AddedEnum {
  const name = patch.discriminator.propertyName;
  if (!schema.properties) {
    schema.properties = {};
  }
  if (!schema.required) {
    schema.required = [name];
  } else if (!schema.required.includes(name)) {
    schema.required.push(name);
  }
  const replaced: unknown = schema.properties[name];
  const added = discriminatorEnum(patch.values, replaced as SchemaObject | undefined);
  schema.properties[name] = added;
  return replaced === undefined ? { added } : { added, replaced };
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

/** A property schema that lists a discriminator's values, and the schema object it is in. */
export interface DeclaredValues {
  readonly holder: SchemaObject & ObjectSubtype;
  readonly property: SchemaObject;
}

/** The property of one schema object that allows exactly the values, required or not. */
function declaredIn(
  schema: unknown,
  name: string,
  values: readonly string[],
): DeclaredValues | null {
  if (typeof schema !== "object" || schema === null || "$ref" in schema) {
    return null;
  }
  const holder = schema as SchemaObject & ObjectSubtype;
  const property = holder.properties?.[name];
  const listed = listedValues(property);
  const isExact =
    listed !== null &&
    listed.length === values.length &&
    values.every((value) => listed.includes(value));
  return isExact ? { holder, property: property as SchemaObject } : null;
}

/**
 * The properties of `schema` and of its inline `allOf` items that already list exactly the
 * patch's values, with an `enum` or a `const` (the `discriminator-values` fix): a patch would
 * only add a second property of that value (#2124), whose type may differ from the declared ones.
 */
export function declaredValues(
  schema: SchemaObject | undefined,
  patch: EnumPatch,
): readonly DeclaredValues[] {
  const name = patch.discriminator.propertyName;
  return [schema, ...(schema?.allOf ?? [])].flatMap(
    (item) => declaredIn(item, name, patch.values) ?? [],
  );
}

/**
 * Make a declared discriminator property required where it is declared: the discriminator
 * requires it, and the scan adds no property that would require it instead.
 */
export function requireDeclared(declared: DeclaredValues, name: string): void {
  const { holder } = declared;
  holder.required = [...new Set([...(holder.required ?? []), name])];
}

/**
 * Add or replace the enum property in `schema`, an `allOf` or object schema. Returns the added
 * enum schema and the one it replaced, or null for another kind of schema, which is left as it is.
 */
export function addEnumProperty(
  schema: SchemaObject | undefined,
  patch: EnumPatch,
): AddedEnum | null {
  if (schema?.allOf) {
    return patchAllOf(schema.allOf, patch);
  }
  return isObjectSchema(schema) ? patchObjectSchema(schema, patch) : null;
}
