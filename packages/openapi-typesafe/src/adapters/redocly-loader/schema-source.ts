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

export interface ParseSchemaOptions {
  absoluteRef: string;
  resolver: BaseResolver;
  /** Where document text came from, for the message of text that is only a string. */
  textOrigin?: TextOrigin;
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

/** A URL source string; a scheme is the same in any case (RFC 3986, section 3.1). */
const URL_PREFIX_RE = /^(?:https?|file):\/\//i;

/**
 * A string is a URL, JSON (starts with `{`) or YAML. A string that starts like a URL but does not
 * parse as one fails with `SCHEMA_SOURCE_INVALID`, not the parser's `TypeError`.
 */
function parseSchemaText(
  schema: string,
  options: ParseSchemaOptions,
): Promise<Document> | Document {
  if (URL_PREFIX_RE.test(schema)) {
    const url = URL.parse(schema);
    if (url === null) {
      throw urlInvalidError(schema);
    }
    const absoluteRef = url.protocol === "file:" ? fileURLToPath(url) : url.href;
    return parseSchema(url, { absoluteRef, resolver: options.resolver });
  }
  return schema[0] === "{"
    ? parseJsonText(schema, options.absoluteRef)
    : parseYamlText(schema, options.absoluteRef, options.textOrigin ?? "string");
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

/** Parse any supported source: URL, stream, buffer, URL or document text, or a plain object. */
export async function parseSchema(schema: unknown, options: ParseSchemaOptions): Promise<Document> {
  if (!schema) {
    throw sourceEmptyError("Can’t parse empty schema");
  }
  if (schema instanceof URL) {
    return resolveSchemaURL(options);
  }
  if (schema instanceof Readable) {
    const text = await readStream(schema, options.absoluteRef);
    return parseSchema(text, { ...options, textOrigin: "stream" });
  }
  if (schema instanceof Buffer) {
    return parseSchema(schema.toString("utf8"), options);
  }
  if (typeof schema === "string") {
    return parseSchemaText(schema, options);
  }
  return parseSchemaObject(schema, options.absoluteRef);
}
