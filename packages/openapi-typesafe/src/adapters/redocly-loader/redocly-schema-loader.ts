import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  BaseResolver,
  bundle,
  type Document,
  lintDocument,
  makeDocumentFromString,
  type NormalizedProblem,
  type Config as RedoclyConfig,
  Source,
} from "@redocly/openapi-core";
import parseJson from "parse-json";
import type { Logger } from "../../application/ports/logger.js";
import type { SchemaLoader, SchemaLoadRequest } from "../../application/ports/schema-loader.js";
import type { OpenAPI3 } from "../../types.js";
import {
  loadFailedError,
  parseFailedError,
  schemaInvalidError,
  sourceEmptyError,
  sourceInvalidError,
  versionUnsupportedError,
} from "./schema-load-errors.js";

/**
 * The SchemaLoader port on Redocly 1.34 (ADR-005): parse any inherited source type, then lint and
 * bundle with the given Redocly config. Problems go to the logger; errors fail the load.
 */
export interface RedoclySchemaLoaderOptions {
  readonly redoc: RedoclyConfig;
  readonly logger: Logger;
  /** A monotonic time in milliseconds, for the debug durations. */
  readonly now: () => number;
}

interface ParseSchemaOptions {
  absoluteRef: string;
  resolver: BaseResolver;
}

/** Read a stream to the end as UTF-8 text, trimmed. */
function readStream(stream: Readable): Promise<string> {
  return new Promise<string>((resolve) => {
    stream.resume();
    stream.setEncoding("utf8");
    let content = "";
    stream.on("data", (chunk: string) => {
      content += chunk;
    });
    stream.on("end", () => {
      resolve(content.trim());
    });
  });
}

const URL_PREFIXES = ["http://", "https://", "file://"] as const;

/** A string is a URL, JSON (starts with `{`) or YAML. */
function parseSchemaText(
  schema: string,
  options: ParseSchemaOptions,
): Promise<Document> | Document {
  if (URL_PREFIXES.some((prefix) => schema.startsWith(prefix))) {
    const url = new URL(schema);
    const absoluteRef = url.protocol === "file:" ? fileURLToPath(url) : url.href;
    return parseSchema(url, { absoluteRef, resolver: options.resolver });
  }
  return schema[0] === "{"
    ? parseJsonText(schema, options.absoluteRef)
    : parseYamlText(schema, options.absoluteRef);
}

function parseJsonText(text: string, absoluteRef: string): Document {
  try {
    return { source: new Source(absoluteRef, text, "application/json"), parsed: parseJson(text) };
  } catch (cause) {
    throw parseFailedError("json", absoluteRef, cause);
  }
}

function parseYamlText(text: string, absoluteRef: string): Document {
  try {
    return makeDocumentFromString(text, absoluteRef);
  } catch (cause) {
    throw parseFailedError("yaml", absoluteRef, cause);
  }
}

/** The resolver throws for some failures (a missing file) and returns an error for others. */
async function resolveSchemaURL(options: ParseSchemaOptions): Promise<Document> {
  const result = await options.resolver
    .resolveDocument(null, options.absoluteRef, true)
    .catch((cause: unknown) => {
      throw loadFailedError(options.absoluteRef, cause);
    });
  if ("parsed" in result) {
    return result;
  }
  throw loadFailedError(options.absoluteRef, result.originalError);
}

function parseSchemaObject(schema: unknown, absoluteRef: string): Document {
  if (typeof schema === "object" && !Array.isArray(schema)) {
    return {
      source: new Source(absoluteRef, JSON.stringify(schema), "application/json"),
      parsed: schema,
    };
  }
  throw sourceInvalidError(schema);
}

/** Parse any supported source: URL, stream, buffer, URL or document text, or a plain object. */
export async function parseSchema(schema: unknown, options: ParseSchemaOptions): Promise<Document> {
  if (!schema) {
    throw sourceEmptyError("Can’t parse empty schema");
  }
  if (schema instanceof URL) {
    return resolveSchemaURL(options);
  }
  if (schema instanceof Readable) {
    return parseSchema(await readStream(schema), options);
  }
  if (schema instanceof Buffer) {
    return parseSchema(schema.toString("utf8"), options);
  }
  if (typeof schema === "string") {
    return parseSchemaText(schema, options);
  }
  return parseSchemaObject(schema, options.absoluteRef);
}

