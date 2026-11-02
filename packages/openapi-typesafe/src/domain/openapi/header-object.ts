import type { ContentMap } from "./media-type-object.js";
import type { Schema } from "./schema-object.js";

/** The parts of a Header Object the generator reads (OpenAPI 3.1 §4.8.21). */
export interface HeaderObject {
  readonly schema?: Schema;
  readonly content?: ContentMap;
}
