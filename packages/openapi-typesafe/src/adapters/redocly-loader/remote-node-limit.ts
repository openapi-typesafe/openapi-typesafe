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

/** Whether Redocly parses this source, or keeps its text: the same rule as its own resolver. */
export function isParsedSource(source: Source, isRoot: boolean): boolean {
  const { absoluteRef, mimeType } = source;
  const extension = absoluteRef.slice(absoluteRef.lastIndexOf("."));
  return isRoot || PARSED_EXTENSIONS.has(extension) || PARSED_MIME_TYPE.test(mimeType ?? "");
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
