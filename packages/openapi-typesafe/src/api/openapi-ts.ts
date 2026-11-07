import { createRedoclySchemaLoader } from "../adapters/redocly-loader/redocly-schema-loader.js";
import { withStackOverflowReported } from "../application/stack-overflow.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { GeneratorOptions, SchemaSource } from "../types.js";
import {
  DEFAULT_REMOTE_DOCUMENT_LIMITS,
  defaultLogger,
  defaultRedoclyConfig,
  monotonicNow,
  REMOTE_REF_TIMEOUT_MS,
} from "./default-ports.js";
import { createDocumentRun, type GeneratorPorts } from "./document-run.js";
import transformSchema from "./transform-schema.js";

/**
 * The Node API's composition root (ENGINEERING_PLAN 4.5): `openapiTS` wires the default adapters;
 * `generateDeclarations` runs with any ports, which is how the CLI calls it.
 */

/** Load, validate and bundle the source, then transform it into IR declarations. */
export async function generateDeclarations(
  source: SchemaSource,
  options: GeneratorOptions,
  ports: GeneratorPorts,
): Promise<IrDeclaration[]> {
  const { schema, ctx } = await createDocumentRun(source, options, ports);
  const startedAt = ports.now();
  const result = withStackOverflowReported("transform", () => transformSchema(schema, ctx));
  ports.logger.debug(
    "Completed AST transformation for entire document",
    "ts",
    ports.now() - startedAt,
  );
  return result;
}

/** The default ports: the terminal logger, the given or default Redocly config, Redocly loading. */
export async function defaultGeneratorPorts(options: GeneratorOptions): Promise<GeneratorPorts> {
  const logger = defaultLogger(options.silent ?? false);
  const redoc = options.redocly ?? (await defaultRedoclyConfig());
  const loader = createRedoclySchemaLoader({
    redoc,
    logger,
    now: monotonicNow,
    remoteRefTimeoutMs: REMOTE_REF_TIMEOUT_MS,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  return { loader, logger, redoc, now: monotonicNow };
}

/**
 * Convert an OpenAPI schema to TypeScript declarations (IR nodes; print them with `astToString`)
 * @param {string|URL|object|Readable} source OpenAPI schema source:
 *   - YAML: string
 *   - JSON: parsed object
 *   - URL: URL to a YAML or JSON file (local or remote)
 *   - Readable: Readable stream of YAML or JSON
 */
export default async function openapiTS(
  source: SchemaSource,
  options: GeneratorOptions = {},
): Promise<IrDeclaration[]> {
  return generateDeclarations(source, options, await defaultGeneratorPorts(options));
}
