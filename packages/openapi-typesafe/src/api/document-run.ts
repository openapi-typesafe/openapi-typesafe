import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import { sourceEmptyError } from "../adapters/redocly-loader/schema-load-errors.js";
import type { Logger } from "../application/ports/logger.js";
import type { SchemaLoader } from "../application/ports/schema-loader.js";
import type { GeneratorOptions, GlobalContext, OpenAPI3, SchemaSource } from "../types.js";
import { scanDiscriminators } from "./discriminator-scan.js";
import { resolveRef } from "./legacy-utils.js";

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
  readonly ctx: GlobalContext;
}

/** The context fields that are user flags, with the original defaults. */
type ContextFlags = Omit<
  GlobalContext,
  | "discriminators"
  | "injectFooter"
  | "redoc"
  | "resolve"
  | "runFooter"
  | "legacyCallbackWarnings"
  | "logger"
>;

function sourceCwd(options: GeneratorOptions): URL {
  return options.cwd instanceof URL
    ? options.cwd
    : new URL(`file://${options.cwd ?? process.cwd()}/`);
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

/** Load the source through the ports, then build the run's context from the options. */
export async function createDocumentRun(
  source: SchemaSource,
  options: GeneratorOptions,
  ports: GeneratorPorts,
): Promise<DocumentRun> {
  if (!source) {
    throw sourceEmptyError("Empty schema. Please specify a URL, file path, or Redocly Config");
  }
  const { logger } = ports;
  const silent = options.silent ?? false;
  const schema = await ports.loader.load({ source, cwd: sourceCwd(options) });
  const ctx: GlobalContext = {
    ...contextFlags(options),
    discriminators: scanDiscriminators(schema, options, logger),
    injectFooter: [],
    redoc: ports.redoc,
    resolve: ($ref) => resolveRef(schema, $ref, { silent, logger }),
    logger,
  };
  return { schema, ctx };
}
