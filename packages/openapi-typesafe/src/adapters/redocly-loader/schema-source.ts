import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import {
  type BaseResolver,
  type Document,
  parseYaml,
  ResolveError,
  Source,
  YamlParseError,
} from "@redocly/openapi-core";
import parseJson from "parse-json";
import type { SchemaLoadRequest } from "../../application/ports/schema-loader.js";
import { assertNever } from "../../domain/assert-never.js";
import { locationInText, parseUrlLocation } from "../../domain/location-text.js";
import { aliasExpansionFailure } from "./alias-limit.js";
import {
  loadFailedError,
  parseFailedError,
  pathStringError,
  sourceEmptyError,
  sourceInvalidError,
  type TextOrigin,
  urlInvalidError,
} from "./schema-load-errors.js";

/** Parse a schema source of any supported type into a Redocly document (ENGINEERING_PLAN 4.5). */

/**
 * A source once its text is read: a URL, document text, or an object. Text that is a location
 * is a URL here, whether it came as a string, a buffer or a stream, so every later step (the name
 * of the root, its redirects, whether it is a file) treats it exactly as a `URL` source.
 */
export type ResolvedSource =
  | { readonly kind: "url"; readonly url: URL }
  | { readonly kind: "text"; readonly text: string; readonly origin: TextOrigin }
  | { readonly kind: "object"; readonly value: unknown };

/** A load request whose source has been resolved. */
export interface ResolvedLoadRequest extends Omit<SchemaLoadRequest, "source"> {
  readonly source: ResolvedSource;
}

/**
 * The name an inline source (a string, object, buffer or stream) gets inside the working
 * directory. Redocly resolves relative `$ref`s against the directory of the document, so the
 * document must be named as a file in the working directory, not as the directory itself.
 */
const INLINE_SOURCE_NAME = "inline-source";

const FILE_PROTOCOL = "file:";

/**
 * The path of a `file:` source. A URL that names no path on this platform (an encoded slash, a
 * host on POSIX, no drive letter on Windows) cannot be read, so it fails as a read would.
 */
function sourceFilePath(source: URL): string {
  try {
    return fileURLToPath(source);
  } catch (error) {
    // Node.js reports these as TypeErrors (ERR_INVALID_FILE_URL_PATH, ERR_INVALID_FILE_URL_HOST).
    if (!(error instanceof TypeError)) {
      throw error;
    }
    throw loadFailedError(source.href, error);
  }
}

/** The name of a URL source: the path of a file, else the URL. */
function urlAbsoluteRef(url: URL): string {
  return url.protocol === FILE_PROTOCOL ? sourceFilePath(url) : url.href;
}

/** The name of an inline source, which is also the base of its relative `$ref`s. */
function inlineAbsoluteRef(cwd: URL): string {
  return urlAbsoluteRef(new URL(INLINE_SOURCE_NAME, cwd));
}

/** The base for relative `$ref`s: the source file or URL itself, else a file in the cwd. */
export function sourceAbsoluteRef(source: ResolvedSource, cwd: URL): string {
  return source.kind === "url" ? urlAbsoluteRef(source.url) : inlineAbsoluteRef(cwd);
}

/** The URL of a source that is a URL, also when it was given as text. */
export function rootUrlOf(source: ResolvedSource): URL | undefined {
  return source.kind === "url" ? source.url : undefined;
}

/** Whether the source is a local file, also when its `file:` URL was given as text. */
export function isFileSource(source: ResolvedSource): boolean {
  return rootUrlOf(source)?.protocol === FILE_PROTOCOL;
}

export interface ParseSchemaOptions {
  absoluteRef: string;
  resolver: BaseResolver;
}

/**
 * Read a stream to the end as UTF-8 text, trimmed. A stream that fails rejects with
 * SCHEMA_LOAD_FAILED; listening only for `data` and `end` left the promise pending forever.
 */
async function readStream(stream: Readable, absoluteRef: string): Promise<string> {
  try {
    return (await text(stream)).trim();
  } catch (error) {
    throw loadFailedError(absoluteRef, error);
  }
}

const EMPTY_SOURCE_MESSAGE = "Can’t parse empty schema";

/** Text of a schema source, where it came from, and the directory its relative URL names. */
interface SchemaText {
  readonly text: string;
  readonly origin: TextOrigin;
  readonly cwd: URL;
}

/**
 * Text is a location or document text, by the rule the CLI applies to its schema argument
 * (`locationInText`). A location resolves against `cwd` as that argument does (`file:api.yaml`);
 * one that does not parse as a URL fails with `SCHEMA_SOURCE_INVALID`, not a `TypeError`.
 */
function resolveSchemaText({ text, origin, cwd }: SchemaText): ResolvedSource {
  if (!text) {
    throw sourceEmptyError(EMPTY_SOURCE_MESSAGE);
  }
  const location = locationInText(text);
  if (location === undefined) {
    return { kind: "text", text, origin };
  }
  const url = parseUrlLocation(location, cwd);
  if (url === undefined) {
    throw urlInvalidError(location, origin);
  }
  return { kind: "url", url };
}

