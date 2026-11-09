import { type Document, parseYaml, type Source } from "@redocly/openapi-core";
import type { OpenAPITypesafeError } from "../../domain/errors.js";
import { refForbiddenError } from "./schema-load-errors.js";

/**
 * Bounds the parsed size of the remote documents of one load (threat model T2). The byte limits
 * do not bound memory: parsing multiplies it by the density of the text, and 250 MiB of `{},`
 * (87 million empty objects, under a quarter of a megabyte as gzip) took the process past its
 * 4 GB heap. The parser reports every node it builds, keys included, and the parse stops when
 * the nodes of all remote documents of the load pass the limit, before their memory is taken.
 */

/** The extensions that Redocly 1.34's `BaseResolver.parseDocument` parses as YAML or JSON. */
const PARSED_EXTENSIONS: ReadonlySet<string> = new Set([".json", ".yml", ".yaml"]);
const PARSED_MIME_TYPE = /(json|yaml|openapi)/;
const REMOTE_URL_RE = /^https?:\/\//;
const PATH_SEPARATOR_RE = /[/\\]/;
const EXTENSION_START = ".";

/** The extension of the last segment of a path, with its dot; empty when it has none. */
function extensionOf(path: string): string {
  const name = path.split(PATH_SEPARATOR_RE).at(-1) ?? "";
  const start = name.lastIndexOf(EXTENSION_START);
  return start === -1 ? "" : name.slice(start);
}

/**
 * The path of a document: the path of a URL, without its query and fragment, or the file path.
 * Redocly took the extension of the whole URL, so `pet.yaml?token=…` had none it knew.
 */
function documentPath(absoluteRef: string): string {
  return REMOTE_URL_RE.test(absoluteRef) && URL.canParse(absoluteRef)
    ? new URL(absoluteRef).pathname
    : absoluteRef;
}

/**
 * Whether a source is parsed as YAML or JSON, or kept as text (a Markdown `description`, say).
 * It is parsed when it is the root, when its type or the extension of its path says JSON or YAML,
 * and when it is a URL whose path has no extension: an API serves its documents at paths like
 * `/schemas/pet`, often as `text/plain`, and Redocly kept those as text, which failed as a
 * schema. A local file without an extension is kept as text, as Redocly keeps it.
 */
export function isParsedSource(source: Source, isRoot: boolean): boolean {
  const { absoluteRef, mimeType } = source;
  const extension = extensionOf(documentPath(absoluteRef));
  const isExtensionlessUrl = REMOTE_URL_RE.test(absoluteRef) && extension === "";
  return (
    isRoot ||
    PARSED_EXTENSIONS.has(extension) ||
    PARSED_MIME_TYPE.test(mimeType ?? "") ||
    isExtensionlessUrl
  );
}

/** The parser's event for a node it starts to build. */
const NODE_OPENED = "open";

/** One instance per load: the count covers every remote document of that load. */
export class RemoteNodeLimit {
  readonly #maxNodes: number;
  #nodes = 0;

  constructor(maxNodes: number) {
    this.#maxNodes = maxNodes;
  }

  /**
   * The parsed document of `source`, as Redocly parses it. Fails with `SCHEMA_REF_FORBIDDEN`
   * (`remote-documents-too-many-nodes`) once the nodes of the load pass the limit.
   */
  parse(source: Source): Document {
    const listener = (event: string): void => {
      if (event !== NODE_OPENED) {
        return;
      }
      this.#nodes += 1;
      const refusal = this.#refusal(source.absoluteRef);
      if (refusal !== undefined) {
        throw refusal;
      }
    };
    return { source, parsed: parseYaml(source.body, { filename: source.absoluteRef, listener }) };
  }

  #refusal(url: string): OpenAPITypesafeError | undefined {
    return this.#nodes > this.#maxNodes
      ? refForbiddenError(url, {
          reason: "remote-documents-too-many-nodes",
          maxNodes: this.#maxNodes,
        })
      : undefined;
  }
}
