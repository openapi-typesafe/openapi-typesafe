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

/** Transform a nested schema, with `postTransform` applied (the recursion entry point). */
export type TransformNested = (
  schema: Schema,
  location: SchemaLocation,
  valueAccess?: ValueAccess,
) => IrType;

/** One call of the schema transformer. */
export interface SchemaRequest {
  readonly location: SchemaLocation;
  readonly context: SchemaContext;
  readonly valueAccess: ValueAccess;
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
