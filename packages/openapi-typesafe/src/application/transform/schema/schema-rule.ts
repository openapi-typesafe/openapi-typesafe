import type { IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { SchemaContext, SchemaLocation } from "./schema-context.js";

/** Transform a nested schema, with `postTransform` applied (the recursion entry point). */
export type TransformNested = (
  schema: Schema,
  location: SchemaLocation,
  isFromAdditionalProperties?: boolean,
) => IrType;

/** One call of the schema transformer. */
export interface SchemaRequest {
  readonly location: SchemaLocation;
  readonly context: SchemaContext;
  /** Set for `additionalProperties` schemas: `--enum-values` arrays then index by `string`. */
  readonly isFromAdditionalProperties: boolean;
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
