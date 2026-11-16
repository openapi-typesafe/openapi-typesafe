import { parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type {
  EnumDeclarationRequest,
  EnumMemberMetadata,
  SchemaOptions,
} from "./schema-context.js";

/** The TypeScript enum `--enum` declares for a schema: its name, values and member metadata. */

/** Removed from generated names, so `#/components/schemas/Status` gives `Status`. */
const COMPONENT_SCHEMAS_PREFIX = "components/schemas";

/** A name from the schema's pointer: `#/components/schemas/Pet/status` → `/Pet/status`. */
export function nameFromPath(path: string | undefined): string {
  return parseRefPointer(path ?? "")
    .join("/")
    .replace(COMPONENT_SCHEMAS_PREFIX, "");
}

/** `#/components/schemas/Name`, and no deeper pointer. */
const COMPONENT_SCHEMA_RE = /^#\/components\/schemas\/[^/]+$/;

function hasEnumMetadata(schema: SchemaObject): boolean {
  return [
    schema["x-enum-varnames"],
    schema["x-enumNames"],
    schema["x-enum-descriptions"],
    schema["x-enumDescriptions"],
  ].some(Array.isArray);
}

/**
 * The values a TypeScript enum declares, with their positions in `enum`. With the
 * `nullable-enums` fix a `null` value is left out (upstream #1872): an enum member cannot be
 * `null`, so the type adds it as `| null` instead (`tsEnumType`).
 */
export function tsEnumEntries(schema: SchemaObject, options: SchemaOptions): [unknown, number][] {
  const entries = (schema.enum ?? []).map((value, index): [unknown, number] => [value, index]);
  return options.fixes.has(FIX.NULLABLE_ENUMS)
    ? entries.filter(([value]) => value !== null)
    : entries;
}

/**
 * Whether `--enum` types the schema as a TypeScript enum, not as a union of its values: string
 * and number enums. The original meant to allow `null` too, but tested `typeof value` against
 * `null`, so an enum containing null stays a union; the `nullable-enums` fix declares its other
 * values.
 */
export function isTsEnum(schema: SchemaObject, options: SchemaOptions): boolean {
  if (!options.enum || !schema.enum) {
    return false;
  }
  const entries = tsEnumEntries(schema, options);
  // An empty `enum` stays an empty TypeScript enum, as the original made it; an enum of only
  // `null` has no member left once the fix drops `null`, so it stays a union.
  const isOnlyNull = entries.length === 0 && schema.enum.length > 0;
  const isSupported =
    !isOnlyNull && entries.every(([value]) => ["string", "number"].includes(typeof value));
  // `--conditional-enums` converts only enums that carry x-enum-* metadata.
  return isSupported && (!options.conditionalEnums || hasEnumMetadata(schema));
}

function enumMetadata(
  schema: SchemaObject,
  entries: readonly [unknown, number][],
): EnumMemberMetadata[] {
  return entries.map(([, index]) => ({
    name: schema["x-enum-varnames"]?.[index] ?? schema["x-enumNames"]?.[index],
    description: schema["x-enum-descriptions"]?.[index] ?? schema["x-enumDescriptions"]?.[index],
  }));
}

/** The enum declaration of `schema` typed at `path`; its values are strings and numbers. */
export function enumRequest(
  schema: SchemaObject,
  path: string | undefined,
  options: SchemaOptions,
): EnumDeclarationRequest {
  const entries = tsEnumEntries(schema, options);
  return {
    name: nameFromPath(path),
    isComponentSchema: COMPONENT_SCHEMA_RE.test(path ?? ""),
    values: entries.map(([value]) => value as string | number),
    metadata: enumMetadata(schema, entries),
  };
}
