import type { ContentMap } from "./media-type-object.js";
import type { ReferenceSchema, Schema } from "./schema-object.js";

export type ParameterLocation = "query" | "header" | "path" | "cookie";

/** Every parameter location, in the order the generated `parameters` type lists them. */
export const PARAMETER_LOCATIONS: readonly ParameterLocation[] = Object.freeze([
  "query",
  "header",
  "path",
  "cookie",
]);

/**
 * The OpenAPI 3.2 location of a parameter that is the whole query string, described by `content`.
 * Its type becomes the `query` member of `parameters` (ADR-020).
 */
export const QUERYSTRING_LOCATION = "querystring";

/** The parts of a Parameter Object the generator reads (OpenAPI 3.2 §4.8.12). */
export interface ParameterObject {
  readonly name: string;
  readonly in: ParameterLocation | typeof QUERYSTRING_LOCATION;
  readonly required?: boolean;
  readonly deprecated?: boolean;
  /** How the value is serialized; `form` for `in: query` when absent (§4.8.12.4). */
  readonly style?: string;
  /** Whether an array or object value is sent as several values; true for `form` when absent. */
  readonly explode?: boolean;
  readonly schema?: Schema;
  readonly content?: ContentMap;
}

export type ParameterOrReference = ParameterObject | ReferenceSchema;
