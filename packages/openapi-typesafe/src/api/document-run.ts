import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import { sourceEmptyError } from "../adapters/redocly-loader/schema-load-errors.js";
import type { DeprecationReporter } from "../application/ports/deprecation-reporter.js";
import type { Logger } from "../application/ports/logger.js";
import type { SchemaLoader } from "../application/ports/schema-loader.js";
import { withStackOverflowReported } from "../application/stack-overflow.js";
import {
  ineffectiveFixNotices,
  type OutputFix,
  outputFixNamesOf,
  resolveOutputFixes,
} from "../domain/output-fixes.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import type { GeneratorOptions, OpenAPI3, SchemaSource } from "../types.js";
import { sourceCwdOf } from "./cwd-option.js";
import { warnDiscriminatorValueConflicts } from "./discriminator-conflict-warnings.js";
import { findDiscriminators } from "./discriminator-scan.js";
import { resolveDocumentRef } from "./document-refs.js";
import { warnIdenticalPathTemplates } from "./path-template-warnings.js";
import { refAccessOf } from "./ref-limit-options.js";
import type { RunContext } from "./run-context.js";
import { warnUnsupportedFeatures } from "./unsupported-feature-warnings.js";

/** The ports of one generator run, wired by the Node API or the CLI (ENGINEERING_PLAN 4.5). */
export interface GeneratorPorts {
  readonly loader: SchemaLoader;
  readonly logger: Logger;
  /** Where the run reports the deprecated callback forms (ADR-004). */
  readonly deprecations: DeprecationReporter;
  /** The Redocly config the loader uses; the run's context exposes it as `ctx.redoc`. */
  readonly redoc: RedoclyConfig;
  /** A monotonic time in milliseconds, for debug durations. */
  readonly now: () => number;
}

/** A validated, bundled document, the local files it was read from, and the run's context. */
export interface DocumentRun {
  readonly schema: OpenAPI3;
  readonly localFiles: readonly URL[];
  readonly ctx: RunContext;
}

/** The context fields that are user flags, with the original defaults. */
type ContextFlags = Omit<
  RunContext,
  | "discriminators"
  | "injectFooter"
  | "redoc"
  | "resolve"
  | "runFooter"
  | "legacyCallbackWarnings"
  | "logger"
  | "deprecations"
  | "fix"
>;

function callbackOptions(options: GeneratorOptions) {
  return {
    irCallbacks: options.irCallbacks === true,
    postTransform: typeof options.postTransform === "function" ? options.postTransform : undefined,
    transform: typeof options.transform === "function" ? options.transform : undefined,
    transformProperty:
      typeof options.transformProperty === "function" ? options.transformProperty : undefined,
  };
}

function contextFlags(options: GeneratorOptions): ContextFlags {
  return {
    additionalProperties: options.additionalProperties ?? false,
    alphabetize: options.alphabetize ?? false,
    arrayLength: options.arrayLength ?? false,
    binaryAsBlob: options.binaryAsBlob ?? false,
    defaultNonNullable: options.defaultNonNullable ?? true,
    emptyObjectsUnknown: options.emptyObjectsUnknown ?? false,
    enum: options.enum ?? false,
    enumValues: options.enumValues ?? false,
    conditionalEnums: options.conditionalEnums ?? false,
    dedupeEnums: options.dedupeEnums ?? false,
    excludeDeprecated: options.excludeDeprecated ?? false,
    exportType: options.exportType ?? false,
    immutable: options.immutable ?? false,
    rootTypes: options.rootTypes ?? false,
    rootTypesNoSchemaPrefix: options.rootTypesNoSchemaPrefix ?? false,
    rootTypesKeepCasing: options.rootTypesKeepCasing ?? false,
    pathParamsAsTypes: options.pathParamsAsTypes ?? false,
    propertiesRequiredByDefault: options.propertiesRequiredByDefault ?? false,
    silent: options.silent ?? false,
    ...(options.inject === undefined ? {} : { inject: options.inject }),
    makePathsEnum: options.makePathsEnum ?? false,
    generatePathParams: options.generatePathParams ?? false,
    readWriteMarkers: options.readWriteMarkers ?? false,
    ...callbackOptions(options),
  };
}

/**
 * The fixes of the options, `all` expanded; fails with `OPTION_FIX_UNKNOWN` for another name.
 * A fix named without the option it needs is reported, since it changes nothing.
 */
function outputFixesOf(options: GeneratorOptions, logger: Logger): readonly OutputFix[] {
  const names = outputFixNamesOf(options.fix ?? []);
  // The options with their defaults: `defaultNonNullable` is on unless set to false.
  const flags = contextFlags(options);
  for (const notice of ineffectiveFixNotices(names, (option) => flags[option])) {
    logger.warn(warningText(notice, WARNING_CODES.FIX_NEEDS_OPTION));
  }
  return [...resolveOutputFixes(names)];
}

/** The warnings about the loaded document itself, before it is transformed. */
function warnAboutDocument(schema: OpenAPI3, fix: readonly OutputFix[], logger: Logger): void {
  withStackOverflowReported("transform", () => warnUnsupportedFeatures(schema, logger));
  withStackOverflowReported("transform", () =>
    warnDiscriminatorValueConflicts(schema, fix, logger),
  );
  warnIdenticalPathTemplates(schema, logger);
}

/**
 * Load the source through the ports, then build the run's context from the options. The fix names
 * are checked first, so a typo fails before the document is read.
 */
export async function createDocumentRun(
  source: SchemaSource,
  options: GeneratorOptions,
  ports: GeneratorPorts,
): Promise<DocumentRun> {
  if (!source) {
    throw sourceEmptyError("Empty schema. Please specify a URL, file path, or Redocly Config");
  }
  const { logger } = ports;
  const fix = outputFixesOf(options, logger);
  const silent = options.silent ?? false;
  const cwd = sourceCwdOf(options);
  const { document: schema, localFiles } = await ports.loader.load({
    source,
    cwd,
    shouldLint: options.lint ?? true,
    refAccess: refAccessOf(options, cwd),
  });
  warnAboutDocument(schema, fix, logger);
  const ctx: RunContext = {
    ...contextFlags(options),
    fix,
    // The scan walks every schema before the transform does, so on a larger stack, where loading
    // passed, it is the first step to run out.
    discriminators: withStackOverflowReported("transform", () =>
      findDiscriminators(schema, {
        silent,
        logger,
        fixes: new Set(fix),
      }),
    ),
    injectFooter: [],
    redoc: ports.redoc,
    resolve: ($ref) => resolveDocumentRef(schema, $ref, { silent, logger }),
    logger,
    deprecations: ports.deprecations,
  };
  return { schema, localFiles, ctx };
}
