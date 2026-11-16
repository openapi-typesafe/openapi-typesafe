import { irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { generatedLocationOf } from "../ref-pointer/generated-location.js";
import type { BaseSchema } from "./base-schemas.js";
import { enumRequest, isTsEnum, tsEnumEntries } from "./enum-declaration.js";
import type { EnumDeclarationRequest } from "./schema-context.js";
import { OWN_SLOT, type SchemaRequest } from "./schema-rule.js";

type EnumValue = string | number;

/** The enum of a base at the place of a schema, and the values it lists. */
interface BaseEnum {
  readonly pointer: string;
  readonly schema: SchemaObject;
  readonly values: readonly EnumValue[];
}

function baseEnumOf(base: BaseSchema, request: SchemaRequest): BaseEnum | null {
  const { options, refs } = request.context;
  const schema = refs.resolve(base.pointer) as SchemaObject;
  if (!isTsEnum(schema, options)) {
    return null;
  }
  const values = tsEnumEntries(schema, options).map(([value]) => value as EnumValue);
  return { pointer: base.pointer, schema, values };
}

/**
 * The declaration of a base's enum, at the location the generator types the base's schema at, so
 * it is the enum the base itself is typed by (`PetMode`), not a new one.
 */
function baseRequest(base: BaseEnum, request: SchemaRequest): EnumDeclarationRequest {
  const { options, refs } = request.context;
  const location = generatedLocationOf(base.pointer, refs);
  return {
    ...enumRequest(base.schema, location.path, options),
    isOwnerReference: true,
    // A slot of its own, as a pointer has: the base's enum joins the walk's by its values.
    sharedSlot: location.isShared ? JSON.stringify(["$ref", base.pointer]) : OWN_SLOT,
  };
}

/**
 * An enum at a place where an `allOf` intersects it with the enum of a `$ref` item's schema
 * (`Cat: allOf: [$ref: Pet, { mode: [a] }]`): two TypeScript enums intersect to `never`, so the
 * schema is typed by the members of the base's enum that it lists (`PetMode.a`) and its own enum
 * is not used there. Values the base does not list are no value of the schema; they are reported.
 * Null without such a base, or when the two enums have no value in common: the type is `never`, as
 * the document says.
 */
export function baseEnumType(values: readonly EnumValue[], request: SchemaRequest): IrType | null {
  for (const base of request.baseSchemas) {
    const baseEnum = baseEnumOf(base, request);
    if (baseEnum === null) {
      continue;
    }
    const keys = new Set(baseEnum.values.map((value) => JSON.stringify(value)));
    const common = values.filter((value) => keys.has(JSON.stringify(value)));
    const missing = values.filter((value) => !keys.has(JSON.stringify(value)));
    if (missing.length > 0) {
      const path = request.location.path ?? "";
      const hasCommonValues = common.length > 0;
      const found = { path, base: base.pointer, values: missing, hasCommonValues };
      request.context.enumInheritance?.reportNotInherited(found);
    }
    if (common.length > 0) {
      const name = request.context.footer.addEnum(baseRequest(baseEnum, request));
      return { ...irReference(name), enumValues: common };
    }
  }
  return null;
}
