import type { DeprecationReporter } from "../application/ports/deprecation-reporter.js";
import type { Logger } from "../application/ports/logger.js";
import type { RefPointerChecks } from "../application/transform/schema/schema-context.js";
import type { DocumentFooter } from "../application/transform/transform-context.js";
import type { SchemaDialect } from "../domain/openapi/schema-dialect.js";
import type { GlobalContext, LegacyCallbackName, SchemaObject } from "../types.js";

/**
 * The context the generator builds for a run: the public `GlobalContext` plus the run's own
 * state. The state is not part of the public type, so it can change in a minor release; every
 * field is optional, so a context a user builds by hand is a valid `RunContext` without it.
 * Callbacks receive this object as `options.ctx` and may spread it; the state travels with it.
 */
export interface RunContext extends GlobalContext {
  readonly discriminators: GlobalContext["discriminators"] & {
    /**
     * With the `discriminator-values` fix: for each enum the scan added to a member and each
     * inherited discriminator object, the enum of the owner's property and the location it is
     * typed at.
     */
    readonly enumParents?: ReadonlyMap<
      object,
      { readonly schema: SchemaObject; readonly path: string }
    >;
    /**
     * With the `discriminator-values` fix: for each schema, the properties of the discriminators
     * it inherits besides `objects[ref]`, which it redefines too.
     */
    readonly otherProperties?: Readonly<Record<string, readonly string[]>>;
    /** The property schema each enum the scan added replaced in the document, by that enum. */
    readonly replacedProperties?: ReadonlyMap<object, unknown>;
  };
  /** The schema dialect of the run's document; without it, OpenAPI 3.0 (`schemaDialectOf`). */
  schemaDialect?: SchemaDialect;
  /** Footer state of this run (enum registry and enum naming), created on first use. */
  runFooter?: DocumentFooter;
  /** The deprecated callback forms this run has warned about (once each). */
  legacyCallbackWarnings?: Set<LegacyCallbackName>;
  /**
   * Whether this pass warned about a `transform` result it ignores (`CALLBACK_RESULT_IGNORED`).
   * Not shared between passes: a pass whose messages are dropped must not silence the next one.
   */
  isIgnoredCallbackResultReported?: boolean;
  /**
   * The enums this pass reported values of that an `allOf` base never admits
   * (`ENUM_VALUES_NOT_INHERITED`), by place and base. Not shared between passes, as above.
   */
  reportedNotInheritedEnums?: Set<string>;
  /** Where this run reports warnings and debug output; without it, the terminal. */
  logger?: Logger;
  /** The `$ref` pointer types of this pass, and those typed in place (`RefPointerChecks`). */
  refPointerChecks?: RefPointerChecks;
  /** Where this run reports deprecated forms; without it, Node.js `DeprecationWarning`s. */
  deprecations?: DeprecationReporter;
}
