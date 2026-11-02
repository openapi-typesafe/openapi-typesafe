import type { HeaderObject } from "./header-object.js";
import type { ContentMap } from "./media-type-object.js";
import type { ReferenceSchema } from "./schema-object.js";

/** The parts of a Response Object the generator reads (OpenAPI 3.1 §4.8.17). */
export interface ResponseObject {
  /** Written into the JSDoc of the response's member. */
  readonly description?: string;
  readonly headers?: Readonly<Record<string, HeaderObject | ReferenceSchema>>;
  readonly content?: ContentMap;
}

/** Responses by status code or `default` (OpenAPI 3.1 §4.8.16). */
export type ResponsesObject = Readonly<Record<string, ResponseObject | ReferenceSchema>>;
