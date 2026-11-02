import type { ReferenceSchema, Schema } from "./schema-object.js";

/** The parts of a Media Type Object the generator reads (OpenAPI 3.1 §4.8.14). */
export interface MediaTypeObject {
  readonly schema?: Schema;
}

/** A `content` map: media type name to a Media Type Object or a `$ref` to one. */
export type ContentMap = Readonly<Record<string, MediaTypeObject | ReferenceSchema>>;
