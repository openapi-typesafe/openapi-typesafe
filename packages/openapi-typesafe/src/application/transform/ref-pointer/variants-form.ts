import { FIX } from "../../../domain/output-fixes.js";
import { requiredOnlyKeys } from "../schema/required-only-variant.js";
import type { SchemaOptions } from "../schema/schema-context.js";
import { childLocation, isJsonObject, type JsonObject, type LocatedNode } from "./located-node.js";
import { leadingSegmentsOf, refPointerOf } from "./pointer-walk.js";
import { hasObjectKeywords, isObjectShape } from "./schema-shape.js";

/**
 * The parts of a composed schema as the `$ref` pointer walk reads them: `allOf` items, own
 * keywords and `anyOf` / `oneOf` variants, and how the generator joins them.
 */

/**
 * How the generator joins a schema's own keywords and `allOf` items (its base) with its `anyOf`
 * or `oneOf` variants (`variantsType`), as the `$ref` pointer walk reads it (ADR-026):
 * - `intersection`: `Base & (A | B)`, for `oneOf` with a variant that is no primitive, and for
 *   `anyOf` with `anyof-properties`;
 * - `union`: `Base | A | B`, for `anyOf` without that fix, as in the original, and for `oneOf`
 *   of primitives only (`oneOfType`);
 * - `unknown`: any other form (both keywords, a `type` list, `WithRequired` variants of the
 *   `anyof-oneof-required` fix, `oneOf` whose variants are neither).
 */
export type VariantsForm = "intersection" | "union" | "unknown";

const ANY_OF = "anyOf";
const ONE_OF = "oneOf";

function listOf(node: JsonObject, keyword: string): readonly unknown[] {
  const list = node[keyword];
  return Array.isArray(list) ? list : [];
}

/** The members of a composition keyword with their locations. */
export function locatedMembers(
  owner: LocatedNode & { node: JsonObject },
  keyword: string,
): LocatedNode[] {
  return listOf(owner.node, keyword).map((node, index) => ({
    node,
    location: childLocation(owner.location, keyword, String(index)),
  }));
}

/** The schema's own keywords, without its composition keywords. */
export function withoutComposition(node: JsonObject): JsonObject {
  const { allOf: _allOf, anyOf: _anyOf, oneOf: _oneOf, ...own } = node;
  return own;
}

/** Own keywords without an object type of their own (`properties: {}`) add no part. */
export function hasOwnObjectType(own: JsonObject): boolean {
  return isObjectShape(own) && (hasObjectKeywords(own) || isJsonObject(own.discriminator));
}

/** Whether the variant is surely no primitive keyword: an object, an array or a component. */
function isSurelyComposite(variant: unknown): boolean {
  if (!isJsonObject(variant)) {
    return false;
  }
  if (typeof variant.$ref === "string") {
    const pointer = refPointerOf(variant.$ref);
    // A `$ref` to a whole component stays a reference to it (`schemaRefType`).
    return pointer !== null && pointer.segments.length <= leadingSegmentsOf(pointer);
  }
  return (isObjectShape(variant) && hasObjectKeywords(variant)) || variant.type === "array";
}

/** The `type` names a schema of nothing else is written as a primitive keyword for. */
const PRIMITIVE_TYPE_NAMES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);
/** Keywords that do not change the type of a primitive schema. */
const PRIMITIVE_ANNOTATION_KEYS: ReadonlySet<string> = new Set([
  "type",
  "title",
  "description",
  "format",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "pattern",
]);

/**
 * Whether the variant is surely a primitive keyword (`string`): one primitive `type` and nothing
 * that changes it. With `--binary-as-blob` a raw binary string is a `Blob`, so `format` counts.
 */
function isSurelyPrimitive(variant: unknown, options: SchemaOptions): boolean {
  if (!isJsonObject(variant) || typeof variant.type !== "string") {
    return false;
  }
  const isFormatKept = !options.binaryAsBlob || variant.format === undefined;
  const isPlain = Object.keys(variant).every((key) => PRIMITIVE_ANNOTATION_KEYS.has(key));
  return PRIMITIVE_TYPE_NAMES.has(variant.type) && isPlain && isFormatKept;
}

/** Whether the `anyof-oneof-required` fix may write the variants as `WithRequired` parents. */
function mayRequireVariants(variants: readonly unknown[], options: SchemaOptions): boolean {
  const isFixed = options.fixes.has(FIX.ANYOF_ONEOF_REQUIRED);
  return isFixed && variants.every((variant) => requiredOnlyKeys(variant as never) !== null);
}

function anyOfForm(options: SchemaOptions): VariantsForm {
  return options.fixes.has(FIX.ANYOF_PROPERTIES) ? "intersection" : "union";
}

function oneOfForm(variants: readonly unknown[], options: SchemaOptions): VariantsForm {
  if (variants.some(isSurelyComposite)) {
    return "intersection";
  }
  return variants.every((variant) => isSurelyPrimitive(variant, options)) ? "union" : "unknown";
}

/** The form of a schema with a base and variants; `unknown` unless it is sure. */
export function variantsFormOf(node: JsonObject, options: SchemaOptions): VariantsForm {
  const anyOf = listOf(node, ANY_OF);
  const oneOf = listOf(node, ONE_OF);
  const variants = anyOf.length > 0 ? anyOf : oneOf;
  const isOneKeyword = anyOf.length === 0 || oneOf.length === 0;
  if (!isOneKeyword || Array.isArray(node.type) || mayRequireVariants(variants, options)) {
    return "unknown";
  }
  return anyOf.length > 0 ? anyOfForm(options) : oneOfForm(oneOf, options);
}
