import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import { sourceEmptyError } from "../adapters/redocly-loader/schema-load-errors.js";
import type { Logger } from "../application/ports/logger.js";
import type { RefAccess, SchemaLoader } from "../application/ports/schema-loader.js";
import { withStackOverflowReported } from "../application/stack-overflow.js";
import {
  ineffectiveFixNotices,
  type OutputFix,
  outputFixNamesOf,
  resolveOutputFixes,
} from "../domain/output-fixes.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import type { GeneratorOptions, OpenAPI3, SchemaSource } from "../types.js";
import { processCwd } from "./default-ports.js";
import { warnDiscriminatorValueConflicts } from "./discriminator-conflict-warnings.js";
import { findDiscriminators } from "./discriminator-scan.js";
import { resolveDocumentRef } from "./document-refs.js";
import { warnIdenticalPathTemplates } from "./path-template-warnings.js";
import type { RunContext } from "./run-context.js";
import { warnUnsupportedFeatures } from "./unsupported-feature-warnings.js";

/** The ports of one generator run, wired by the Node API or the CLI (ENGINEERING_PLAN 4.5). */
export interface GeneratorPorts {
  readonly loader: SchemaLoader;
  readonly logger: Logger;
  /** The Redocly config the loader uses; the run's context exposes it as `ctx.redoc`. */
  readonly redoc: RedoclyConfig;
  /** A monotonic time in milliseconds, for debug durations. */
  readonly now: () => number;
}

/** A validated, bundled document and the context of one generator run. */
export interface DocumentRun {
  readonly schema: OpenAPI3;
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
  | "fix"
>;

/**
 * The directory that relative `$ref`s of an inline source resolve against, as a URL that ends in
 * a slash. A path is resolved and encoded (`#`, `%`, spaces); a URL without the slash gets one.
 */
function sourceCwd(options: GeneratorOptions): URL {
  const { cwd } = options;
  if (cwd instanceof URL) {
    return cwd.pathname.endsWith("/") ? cwd : new URL(`${cwd.pathname}/`, cwd);
  }
  const directory = path.resolve(cwd === undefined ? processCwd() : cwd.toString());
  return pathToFileURL(path.join(directory, path.sep));
}

/** The `$ref` limits of the options; a relative local root resolves against the cwd. */
function refAccessOf(options: GeneratorOptions, cwd: URL): RefAccess {
  const { localRefRoot, remoteRefHosts } = options;
  const localRoot =
    typeof localRefRoot === "string"
      ? pathToFileURL(path.resolve(fileURLToPath(cwd), localRefRoot))
      : localRefRoot;
  return {
    ...(localRoot === undefined ? {} : { localRoot }),
    ...(remoteRefHosts === undefined ? {} : { remoteHosts: remoteRefHosts }),
  };
}

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
  for (const notice of ineffectiveFixNotices(names, (option) => options[option] === true)) {
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
  const cwd = sourceCwd(options);
  const schema = await ports.loader.load({
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
  };
  return { schema, ctx };
}
