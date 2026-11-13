import { FIX } from "../../../domain/output-fixes.js";
import { requiredOnlyKeys } from "../schema/required-only-variant.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { childLocation, isJsonObject, type JsonObject, type LocatedNode } from "./located-node.js";
import { leadingSegmentsOf, refPointerOf } from "./pointer-walk.js";
import { isExcludedProperty } from "./property-shape.js";
import { hasObjectKeywords, isComposed, isObjectShape } from "./schema-shape.js";

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
 * - `required`: `WithRequired<Base, "a"> | WithRequired<Base, "b">`, the `anyof-oneof-required`
 *   fix for variants of only `required` keys of the base's properties (`requiredVariantsType`);
 * - `unknown`: any other form (both keywords, a `type` list, `oneOf` whose variants are neither).
 */
export type VariantsForm =
  | { readonly kind: "intersection" | "union" | "unknown" }
  | { readonly kind: "required"; readonly keyLists: readonly (readonly string[])[] };

const INTERSECTION: VariantsForm = { kind: "intersection" };
const UNION: VariantsForm = { kind: "union" };
const UNKNOWN: VariantsForm = { kind: "unknown" };

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

/** Keywords whose rules type a schema before its `type` does (`SHAPE_RULES`). */
const SHAPE_RULE_KEYS = ["$ref", "const", "enum"] as const;

/**
 * Whether the variant is surely no primitive keyword: an object, an array or a component. A
 * variant with no `type` or `type: object` and no keyword that types it otherwise is `unknown`
 * or `Record<string, never>` (`compositionType`): the "one of these is required" variants.
 */
function isSurelyComposite(variant: unknown): boolean {
  if (!isJsonObject(variant)) {
    return false;
  }
  if (typeof variant.$ref === "string") {
    const pointer = refPointerOf(variant.$ref);
    // A `$ref` to a whole component stays a reference to it (`schemaRefType`).
    return pointer !== null && pointer.segments.length <= leadingSegmentsOf(pointer);
  }
  if ((isObjectShape(variant) && hasObjectKeywords(variant)) || variant.type === "array") {
    return true;
  }
  const isTypedOtherwise = isComposed(variant) || SHAPE_RULE_KEYS.some((key) => key in variant);
  return !isTypedOtherwise && (variant.type === undefined || variant.type === "object");
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

interface FormInput {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
}

/**
 * The key lists the `anyof-oneof-required` fix makes the variants of (`hasRequiredVariants`):
 * an object schema whose variants each require only properties it keeps. Null where it does not.
 */
function requiredKeyListsOf(
  node: JsonObject,
  variants: readonly unknown[],
  input: FormInput,
): (readonly string[])[] | null {
  const isObjectTyped = node.type === undefined || node.type === "object";
  if (!input.options.fixes.has(FIX.ANYOF_ONEOF_REQUIRED) || !isObjectTyped) {
    return null;
  }
  const properties = isJsonObject(node.properties) ? node.properties : {};
  const isKept = (key: string) =>
    Object.hasOwn(properties, key) &&
    !isExcludedProperty(properties[key], input.options, input.refs);
  const keyLists = variants.map((variant) => requiredOnlyKeys(variant as never));
  const isApplicable =
    keyLists.length > 0 && keyLists.every((keys) => keys?.every(isKept) === true);
  return isApplicable ? (keyLists as (readonly string[])[]) : null;
}

function anyOfForm(options: SchemaOptions): VariantsForm {
  return options.fixes.has(FIX.ANYOF_PROPERTIES) ? INTERSECTION : UNION;
}

function oneOfForm(variants: readonly unknown[], options: SchemaOptions): VariantsForm {
  if (variants.some(isSurelyComposite)) {
    return INTERSECTION;
  }
  return variants.every((variant) => isSurelyPrimitive(variant, options)) ? UNION : UNKNOWN;
}

/** The form of a schema with a base and variants; `unknown` unless it is sure. */
export function variantsFormOf(node: JsonObject, input: FormInput): VariantsForm {
  const anyOf = listOf(node, ANY_OF);
  const oneOf = listOf(node, ONE_OF);
  const variants = anyOf.length > 0 ? anyOf : oneOf;
  const isOneKeyword = anyOf.length === 0 || oneOf.length === 0;
  if (!isOneKeyword || Array.isArray(node.type)) {
    return UNKNOWN;
  }
  const keyLists = requiredKeyListsOf(node, variants, input);
  if (keyLists !== null) {
    return { kind: "required", keyLists };
  }
  return anyOf.length > 0 ? anyOfForm(input.options) : oneOfForm(oneOf, input.options);
}
