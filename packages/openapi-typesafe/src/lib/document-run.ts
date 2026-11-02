import type { Readable } from "node:stream";
import { createConfig, type Config as RedoclyConfig } from "@redocly/openapi-core";
import type { GeneratorOptions, GlobalContext, OpenAPI3 } from "../types.js";
import { validateAndBundle } from "./redoc.js";
import { resolveRef, scanDiscriminators } from "./utils.js";

/** A validated, bundled document and the context of one generator run. */
export interface DocumentRun {
  readonly schema: OpenAPI3;
  readonly ctx: GlobalContext;
}

/** The context fields that are user flags, with the original defaults. */
type ContextFlags = Omit<
  GlobalContext,
  "discriminators" | "injectFooter" | "redoc" | "resolve" | "runFooter" | "legacyCallbackWarnings"
>;

/** The default Redocly config: minimal rules, and duplicate operation IDs are an error. */
function defaultRedoclyConfig(): Promise<RedoclyConfig> {
  const rules = { "operation-operationId-unique": { severity: "error" as const } };
  return createConfig({ rules }, { extends: ["minimal"] });
}

function sourceCwd(options: GeneratorOptions): URL {
  return options.cwd instanceof URL ? options.cwd : new URL(`file://${options.cwd ?? process.cwd()}/`);
}

function callbackOptions(options: GeneratorOptions) {
  return {
    irCallbacks: options.irCallbacks === true,
    postTransform: typeof options.postTransform === "function" ? options.postTransform : undefined,
    transform: typeof options.transform === "function" ? options.transform : undefined,
    transformProperty: typeof options.transformProperty === "function" ? options.transformProperty : undefined,
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
    inject: options.inject ?? undefined,
    makePathsEnum: options.makePathsEnum ?? false,
    generatePathParams: options.generatePathParams ?? false,
    readWriteMarkers: options.readWriteMarkers ?? false,
    ...callbackOptions(options),
  };
}

/** Validate and bundle the source, then build the run's context from the options. */
export async function createDocumentRun(
  source: string | URL | OpenAPI3 | Buffer | Readable,
  options: GeneratorOptions,
): Promise<DocumentRun> {
  if (!source) {
    throw new Error("Empty schema. Please specify a URL, file path, or Redocly Config");
  }
  const redoc = options.redocly ?? (await defaultRedoclyConfig());
  const silent = options.silent ?? false;
  const schema = await validateAndBundle(source, { redoc, cwd: sourceCwd(options), silent });
  const ctx: GlobalContext = {
    ...contextFlags(options),
    discriminators: scanDiscriminators(schema, options),
    injectFooter: [],
    redoc,
    resolve: ($ref) => resolveRef(schema, $ref, { silent }),
  };
  return { schema, ctx };
}
