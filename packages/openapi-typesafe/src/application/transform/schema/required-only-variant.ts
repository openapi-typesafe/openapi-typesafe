import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";

/**
 * A variant of only `required` keys (and annotations), as the `anyof-oneof-required` fix reads
 * it. Its own module, so the `$ref` pointer walk reads it without the transform modules.
 */

/** Keywords that do not change a value's type: a variant of these and `required` counts. */
const ANNOTATION_KEYS: ReadonlySet<string> = new Set(["required", "description", "title"]);

/** The `required` keys of a variant that has nothing else, or null for any other variant. */
export function requiredOnlyKeys(variant: Schema): readonly string[] | null {
  if (typeof variant !== "object" || variant === null || "$ref" in variant) {
    return null;
  }
  const { required } = variant as SchemaObject;
  const isRequiredOnly = Object.keys(variant).every((key) => ANNOTATION_KEYS.has(key));
  return isRequiredOnly && Array.isArray(required) && required.length > 0 ? required : null;
}
