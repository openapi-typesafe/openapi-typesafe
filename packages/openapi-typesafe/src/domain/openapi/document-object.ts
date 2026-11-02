import type { ComponentsObject } from "./components-object.js";
import type { PathsObject } from "./path-item-object.js";
import type { Schema } from "./schema-object.js";

/** The parts of an OpenAPI document that get a root type (OpenAPI 3.1 §4.8.1). */
export interface DocumentObject {
  readonly paths?: PathsObject;
  readonly webhooks?: PathsObject;
  readonly components?: ComponentsObject;
  /** JSON Schema definitions at the document root: named subschemas. */
  readonly $defs?: Readonly<Record<string, Schema>>;
}
