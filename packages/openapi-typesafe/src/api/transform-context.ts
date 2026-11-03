import * as changeCase from "change-case";
import { RunFooter } from "../application/transform/footer/document-footer.js";
import type { SchemaLocation } from "../application/transform/schema/schema-context.js";
import type {
  DocumentFooter,
  NameCasing,
  TransformContext,
  TransformDiagnostics,
  TransformOptions,
} from "../application/transform/transform-context.js";
import type { GlobalContext, TransformNodeOptions } from "../types.js";
import { defaultLogger, monotonicNow } from "./default-ports.js";
import { ContextFooterSink } from "./footer-sink.js";
import { schemaCallbacks } from "./schema-callbacks.js";

/**
 * Builds the ported transformers' context from the original `GlobalContext`: options, refs,
 * discriminators, the run footer and the user callbacks (see `schema-callbacks.ts`).
 */

function transformOptions(ctx: GlobalContext): TransformOptions {
  return {
    additionalProperties: ctx.additionalProperties,
    alphabetize: ctx.alphabetize,
    arrayLength: ctx.arrayLength,
    binaryAsBlob: ctx.binaryAsBlob,
    conditionalEnums: ctx.conditionalEnums,
    dedupeEnums: ctx.dedupeEnums,
    defaultNonNullable: ctx.defaultNonNullable,
    emptyObjectsUnknown: ctx.emptyObjectsUnknown,
    enum: ctx.enum,
    enumValues: ctx.enumValues,
    excludeDeprecated: ctx.excludeDeprecated,
    fixes: new Set(ctx.fix ?? []),
    immutable: ctx.immutable,
    propertiesRequiredByDefault: ctx.propertiesRequiredByDefault,
    readWriteMarkers: ctx.readWriteMarkers,
    generatePathParams: ctx.generatePathParams,
    pathParamsAsTypes: ctx.pathParamsAsTypes,
    rootTypes: ctx.rootTypes,
    rootTypesNoSchemaPrefix: ctx.rootTypesNoSchemaPrefix,
    rootTypesKeepCasing: ctx.rootTypesKeepCasing,
    exportType: ctx.exportType,
    inject: ctx.inject,
    makePathsEnum: ctx.makePathsEnum,
  };
}

/** One footer per run: it holds the enum registry, so it lives on the run's context. */
function runFooter(ctx: GlobalContext): DocumentFooter {
  ctx.runFooter ??= new RunFooter(new ContextFooterSink(ctx.injectFooter), ctx.dedupeEnums);
  return ctx.runFooter;
}

const CASING: NameCasing = { pascalCase: (text) => changeCase.pascalCase(text) };

/**
 * A monotonic clock and the run's logger (the default one for a user's own context), "ts" group.
 */
function diagnostics(ctx: GlobalContext): TransformDiagnostics {
  const logger = ctx.logger ?? defaultLogger(ctx.silent);
  return {
    now: monotonicNow,
    debug: (message, durationMs) => logger.debug(message, "ts", durationMs),
  };
}

/** The ported transformers' context for one call from a legacy transformer. */
export function createTransformContext(ctx: GlobalContext): TransformContext {
  return {
    options: transformOptions(ctx),
    refs: { resolve: (ref) => ctx.resolve(ref) },
    discriminators: {
      objectAt: (ref) => ctx.discriminators.objects[ref],
      isHandled: (ref) => ctx.discriminators.refsHandled.includes(ref),
    },
    footer: runFooter(ctx),
    callbacks: schemaCallbacks(ctx),
    diagnostics: diagnostics(ctx),
    casing: CASING,
  };
}

/** The transformer's location for the original options object. */
export function schemaLocation(options: TransformNodeOptions): SchemaLocation {
  return { path: options.path, schema: options.schema };
}