/** Accept OpenAPI 3.x only; Swagger 2 and other formats get their own message. */
function assertOpenAPI3(parsed: Record<string, unknown>): void {
  const openapiVersion = Number.parseFloat(parsed.openapi as string);
  const isOpenAPI3 =
    !parsed.swagger &&
    Boolean(parsed.openapi) &&
    !Number.isNaN(openapiVersion) &&
    openapiVersion >= 3 &&
    openapiVersion < 4;
  if (isOpenAPI3) {
    return;
  }
  if (parsed.swagger) {
    throw versionUnsupportedError(
      "Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.",
      parsed,
    );
  }
  if (parsed.openapi || openapiVersion < 3 || openapiVersion >= 4) {
    throw versionUnsupportedError(`Unsupported OpenAPI version: ${parsed.openapi}`, parsed);
  }
  throw versionUnsupportedError("Unsupported schema format, expected `openapi: 3.x`", parsed);
}

/** The base for relative `$ref`s: the source file or URL itself, else the working directory. */
function sourceAbsoluteRef(source: unknown, cwd: URL): string {
  if (source instanceof URL) {
    return source.protocol === "file:" ? fileURLToPath(source) : source.href;
  }
  return fileURLToPath(cwd);
}

class RedoclySchemaLoader implements SchemaLoader {
  readonly #options: RedoclySchemaLoaderOptions;

  constructor(options: RedoclySchemaLoaderOptions) {
    this.#options = options;
  }

  async load(request: SchemaLoadRequest): Promise<OpenAPI3> {
    const { logger, now, redoc } = this.#options;
    const configLoadedAt = now();
    logger.debug("Loaded Redoc config", "redoc", now() - configLoadedAt);
    const parseStartedAt = now();
    const absoluteRef = sourceAbsoluteRef(request.source, request.cwd);
    const resolver = new BaseResolver(redoc.resolve);
    const document = await parseSchema(request.source, { absoluteRef, resolver });
    logger.debug("Parsed schema", "redoc", now() - parseStartedAt);
    assertOpenAPI3(document.parsed);
    if (request.shouldLint) {
      await this.#lint(document, resolver);
    }
    return this.#bundle(document);
  }

  async #lint(document: Document, resolver: BaseResolver): Promise<void> {
    const startedAt = this.#options.now();
    const problems = await lintDocument({
      document,
      config: this.#options.redoc.styleguide,
      externalRefResolver: resolver,
    });
    this.#report(problems);
    this.#options.logger.debug("Linted schema", "lint", this.#options.now() - startedAt);
  }

  async #bundle(document: Document): Promise<OpenAPI3> {
    const startedAt = this.#options.now();
    const bundled = await bundle({
      config: this.#options.redoc,
      dereference: false,
      doc: document,
    });
    this.#report(bundled.problems);
    this.#options.logger.debug("Bundled schema", "bundle", this.#options.now() - startedAt);
    return bundled.bundle.parsed;
  }

  /** Report every problem; then throw if any of them is an error. */
  #report(problems: readonly NormalizedProblem[]): void {
    const errorMessages: string[] = [];
    for (const problem of problems) {
      const message = problemMessage(problem);
      if (problem.severity === "error") {
        errorMessages.push(message);
        this.#options.logger.error(message);
      } else {
        this.#options.logger.warn(message);
      }
    }
    if (errorMessages.length > 0) {
      throw schemaInvalidError(errorMessages);
    }
  }
}

function problemMessage(problem: NormalizedProblem): string {
  const location = problem.location?.[0]?.pointer;
  return location ? `${problem.message} at ${location}` : problem.message;
}

/** A schema loader with one Redocly config and logger, for one or more loads. */
export function createRedoclySchemaLoader(options: RedoclySchemaLoaderOptions): SchemaLoader {
  return new RedoclySchemaLoader(options);
}
