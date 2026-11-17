import type { IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { type BaseSchema, baseSchemasAt, slotAfter } from "./base-schemas.js";
import type { SchemaContext, SchemaLocation } from "./schema-context.js";

/**
 * Where the type of a schema is in the type of its location, for `--enum-values` arrays: the
 * location's type itself; `[string]` of it, for an `additionalProperties` value that is the index
 * signature's type alone; or nowhere, for a value the signature holds with other types
 * (`isIndexedByValue`), whose array is typed by its own values.
 */
export type ValueAccess = "location" | "string-index" | "none";

/** A schema typed at its own location. */
export const AT_LOCATION: ValueAccess = "location";

/**
 * Where the generated types hold the schemas under a location, where that is not at the
 * location's pointer: with `exploded-query-objects` the properties of an exploded object
 * parameter are keys of `query` (`…/parameters/query/filter/status` is at `…/query/status`).
 */
export interface TypePlacement {
  readonly locationPath: string;
  readonly typePath: string;
}

/** How a nested schema is transformed; a part left out has the default of a walked schema. */
export interface NestedCall {
  /** Where its type is read in its location's type; `AT_LOCATION` by default. */
  readonly valueAccess?: ValueAccess;
  /** The schema that holds it, the current one by default (a `$ref` target's own holder). */
  readonly parent?: SchemaObject | undefined;
  /** It is typed for a `$ref` that points into it (`SchemaRequest.isThroughRef`). */
  readonly isThroughRef?: boolean;
  /**
   * Where it is among the schemas of its location (`SchemaRequest.sharedSlot`); the holder's by
   * default, since a location that a nested schema appends to is shared too.
   */
  readonly sharedSlot?: SharedSlot;
  /** Where its type is when not at its location's pointer; the holder's by default. */
  readonly typePlacement?: TypePlacement | undefined;
  /** The schemas intersected with it (`SchemaRequest.baseSchemas`); none by default. */
  readonly baseSchemas?: readonly BaseSchema[];
}

/**
 * Where a schema is among the schemas typed at its location (`SchemaRequest.sharedSlot`): at the
 * location's own place (`OWN_SLOT`), or at the steps that led from the location's own schema into
 * an element, the items or a record value (`sharedStepCall`), each with the path it was taken at.
 */
export type SharedSlot = string;

/** The place of a schema typed at a location of its own: the location's schema and its parts. */
export const OWN_SLOT: SharedSlot = "";

/**
 * The step into a schema typed at its holder's location next to other schemas, as JSON: an
 * array's elements (`["prefixItems", 1]`), items and other item keywords, an object's record
 * values (`["patternProperties", "^x"]`), each kept apart from the others.
 */
export type SharedStep = readonly [string] | readonly [string, string | number];

/**
 * The call of a schema typed at its holder's location next to other schemas
 * (`SchemaRequest.sharedSlot`). The holder's slot and location path are part of the slot, so the
 * same step from another place (the `kind` of an element of an element) is another slot. The
 * step is also the pointer step to the bases' schemas at the same place (`baseSchemas`).
 */
export function sharedStepCall(request: SchemaRequest, step: SharedStep): NestedCall {
  return {
    sharedSlot: slotAfter(request.sharedSlot, request.location.path, step),
    baseSchemas: baseSchemasAt(request.baseSchemas, step, request.context),
  };
}

/** The call of the schema of property `key`: the bases' schemas of that property. */
export function propertyCall(request: SchemaRequest, key: string): NestedCall {
  return {
    baseSchemas: baseSchemasAt(request.baseSchemas, ["properties", key], request.context),
  };
}

/** Transform a nested schema, with `postTransform` applied (the recursion entry point). */
export type TransformNested = (
  schema: Schema,
  location: SchemaLocation,
  call?: NestedCall,
) => IrType;

/** One call of the schema transformer. */
export interface SchemaRequest {
  readonly location: SchemaLocation;
  readonly context: SchemaContext;
  readonly valueAccess: ValueAccess;
  /**
   * The schema whose rule transforms this one through `transformNested` (a tuple for its
   * elements); undefined for a schema the document transforms itself.
   */
  readonly parent?: SchemaObject | undefined;
  /**
   * The schema is typed for a `$ref` that points into it (`schemaRefType`), or is nested in such
   * a schema: the generator's walk of the document meets it elsewhere. False for a walked schema.
   */
  readonly isThroughRef: boolean;
  /**
   * Where the schema is among the schemas typed at its location. Other schemas, neither it nor
   * intersected with it, are typed at its location too where it is in the elements or items of an
   * array or the record values of an object (`Shape/kind` for the `kind` of each element of
   * `Shape`): its slot is the steps into them (`sharedStepCall`). A property and an inline
   * `allOf` item of one schema are intersected, so their parts share each slot; `OWN_SLOT` is the
   * place of the location's own schema. The `--enum` owners read it (`EnumOwners`).
   */
  readonly sharedSlot: SharedSlot;
  /** Where its type is when not at its location's pointer; nested schemas keep their holder's. */
  readonly typePlacement?: TypePlacement | undefined;
  /**
   * The schemas TypeScript intersects with this one at its place (`Pet & { mode?: CatMode }`):
   * the `$ref` items of an `allOf` there, read through their own `allOf` chains, and the other
   * inline parts of the `allOf` (`inlineParts`). An enum or `const` here is typed in the form a
   * base lists its values in (`baseValuesType`). Set for the parts of such an `allOf`, and kept
   * for their properties, items, record values and union variants; a `$ref` starts with none.
   */
  readonly baseSchemas: readonly BaseSchema[];
  readonly transformNested: TransformNested;
}

/**
 * One schema shape (ENGINEERING_PLAN §4.4). Rules are tried in a fixed order and the first match
 * transforms the schema; the order is the original precedence. Internal, not a plugin point.
 */
export interface SchemaRule {
  readonly name: string;
  matches(schema: SchemaObject): boolean;
  transform(schema: SchemaObject, request: SchemaRequest): IrType;
}
