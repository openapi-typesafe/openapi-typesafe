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

/** How a nested schema is transformed; a part left out has the default of a walked schema. */
export interface NestedCall {
  /** Where its type is read in its location's type; `AT_LOCATION` by default. */
  readonly valueAccess?: ValueAccess;
  /** The schema that holds it, the current one by default (a `$ref` target's own holder). */
  readonly parent?: SchemaObject | undefined;
  /** It is typed for a `$ref` that points into it (`SchemaRequest.isThroughRef`). */
  readonly isThroughRef?: boolean;
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
