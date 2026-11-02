import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  type BaseResolver,
  type Document,
  makeDocumentFromString,
  Source,
} from "@redocly/openapi-core";
import parseJson from "parse-json";
import {
  loadFailedError,
  parseFailedError,
  sourceEmptyError,
  sourceInvalidError,
} from "./schema-load-errors.js";

/** Parse a schema source of any supported type into a Redocly document (ENGINEERING_PLAN 4.5). */

export interface ParseSchemaOptions {
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
