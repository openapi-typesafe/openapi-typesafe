import type { IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
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
   * It shares its location with other schemas (`SchemaRequest.isAtSharedLocation`); the holder's
   * by default, since a location that a nested schema appends to is shared too.
   */
  readonly isAtSharedLocation?: boolean;
  /** Where its type is when not at its location's pointer; the holder's by default. */
  readonly typePlacement?: TypePlacement | undefined;
}

/**
 * The call of a schema typed at its holder's location next to other schemas: an array's elements
 * and items, an object's record values (`SchemaRequest.isAtSharedLocation`).
 */
export const AT_SHARED_LOCATION: NestedCall = { isAtSharedLocation: true };

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
   * The schema is typed at a location that other schemas, neither it nor intersected with it,
   * are typed at too: the elements and items of an array, the record values of an object, and
   * every schema nested in them (`Shape/kind` for the `kind` of each element of `Shape`). Their
   * `--enum` declarations are told apart by their values (`enumOwner`).
   */
  readonly isAtSharedLocation: boolean;
  /** Where its type is when not at its location's pointer; nested schemas keep their holder's. */
  readonly typePlacement?: TypePlacement | undefined;
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
