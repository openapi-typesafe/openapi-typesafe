import type { IrPropertySignature, IrType } from "../../domain/ir/nodes.js";
import type { FooterDeclarations, SchemaContext, SchemaOptions } from "./schema/schema-context.js";

/** Options of the transformers above schemas. They grow as parents are ported (Phase 5). */
export interface TransformOptions extends SchemaOptions {
  /** `--generate-path-params`: add path template parameters that the document does not define. */
  readonly generatePathParams: boolean;
  /** `--path-params-as-types`: key templated paths by a template literal type. */
  readonly pathParamsAsTypes: boolean;
}

/** Declarations after the main types, including the top-level `operations` interface. */
export interface DocumentFooter extends FooterDeclarations {
  /**
   * Add a member to the `operations` interface. The interface is declared before `build` runs, so
   * it comes before any declaration the operation adds, as in the original.
   */
  addOperation(build: () => IrPropertySignature): void;
}

/** Reads the text of a template literal type (`--path-params-as-types`). */
export interface TemplateLiteralParser {
  /** The type, or null when the text does not read as a template literal. */
  parse(text: string): IrType | null;
}

/** Debug output for slow parts of a run (`DEBUG=openapi-ts:*`). */
export interface TransformDiagnostics {
  /** A monotonic time in milliseconds, used only to measure durations. */
  now(): number;
  debug(message: string, durationMs: number): void;
}

/** The context of the document transformers: the schema context with their options and ports. */
export interface TransformContext extends SchemaContext {
  readonly options: TransformOptions;
  readonly footer: DocumentFooter;
  readonly templates: TemplateLiteralParser;
  readonly diagnostics: TransformDiagnostics;
}
