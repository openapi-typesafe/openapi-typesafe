import type { SchemaContext, SchemaOptions } from "./schema/schema-context.js";

/** Options of the transformers above schemas. They grow as parents are ported (Phase 5). */
export interface TransformOptions extends SchemaOptions {
  /** `--generate-path-params`: add path template parameters that the document does not define. */
  readonly generatePathParams: boolean;
}

/** The context of the document transformers: the schema context with their options. */
export interface TransformContext extends SchemaContext {
  readonly options: TransformOptions;
}