/**
 * Read the text of a stream or buffer, and turn text that is a location into its URL. `cwd` is
 * the base of a relative location, and names a stream that fails to read.
 */
export async function resolveSchemaSource(schema: unknown, cwd: URL): Promise<ResolvedSource> {
  if (!schema) {
    throw sourceEmptyError(EMPTY_SOURCE_MESSAGE);
  }
  if (schema instanceof URL) {
    return { kind: "url", url: schema };
  }
  if (schema instanceof Readable) {
    const text = await readStream(schema, inlineAbsoluteRef(cwd));
    return resolveSchemaText({ text, origin: "stream", cwd });
  }
  if (schema instanceof Buffer) {
    return resolveSchemaText({ text: schema.toString("utf8"), origin: "string", cwd });
  }
  if (typeof schema === "string") {
    return resolveSchemaText({ text: schema, origin: "string", cwd });
  }
  return { kind: "object", value: schema };
}

/** Document text is JSON (it starts with `{`) or YAML. */
function parseSchemaText(schema: string, absoluteRef: string, origin: TextOrigin): Document {
  return schema[0] === "{"
    ? parseJsonText(schema, absoluteRef)
    : parseYamlText(schema, absoluteRef, origin);
}

function parseJsonText(text: string, absoluteRef: string): Document {
  try {
    return { source: new Source(absoluteRef, text, "application/json"), parsed: parseJson(text) };
  } catch (cause) {
    throw parseFailedError("json", absoluteRef, cause);
  }
}

/**
 * How a parser message names document text that is no file. The document itself is named as a
 * file in the working directory, so that its relative `$ref`s resolve there, but no such file
 * exists, and a message that named it sent the user looking for it.
 */
const TEXT_ORIGIN_NAMES: Readonly<Record<TextOrigin, string>> = {
  string: "the schema string",
  stream: "the schema stream",
};

function parseYamlText(text: string, absoluteRef: string, origin: TextOrigin): Document {
  const source = new Source(absoluteRef, text);
  let document: Document;
  try {
    document = { source, parsed: parseYaml(text, { filename: TEXT_ORIGIN_NAMES[origin] }) };
  } catch (cause) {
    // As Redocly's own parse: the error keeps the first line, not the parser's code excerpt.
    throw parseFailedError("yaml", absoluteRef, new YamlParseError(cause as Error, source));
  }
  // Text that is only a YAML string scalar, such as "./openapi.yaml", was meant as a file path.
  if (typeof document.parsed === "string") {
    throw pathStringError(text, origin);
  }
  const failure = aliasExpansionFailure(document.parsed);
  if (failure !== undefined) {
    throw parseFailedError("yaml", absoluteRef, failure);
  }
  return document;
}

/** The resolver throws for some failures (a missing file) and returns an error for others. */
async function resolveSchemaURL(options: ParseSchemaOptions): Promise<Document> {
  const result = await options.resolver
    .resolveDocument(null, options.absoluteRef, true)
    .catch((cause: unknown) => {
      throw cause instanceof YamlParseError
        ? fileParseFailedError(options.absoluteRef, cause)
        : loadFailedError(options.absoluteRef, readerError(cause));
    });
  if ("parsed" in result) {
    return result;
  }
  throw loadFailedError(options.absoluteRef, readerError(result));
}

/**
 * Redocly wraps a failed read in `ResolveError`, which keeps the reader's error in
 * `originalError`, not in `cause`. Unwrapped, the cause keeps the network reason (refused, DNS).
 */
function readerError(error: unknown): unknown {
  let current = error;
  while (current instanceof ResolveError) {
    current = current.originalError;
  }
  return current;
}

/**
 * The resolver parses JSON files with its YAML parser too, so the format comes from the file
 * name. Some parser messages (a second YAML document) do not name the file; the error adds it.
 */
function fileParseFailedError(absoluteRef: string, error: YamlParseError): Error {
  const format = absoluteRef.toLowerCase().endsWith(".json") ? "json" : "yaml";
  const cause = error.message.includes(absoluteRef)
    ? error
    : new Error(`${error.message} in "${absoluteRef}"`, { cause: error });
  return parseFailedError(format, absoluteRef, cause);
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

/** Parse a resolved source: load the URL, parse the text, or take the object as it is. */
export async function parseSchema(
  source: ResolvedSource,
  options: ParseSchemaOptions,
): Promise<Document> {
  switch (source.kind) {
    case "url":
      return resolveSchemaURL(options);
    case "text":
      return parseSchemaText(source.text, options.absoluteRef, source.origin);
    case "object":
      return parseSchemaObject(source.value, options.absoluteRef);
    default:
      return assertNever(source);
  }
}
