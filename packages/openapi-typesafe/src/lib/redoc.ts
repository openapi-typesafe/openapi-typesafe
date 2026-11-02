import { performance } from "node:perf_hooks";
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
import type { OpenAPI3 } from "../types.js";
import { debug, error, warn } from "./utils.js";

export interface ValidateAndBundleOptions {
  redoc: RedoclyConfig;
  silent: boolean;
  cwd?: URL;
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
  if (schema[0] === "{") {
    return {
      source: new Source(options.absoluteRef, schema, "application/json"),
      parsed: parseJson(schema),
    };
  }
  return makeDocumentFromString(schema, options.absoluteRef);
}

async function resolveSchemaURL(options: ParseSchemaOptions): Promise<Document> {
  const result = await options.resolver.resolveDocument(null, options.absoluteRef, true);
  if ("parsed" in result) {
    return result;
  }
  throw result.originalError;
}

function parseSchemaObject(schema: unknown, absoluteRef: string): Document {
  if (typeof schema === "object" && !Array.isArray(schema)) {
    return {
      source: new Source(absoluteRef, JSON.stringify(schema), "application/json"),
      parsed: schema,
    };
  }
  throw new Error(
    `Expected string, object, or Buffer. Got ${Array.isArray(schema) ? "Array" : typeof schema}`,
  );
}

/** Parse any supported source: URL, stream, buffer, URL or document text, or a plain object. */
export async function parseSchema(schema: unknown, options: ParseSchemaOptions): Promise<Document> {
  if (!schema) {
    throw new Error("Can’t parse empty schema");
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

/** Report every problem; throw the last error, after all of them are printed. */
function processProblems(problems: NormalizedProblem[], options: { silent: boolean }): void {
  let errorMessage: string | undefined;
  for (const problem of problems) {
    const problemLocation = problem.location?.[0].pointer;
    const problemMessage = problemLocation
      ? `${problem.message} at ${problemLocation}`
      : problem.message;
    if (problem.severity === "error") {
      errorMessage = problemMessage;
      error(problemMessage);
    } else {
      warn(problemMessage, options.silent);
    }
  }
  if (errorMessage) {
    throw new Error(errorMessage);
  }
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
    throw new Error("Unsupported Swagger version: 2.x. Use OpenAPI 3.x instead.");
  }
  if (parsed.openapi || openapiVersion < 3 || openapiVersion >= 4) {
    throw new Error(`Unsupported OpenAPI version: ${parsed.openapi}`);
  }
  throw new Error("Unsupported schema format, expected `openapi: 3.x`");
}

/** The base for relative `$ref`s: the source file or URL itself, else the working directory. */
function sourceAbsoluteRef(source: unknown, cwd: URL | undefined): string {
  if (source instanceof URL) {
    return source.protocol === "file:" ? fileURLToPath(source) : source.href;
  }
  return fileURLToPath(new URL(cwd ?? `file://${process.cwd()}/`));
}

async function lintSchema(
  document: Document,
  resolver: BaseResolver,
  options: ValidateAndBundleOptions,
): Promise<void> {
  const startedAt = performance.now();
  const problems = await lintDocument({
    document,
    config: options.redoc.styleguide,
    externalRefResolver: resolver,
  });
  processProblems(problems, options);
  debug("Linted schema", "lint", performance.now() - startedAt);
}

async function bundleSchema(document: Document, options: ValidateAndBundleOptions) {
  const startedAt = performance.now();
  const bundled = await bundle({ config: options.redoc, dereference: false, doc: document });
  processProblems(bundled.problems, options);
  debug("Bundled schema", "bundle", performance.now() - startedAt);
  return bundled.bundle.parsed;
}

/**
 * Validate an OpenAPI schema and flatten into a single schema using Redocly CLI
 */
export async function validateAndBundle(
  source: string | URL | OpenAPI3 | Readable | Buffer,
  options: ValidateAndBundleOptions,
) {
  const configLoadedAt = performance.now();
  debug("Loaded Redoc config", "redoc", performance.now() - configLoadedAt);
  const parseStartedAt = performance.now();
  const absoluteRef = sourceAbsoluteRef(source, options.cwd);
  const resolver = new BaseResolver(options.redoc.resolve);
  const document = await parseSchema(source, { absoluteRef, resolver });
  debug("Parsed schema", "redoc", performance.now() - parseStartedAt);
  assertOpenAPI3(document.parsed);
  await lintSchema(document, resolver, options);
  return bundleSchema(document, options);
}
