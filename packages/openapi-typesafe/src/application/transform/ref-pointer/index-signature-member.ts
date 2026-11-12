import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { childLocation, isJsonObject, type JsonObject, type LocatedNode } from "./located-node.js";
import { hasKeptProperties, isWidenedRecordValue } from "./property-shape.js";

/** The index signature of an object schema as the `$ref` pointer walk reads it (ADR-026). */

/**
 * An index signature; `node` is undefined when its value type is `unknown`. `isOtherType`: the
 * type read is not the type of the node the key names (`indexMember`).
 */
export interface IndexSignatureMember {
  readonly kind: "index";
  readonly node: unknown;
  readonly location: string | undefined;
  readonly isOtherType: boolean;
}

interface IndexInput {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
}

/** `additionalProperties: true` or `{}` (also as a pattern's schema): a value of `unknown`. */
function isUnknownValue(value: unknown): boolean {
  return value === true || (isJsonObject(value) && Object.keys(value).length === 0);
}

/** The value schemas of an index signature none of whose values is `unknown`, located. */
function typedIndexValues(owner: LocatedNode & { node: JsonObject }): LocatedNode[] {
  const { additionalProperties: values, patternProperties: patterns } = owner.node;
  const located: LocatedNode[] = [];
  if (isJsonObject(values)) {
    located.push({ node: values, location: childLocation(owner.location, "additionalProperties") });
  }
  for (const [pattern, node] of isJsonObject(patterns) ? Object.entries(patterns) : []) {
    located.push({ node, location: childLocation(owner.location, "patternProperties", pattern) });
  }
  return located;
}

/**
 * The index signature of an object schema, or null without one. Its type is the union of its
 * value schemas' types (`unknown` if one is `unknown`); a union of several is no one schema's
 * type, so it is `isOtherType` (its `node` is the first). It also holds the kept property types
 * (`withPropertyTypes`), and a key that names a property `--exclude-deprecated` left out reads it
 * instead of that property: both are `isOtherType` too.
 */
export function indexMember(
  owner: LocatedNode & { node: JsonObject },
  isExcludedKey: boolean,
  input: IndexInput,
): IndexSignatureMember | null {
  const { additionalProperties: values, patternProperties: patterns } = owner.node;
  const patternValues = isJsonObject(patterns) ? Object.values(patterns) : [];
  const isUnknown =
    isUnknownValue(values) ||
    patternValues.some(isUnknownValue) ||
    (!values && input.options.additionalProperties);
  if (isUnknown) {
    return { kind: "index", node: undefined, location: undefined, isOtherType: isExcludedKey };
  }
  const typed = typedIndexValues(owner);
  const [first] = typed;
  if (first === undefined) {
    return null;
  }
  const isOtherType =
    isExcludedKey || typed.length > 1 || hasKeptProperties(owner.node, input.options, input.refs);
  return { kind: "index", ...first, isOtherType };
}

const UNEVALUATED_PROPERTIES = "unevaluatedProperties";

/**
 * The index signature the `unevaluated-properties` fix adds for `value`. It also holds the
 * declared property types of the owner and of its `allOf` / `anyOf` / `oneOf` members
 * (`isWidenedRecordValue`), and a left-out property's key reads it: both are another type.
 */
export function unevaluatedIndexMember(
  owner: LocatedNode & { node: JsonObject },
  value: unknown,
  isExcludedKey: boolean,
  input: IndexInput,
): IndexSignatureMember {
  if (isUnknownValue(value)) {
    return { kind: "index", node: undefined, location: undefined, isOtherType: isExcludedKey };
  }
  const { options, refs } = input;
  const isWidened = isWidenedRecordValue(owner.node, UNEVALUATED_PROPERTIES, options, refs);
  return {
    kind: "index",
    node: value,
    location: childLocation(owner.location, UNEVALUATED_PROPERTIES),
    isOtherType: isExcludedKey || isWidened,
  };
}
