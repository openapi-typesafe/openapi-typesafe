import type { IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { unionOf, withRequiredKeys } from "../type-combinators.js";
import { isKeptProperty } from "./object-type.js";
import { requiredOnlyKeys } from "./required-only-variant.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * The `anyof-oneof-required` fix. `anyOf: [{ required: [a] }, { required: [b] }]` next to
 * `properties` says which of the properties must be there. Each such variant has no type of its
 * own (`unknown`), so the original gives `Props | unknown`, which is `unknown`. With the fix each
 * variant is the parent with its keys required:
 * `WithRequired<Props, "a"> | WithRequired<Props, "b">`.
 */

/** Whether the schema's type is an object: no `type`, `object`, or a list with `object`. */
function isObjectTyped(schema: SchemaObject): boolean {
  const { type } = schema;
  return (
    type === undefined || type === "object" || (Array.isArray(type) && type.includes("object"))
  );
}

/** The variants' key lists, or null unless each requires only properties the type keeps. */
function requiredKeyLists(
  schema: SchemaObject,
  variants: readonly Schema[],
  request: SchemaRequest,
): (readonly string[])[] | null {
  const keyLists = variants.map(requiredOnlyKeys);
  // A key of a property the type leaves out (`--exclude-deprecated`) is no key of `WithRequired`.
  const isApplicable =
    keyLists.length > 0 &&
    keyLists.every((keys) => keys?.every((key) => isKeptProperty(schema, key, request)) === true);
  return isApplicable ? (keyLists as (readonly string[])[]) : null;
}

/** Whether the fix gives `variants` of the schema their keys of its properties. */
export function hasRequiredVariants(
  schema: SchemaObject,
  variants: readonly Schema[],
  request: SchemaRequest,
): boolean {
  return (
    request.context.options.fixes.has(FIX.ANYOF_ONEOF_REQUIRED) &&
    isObjectTyped(schema) &&
    requiredKeyLists(schema, variants, request) !== null
  );
}

/**
 * The union of the parent type with each variant's keys required, or null where the fix is off
 * or the variants are not all required-only ones over the parent's own, kept properties. Only an
 * object has the keys. For a `type` list, the `object` member has required them already
 * (`multipleTypes`), so the list is the whole type.
 */
export function requiredVariantsType(
  previous: IrType | null,
  schema: SchemaObject,
  variants: readonly Schema[],
  request: SchemaRequest,
): IrType | null {
  if (!request.context.options.fixes.has(FIX.ANYOF_ONEOF_REQUIRED) || previous === null) {
    return null;
  }
  const keyLists = isObjectTyped(schema) ? requiredKeyLists(schema, variants, request) : null;
  if (keyLists === null) {
    return null;
  }
  if (Array.isArray(schema.type)) {
    return previous;
  }
  request.context.footer.requireWithRequired();
  return unionOf(keyLists.map((keys) => withRequiredKeys(previous, keys)));
}
