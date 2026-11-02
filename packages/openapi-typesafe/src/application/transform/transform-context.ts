import type { IrPropertySignature } from "../../domain/ir/nodes.js";
import type { FooterDeclarations, SchemaContext, SchemaOptions } from "./schema/schema-context.js";

/** Options of the transformers above schemas. They grow as parents are ported (Phase 5). */
export interface TransformOptions extends SchemaOptions {
  /** `--generate-path-params`: add path template parameters that the document does not define. */
  readonly generatePathParams: boolean;
  /** `--path-params-as-types`: key templated paths by a template literal type. */
  readonly pathParamsAsTypes: boolean;
  /** `--root-types`: export an alias per component, like `SchemaPet`. */
  readonly rootTypes: boolean;
  /** `--root-types-no-schema-prefix`: `Pet` instead of `SchemaPet` for schemas. */
  readonly rootTypesNoSchemaPrefix: boolean;
  /** `--root-types-keep-casing`: keep schema names as written instead of PascalCase. */
  readonly rootTypesKeepCasing: boolean;
  /** `--export-type`: root types are type aliases instead of interfaces. */
  readonly exportType: boolean;
  /** Code added as is after the helper types (Node API `inject`). */
  readonly inject: string | undefined;
  /** `--make-paths-enum`: add the `ApiPaths` enum of all operation URLs. */
  readonly makePathsEnum: boolean;
}

/** Name casing for generated identifiers (the original uses the `change-case` package). */
export interface NameCasing {
  pascalCase(text: string): string;
}

/** Declarations after the main types, including the top-level `operations` interface. */
export interface DocumentFooter extends FooterDeclarations {
  /**
   * Add a member to the `operations` interface. The interface is declared before `build` runs, so
   * it comes before any declaration the operation adds, as in the original.
   */
  addOperation(build: () => IrPropertySignature): void;
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
  readonly diagnostics: TransformDiagnostics;
  readonly casing: NameCasing;
}
