import { parseRefPointer } from "./json-pointer.js";
import type { ReferenceSchema, Schema } from "./schema-object.js";

/** The parts of a Media Type Object the generator reads (OpenAPI 3.2 §4.8.14). */
export interface MediaTypeObject {
  /** The complete content. */
  readonly schema?: Schema;
  /** Each item of a sequential media type such as `application/jsonl` (OpenAPI 3.2). */
  readonly itemSchema?: Schema;
}

/** A `content` map: media type name to a Media Type Object or a `$ref` to one. */
export type ContentMap = Readonly<Record<string, MediaTypeObject | ReferenceSchema>>;

const COMPONENTS_SEGMENT = "components";
/** The OpenAPI 3.2 component map of reusable Media Type Objects. */
export const MEDIA_TYPES_COMPONENT_KIND = "mediaTypes";

/**
 * Whether a `content` entry's `$ref` points into `components.mediaTypes` (OpenAPI 3.2). Other
 * `$ref`s in `content` keep the output they had before 3.2 (ADR-020).
 */
export function isMediaTypeComponentRef(ref: string): boolean {
  const [root, kind] = parseRefPointer(ref);
  return ref.startsWith("#/") && root === COMPONENTS_SEGMENT && kind === MEDIA_TYPES_COMPONENT_KIND;
}
