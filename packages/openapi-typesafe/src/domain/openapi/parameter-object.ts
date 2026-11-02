import type { ReferenceSchema, Schema } from "./schema-object.js";

export type ParameterLocation = "query" | "header" | "path" | "cookie";

/** Every parameter location, in the order the generated `parameters` type lists them. */
export const PARAMETER_LOCATIONS: readonly ParameterLocation[] = Object.freeze([
  "query",
  "header",
  "path",
  "cookie",
]);

/** The parts of a Parameter Object the generator reads (OpenAPI 3.1 §4.8.12). */
export interface ParameterObject {
  readonly name: string;
  readonly in: ParameterLocation;
  readonly required?: boolean;
  readonly deprecated?: boolean;
  readonly schema?: Schema;
}

export type ParameterOrReference = ParameterObject | ReferenceSchema;
