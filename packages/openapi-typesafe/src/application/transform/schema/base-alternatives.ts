import { appendPointer } from "../../../domain/openapi/json-pointer.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { generatedLocationOf } from "../ref-pointer/generated-location.js";
import { type BaseSchema, expandedBases } from "./base-schemas.js";
import { enumRequest, isTsEnum, tsEnumEntries } from "./enum-declaration.js";
import type { EnumDeclarationRequest } from "./schema-context.js";
import { OWN_SLOT, type SchemaRequest } from "./schema-rule.js";

/**
 * What the type of a base admits at a place, for the values of an enum or `const` there
 * (`baseValuesType`): the base's own keywords, or the variants of its `anyOf` / `oneOf`.
 */

/** How values are typed: as members of a TypeScript enum (`--enum`), or as literals. */
export type ValueForm = "enum" | "literal";

/** Values that the schema of `base` lists in one form. */
export interface ListedAlternative {
  readonly kind: "listed";
  readonly form: ValueForm;
  readonly values: readonly unknown[];
  /** `additionalProperties: true` on a string enum: other strings are values too. */
  readonly isOpen: boolean;
  readonly base: BaseSchema;
}

/** Any value of these JSON types, or of any type (`null`): the base lists none. */
export interface AnyValueAlternative {
  readonly kind: "any";
  readonly types: ReadonlySet<string> | null;
}

export type Alternative = ListedAlternative | AnyValueAlternative;

/** The JSON types a `type` keyword can restrict a value to; others (object, array) do not. */
const VALUE_TYPES: Readonly<Record<string, string>> = {
  string: "string",
  number: "number",
  integer: "number",
  boolean: "boolean",
  null: "null",
};

const NULL_TYPE = "null";

function isObjectNode(node: unknown): node is SchemaObject {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

/** The JSON type of a value, as `VALUE_TYPES` names it. */
export function valueTypeOf(value: unknown): string {
  return value === null ? NULL_TYPE : typeof value;
}

/**
 * The value types a schema without listed values admits; null for any: no `type`, or one
 * that TypeScript intersects with a value without `never` (an object or an array type).
 */
function anyValueTypes(schema: SchemaObject): ReadonlySet<string> | null {
  const names = Array.isArray(schema.type) ? schema.type : [schema.type];
  const types = names.map((name) => (typeof name === "string" ? VALUE_TYPES[name] : NULL_TYPE));
  if (schema.type === undefined || types.some((type) => type === undefined)) {
    return null;
  }
  return new Set([...(types as string[]), ...(schema.nullable === true ? [NULL_TYPE] : [])]);
}

/** Whether the enum rule types the schema (`enumRule.matches`): not an object enum. */
function isValueEnum(schema: SchemaObject): boolean {
  const isCandidate =
    Array.isArray(schema.enum) && schema.type !== "object" && !("properties" in schema);
  const isOpen = "additionalProperties" in schema && Boolean(schema.additionalProperties);
  return isCandidate && (!isOpen || schema.type === "string");
}

/**
 * The enum `--enum` declares for a base's schema, where the generator types that schema: at its
 * own location for a schema in the document (`PetMode`), or at the place's location and slot for
 * an inline one, so it is that schema's own enum, not a new one.
 */
export function declarationOf(base: BaseSchema, request: SchemaRequest): EnumDeclarationRequest {
  const { options, refs } = request.context;
  const schema = base.node as SchemaObject;
  if (base.pointer === null) {
    const path = base.inline?.path;
    const slot = base.inline?.slot ?? OWN_SLOT;
    return { ...enumRequest(schema, path, options), isOwnerReference: true, sharedSlot: slot };
  }
  const location = generatedLocationOf(base.pointer, refs);
  return {
    ...enumRequest(schema, location.path, options),
    isOwnerReference: true,
    // A slot of its own, as a pointer has: the base's enum joins the walk's by its values.
    sharedSlot: location.isShared ? JSON.stringify(["$ref", base.pointer]) : OWN_SLOT,
  };
}

function listedEnum(base: BaseSchema, request: SchemaRequest): ListedAlternative {
  const schema = base.node as SchemaObject;
  const { options } = request.context;
  const isEnum = isTsEnum(schema, options);
  const isOpen = "additionalProperties" in schema && Boolean(schema.additionalProperties);
  return {
    kind: "listed",
    form: isEnum ? "enum" : "literal",
    values: isEnum ? tsEnumEntries(schema, options).map(([value]) => value) : (schema.enum ?? []),
    isOpen,
    base,
  };
}

/** A variant of a base's union, as a base of its own (`anyOf/1` of the base). */
function variantBase(base: BaseSchema, keyword: string, index: number, node: unknown): BaseSchema {
  if (base.pointer !== null) {
    return {
      pointer: appendPointer(base.pointer, [keyword, index]),
      node,
      inline: null,
      omitted: [],
    };
  }
  const inline = base.inline && {
    ...base.inline,
    path: appendPointer(base.inline.path, [keyword, index]),
  };
  return { pointer: null, node, inline: inline ?? null, omitted: [] };
}

/** The alternatives of one variant: those of its first part that lists values, else any value. */
function variantAlternatives(variant: BaseSchema, request: SchemaRequest): Alternative[] {
  const parts = expandedBases([variant], request.context);
  for (const part of parts) {
    const alternatives = alternativesOf(part, request);
    if (alternatives !== null) {
      return [...alternatives];
    }
  }
  return [{ kind: "any", types: commonValueTypes(parts) }];
}

/** The value types that every part admits; null for any, where no part restricts them. */
function commonValueTypes(parts: readonly BaseSchema[]): ReadonlySet<string> | null {
  const restricting = parts.flatMap((part) => {
    const types = isObjectNode(part.node) ? anyValueTypes(part.node) : null;
    return types === null ? [] : [types];
  });
  const [first, ...others] = restricting;
  return first === undefined
    ? null
    : new Set([...first].filter((type) => others.every((types) => types.has(type))));
}

function unionAlternatives(base: BaseSchema, request: SchemaRequest): Alternative[] | null {
  const schema = base.node as SchemaObject;
  const keyword = schema.anyOf === undefined ? "oneOf" : "anyOf";
  const variants = schema.anyOf ?? schema.oneOf;
  if (!Array.isArray(variants) || (schema.anyOf !== undefined && schema.oneOf !== undefined)) {
    return null;
  }
  const alternatives = variants.flatMap((variant, index) =>
    variantAlternatives(variantBase(base, keyword, index, variant), request),
  );
  return alternatives.some((alternative) => alternative.kind === "listed") ? alternatives : null;
}

/**
 * The alternatives of a base's own keywords (its `allOf` items are bases of their own): the
 * values of its `const` or `enum`, or the alternatives of its union's variants. Null where they
 * list no values, so the base leaves the values of the place as they are.
 */
export function alternativesOf(base: BaseSchema, request: SchemaRequest): Alternative[] | null {
  const schema = base.node;
  if (!isObjectNode(schema)) {
    return null;
  }
  if (schema.const !== undefined) {
    const values = [schema.const];
    return [{ kind: "listed", form: "literal", values, isOpen: false, base }];
  }
  if (isValueEnum(schema)) {
    return [listedEnum(base, request)];
  }
  return unionAlternatives(base, request);
}
