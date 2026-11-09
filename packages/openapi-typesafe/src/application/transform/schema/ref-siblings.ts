import { SCHEMA_DIALECTS } from "../../../domain/openapi/schema-dialect.js";
import type {
  ReferenceSchema,
  Schema,
  SchemaObject,
} from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type { SchemaOptions } from "./schema-context.js";

/**
 * The `ref-siblings` fix (ADR-021 amendment 2, RC4 G16): in JSON Schema 2020-12 (OpenAPI 3.1 and
 * 3.2) the keywords next to a `$ref` apply too, so `{ $ref: Base, required: [extra], properties:
 * { extra } }` is a `Base` that also has a required `extra`. That is what `allOf: [{ $ref: Base }]`
 * next to the same keywords means, so the schema is typed as that `allOf`, with every rule the
 * generator has for `allOf` and its siblings (`WithRequired`, intersections).
 */

/**
 * Keywords that only annotate (JSON Schema 2020-12 meta-data, format-annotation and content
 * vocabularies, OpenAPI fixed fields), or that change no type on their own (`discriminator`
 * without `oneOf`). Next to a `$ref` they stay where they were, so the output keeps the plain
 * reference with its comment. Extension keywords (`x-…`) count as annotations too.
 */
const ANNOTATION_KEYWORDS: ReadonlySet<string> = new Set([
  "$anchor",
  "$comment",
  "$defs",
  "$dynamicAnchor",
  "$id",
  "$ref",
  "$schema",
  "contentEncoding",
  "contentMediaType",
  "default",
  "deprecated",
  "description",
  "discriminator",
  "example",
  "examples",
  "externalDocs",
  "format",
  "readOnly",
  "title",
  "writeOnly",
  "xml",
]);

const EXTENSION_PREFIX = "x-";

function hasRef(schema: SchemaObject): schema is SchemaObject & ReferenceSchema {
  return typeof (schema as Partial<ReferenceSchema>).$ref === "string";
}

function isTypeKeyword(keyword: string): boolean {
  return !ANNOTATION_KEYWORDS.has(keyword) && !keyword.startsWith(EXTENSION_PREFIX);
}

/**
 * A `$ref` schema as the `allOf` it means, or null where nothing changes: a schema without `$ref`,
 * no fix, an OpenAPI 3.0 document, or no sibling that changes the type. The result has no
 * `$ref`, so the shape rules type it as `enum`, `const` or a composition.
 */
export function refWithSiblingsAsAllOf(
  schema: SchemaObject,
  options: SchemaOptions,
): SchemaObject | null {
  const isApplied =
    options.fixes.has(FIX.REF_SIBLINGS) &&
    options.schemaDialect === SCHEMA_DIALECTS.JSON_SCHEMA_2020_12;
  if (!isApplied || !hasRef(schema) || !Object.keys(schema).some(isTypeKeyword)) {
    return null;
  }
  const { $ref, allOf = [], ...siblings } = schema;
  const members: readonly Schema[] = [{ $ref }, ...allOf];
  return { ...siblings, allOf: members };
}
