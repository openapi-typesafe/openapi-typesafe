import { createRedoclySchemaLoader } from "../adapters/redocly-loader/redocly-schema-loader.js";
import type { Logger } from "../application/ports/logger.js";
import { withStackOverflowReported } from "../application/stack-overflow.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { GeneratorOptions, OpenAPITSOptions, SchemaSource } from "../types.js";
import {
  DEFAULT_REMOTE_DOCUMENT_LIMITS,
  defaultDeprecationReporter,
  defaultLogger,
  defaultRedoclyConfig,
  monotonicNow,
  REMOTE_REF_TIMEOUT_MS,
} from "./default-ports.js";
import { createDocumentRun, type GeneratorPorts } from "./document-run.js";
import { checkOptionTypes } from "./option-types.js";
import transformSchema from "./transform-schema.js";

/**
 * The Node API's composition root (ENGINEERING_PLAN 4.5): `openapiTS` wires the default adapters;
 * `generateDeclarations` runs with any ports, which is how the CLI calls it.
 */

/** The declarations of one document, and the local files it was read from. */
export interface GeneratedDocument {
  readonly declarations: IrDeclaration[];
  readonly localFiles: readonly URL[];
}

/** Load, validate and bundle the source, then transform it into IR declarations. */
export async function generateDocument(
  source: SchemaSource,
  options: GeneratorOptions,
  ports: GeneratorPorts,
): Promise<GeneratedDocument> {
  const { schema, localFiles, ctx } = await createDocumentRun(source, options, ports);
  const startedAt = ports.now();
  const declarations = withStackOverflowReported("transform", () => transformSchema(schema, ctx));
  ports.logger.debug(
    "Completed AST transformation for entire document",
    "ts",
    ports.now() - startedAt,
  );
  return { declarations, localFiles };
}

/** As `generateDocument`, the declarations only. */
export async function generateDeclarations(
  source: SchemaSource,
  options: GeneratorOptions,
  ports: GeneratorPorts,
): Promise<IrDeclaration[]> {
  return (await generateDocument(source, options, ports)).declarations;
}

/**
 * The default ports: the terminal logger, Node.js deprecation warnings, the given or default
 * Redocly config, Redocly loading. A given `logger` takes every line, the loader's included.
 */
export async function defaultGeneratorPorts(
  options: GeneratorOptions,
  logger: Logger = defaultLogger(options.silent ?? false),
): Promise<GeneratorPorts> {
  const redoc = options.redocly ?? (await defaultRedoclyConfig());
  const loader = createRedoclySchemaLoader({
    redoc,
    logger,
    now: monotonicNow,
    remoteRefTimeoutMs: REMOTE_REF_TIMEOUT_MS,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  return { loader, logger, deprecations: defaultDeprecationReporter(), redoc, now: monotonicNow };
}

/**
 * Convert an OpenAPI schema to TypeScript declarations (IR nodes; print them with `astToString`)
 * @param {string|URL|object|Readable} source OpenAPI schema source:
 *   - YAML: string
 *   - JSON: parsed object
 *   - URL: URL to a YAML or JSON file (local or remote)
 *   - Readable: Readable stream of YAML or JSON
 */
export default function openapiTS(
  source: SchemaSource,
  options?: OpenAPITSOptions,
): Promise<IrDeclaration[]>;
// The options without `irCallbacks` get their own signature: TypeScript does not pick a member of
// `GeneratorOptions | undefined` (an optional parameter) by a key that the object leaves out, so
// inline callbacks had implicit `any` parameters (TS7006). `irCallbacks: true` picks the member
// here.
/** Convert an OpenAPI schema to IR declarations, with either form of the options. */
export default function openapiTS(
  source: SchemaSource,
  options?: GeneratorOptions,
): Promise<IrDeclaration[]>;
// The same call with the options required. It adds no call that the signature above does not
// take: it is last because `Parameters<typeof openapiTS>` reads the last signature, and a wrapper
// typed from it must give inline callbacks their types. TypeScript picks a member of
// `GeneratorOptions` by a key the object leaves out, but not of `GeneratorOptions | undefined`.
/** Convert an OpenAPI schema to IR declarations, with either form of the options. */
export default function openapiTS(
  source: SchemaSource,
  options: GeneratorOptions,
): Promise<IrDeclaration[]>;
export default async function openapiTS(
  source: SchemaSource,
  options: GeneratorOptions = {},
): Promise<IrDeclaration[]> {
  checkOptionTypes(options);
  return generateDeclarations(source, options, await defaultGeneratorPorts(options));
}
