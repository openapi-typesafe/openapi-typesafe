import type { ContentMap } from "./media-type-object.js";

/** The parts of a Request Body Object the generator reads (OpenAPI 3.1 §4.8.13). */
export interface RequestBodyObject {
  readonly content?: ContentMap;
}
