import type { LoadedDocument } from "./unsupported-keys.js";

/**
 * Which loaded document with a query each node comes from, and the names Redocly and the loader
 * give that document. Redocly names a component after the text behind the last `/` of the URL,
 * query included, so `pet.json?ref=feature/new-api` and `owner.yaml?ref=feature/new-api` both give
 * `new-api`: the name alone cannot tell the documents apart, the node can.
 */

const REMOTE_URL_RE = /^https?:\/\//;
const PATH_SEPARATOR_RE = /[/\\]/;
const EXTENSION_RE = /\.[^.]+$/;

/** The base name Redocly gives a document and the one without the query. */
export interface DocumentNames {
  readonly named: string;
  readonly clean: string;
}

/** The base name Redocly 1.34 gives a document (`refBaseName`): the last segment, no extension. */
function redoclyBaseName(ref: string): string {
  return (ref.split(PATH_SEPARATOR_RE).at(-1) ?? "").replace(EXTENSION_RE, "");
}

/**
 * The base name of the URL without its query and fragment. A URL with no last segment
 * (`https://host/?key=…`) is named after its host, so the name is never empty.
 */
function queryFreeBaseName(url: URL): string {
  const withoutQuery = new URL(url.pathname, url.origin).href;
  return redoclyBaseName(withoutQuery) || url.hostname;
}

/** The names of a remote document with a query whose Redocly name keeps it; else undefined. */
function documentNamesOf(ref: string): DocumentNames | undefined {
  const url = REMOTE_URL_RE.test(ref) && URL.canParse(ref) ? new URL(ref) : undefined;
  if (url === undefined || url.search === "") {
    return undefined;
  }
  const names = { named: redoclyBaseName(ref), clean: queryFreeBaseName(url) };
  return names.named === names.clean ? undefined : names;
}

function isNode(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Every object and array of a parsed document, each once (a YAML alias can repeat one). */
function nodesOf(parsed: unknown): object[] {
  const visited = new Set<object>();
  const pending = isNode(parsed) ? [parsed] : [];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (!visited.has(node)) {
      visited.add(node);
      pending.push(...Object.values(node).filter(isNode));
    }
  }
  return [...visited];
}

/**
 * The names of the document each node of a loaded document with a query belongs to. The bundle
 * keeps the nodes of the loaded documents as its components, so a component finds its document.
 */
export function queryDocumentNames(
  documents: readonly LoadedDocument[],
): ReadonlyMap<object, DocumentNames> {
  const byNode = new Map<object, DocumentNames>();
  for (const { source, parsed } of documents) {
    const names = documentNamesOf(source);
    if (names === undefined) {
      continue;
    }
    for (const node of nodesOf(parsed)) {
      byNode.set(node, names);
    }
  }
  return byNode;
}
