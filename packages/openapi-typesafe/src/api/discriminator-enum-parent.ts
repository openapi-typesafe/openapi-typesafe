import { createRef, parseRefPointer } from "../domain/openapi/json-pointer.js";
import type { SchemaObject } from "../types.js";
import type { EnumPatch } from "./discriminator-enum.js";

/**
 * The `discriminator-enum-members` fix (#1700). With `--enum`, the enum the scan adds to a member
 * (`petType: "Cat"`) is declared as an enum of its own (`CatPetType`), which is not assignable to
 * the parent's enum (`PetType`). The parent's enum is found here, so the member's property can be
 * typed with its members (`PetType.Cat`).
 */

/** The parent's enum schema and the location it is typed at, which gives the enum its name. */
export interface EnumParent {
  readonly schema: SchemaObject;
  readonly path: string;
}

type ResolveSchemaRef = (ref: string) => unknown;

/** A declared property schema and the location the transformer types it at. */
interface DeclaredProperty {
  readonly property: unknown;
  readonly path: string;
}

const PROPERTIES_KEYWORD = "properties";
/** `components`, `schemas` and the schema name: the segments before the schema's own keywords. */
const ROOT_SEGMENTS = 3;

/** The location a `$ref` is typed at: object properties are nested without `properties`. */
function typedAt(ref: string): string {
  const segments = parseRefPointer(ref);
  const nested = segments.slice(ROOT_SEGMENTS).filter((segment) => segment !== PROPERTIES_KEYWORD);
  return createRef([...segments.slice(0, ROOT_SEGMENTS), ...nested]);
}

function isSchemaObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The property `name` of a schema object typed at `ref`. */
function ownProperty(item: SchemaObject, ref: string, name: string): DeclaredProperty | undefined {
  const property = ("properties" in item ? item.properties : undefined)?.[name];
  return property === undefined ? undefined : { property, path: createRef([ref, name]) };
}

/** The property `name` of the schema at `ref`, its own or from an `allOf` item, depth first. */
function declaredProperty(
  ref: string,
  name: string,
  resolve: ResolveSchemaRef,
  visited: Set<string>,
): DeclaredProperty | undefined {
  const schema = resolve(ref);
  if (visited.has(ref) || !isSchemaObject(schema)) {
    return undefined;
  }
  visited.add(ref);
  // An inline `allOf` item is typed at its parent's location, so both share the path.
  for (const item of [schema, ...(schema.allOf ?? [])]) {
    if (!isSchemaObject(item)) {
      continue;
    }
    const found =
      "$ref" in item
        ? declaredProperty(item.$ref as string, name, resolve, visited)
        : ownProperty(item, ref, name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** A discriminator and the `$ref` of the schema that declares its property. */
export type DiscriminatorOwner = Pick<EnumPatch, "discriminator" | "discriminatorRef">;

/** The enum of the property that the discriminator owner declares, if it is one. */
export function enumParentOf(
  patch: DiscriminatorOwner,
  resolve: ResolveSchemaRef,
): EnumParent | undefined {
  const name = patch.discriminator.propertyName;
  const declared = declaredProperty(patch.discriminatorRef, name, resolve, new Set());
  if (declared === undefined || !isSchemaObject(declared.property)) {
    return undefined;
  }
  const ref = (declared.property as { readonly $ref?: unknown }).$ref;
  const parent =
    typeof ref === "string"
      ? { schema: resolve(ref), path: typedAt(ref) }
      : { schema: declared.property, path: declared.path };
  return isSchemaObject(parent.schema) && Array.isArray(parent.schema.enum)
    ? { schema: parent.schema, path: parent.path }
    : undefined;
}
