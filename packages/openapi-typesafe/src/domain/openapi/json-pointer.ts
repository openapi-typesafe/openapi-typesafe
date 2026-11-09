/**
 * The JSON Pointer of a `$ref` as path segments, with the semantics of Redocly's `parseRef`, which
 * the original generator used: the part after the first `#/`, split at `/`, each segment unescaped
 * (`~1` → `/`, `~0` → `~`, then percent-decoding), and empty segments dropped.
 *
 * Throws URIError for a malformed percent escape, as the original does.
 */
export function parseRefPointer(ref: string): string[] {
  const [, pointer = ""] = ref.split("#/");
  return pointer
    .split("/")
    .map(unescapePointerSegment)
    .filter((segment) => segment.length > 0);
}

function unescapePointerSegment(segment: string): string {
  return decodeURIComponent(segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/**
 * Escape one segment for a JSON Pointer in a `$ref` fragment: `~` → `~0` and `/` → `~1` (RFC 6901),
 * then `%` → `%25` and `#` → `%23`, the two characters of a key that a URI fragment cannot hold as
 * written (RFC 6901 §6, RFC 3986). Reading a pointer back percent-decodes it, so the original's
 * unescaped `%` threw URIError for `50%` and read `a%2Fb` as `a/b` (upstream #2251, #2828), and
 * reading starts at the first `#/`, so an unescaped key `a#` cut the pointer short.
 */
export function escapePointerSegment(segment: string): string {
  return segment
    .replaceAll("~", "~0")
    .replaceAll("/", "~1")
    .replaceAll("%", "%25")
    .replaceAll("#", "%23");
}

/** The pointer of the document root. */
export const ROOT_POINTER = "#";

/** A raw pointer segment; a missing one (`undefined`, `null` or empty) is skipped. */
export type PointerSegment = string | number | null | undefined;

/**
 * Extend the pointer `base` with raw segments: document keys, such as a path, a property name or a
 * media type, and array indexes. Each segment is escaped and never read as a `$ref`, so a key like
 * `#/%41` stays one segment and reads back unchanged with {@link parseRefPointer}. A missing
 * segment, such as the absent `name` of a parameter, is skipped, as the original `createRef` did,
 * and an empty one too, because `parseRefPointer` drops it.
 */
export function appendPointer(
  base: string | undefined,
  segments: readonly PointerSegment[],
): string {
  let pointer = pointerBase(base);
  for (const segment of segments) {
    if (segment !== undefined && segment !== null && segment !== "") {
      pointer = childPointer(pointer, String(segment));
    }
  }
  return pointer;
}

/**
 * The pointer of the child `key` of the node at `pointer`, with `key` escaped. Unlike
 * {@link appendPointer}, an empty key is a child too: a document walk names every key it visits.
 */
export function childPointer(pointer: string, key: string): string {
  return `${pointer}/${escapePointerSegment(key)}`;
}

/**
 * A local `$ref` or `mapping` value in the form {@link appendPointer} builds, so that pointers
 * compare as text whatever escapes the document chose: `.../a#b` and `.../a%23b` are both
 * `.../a%23b`. Redocly writes a bundled `mapping` value percent-decoded, which is no pointer for a
 * key with `%` (`.../50%`), so such a text is read as written. Any other text, such as an
 * external `$ref` or a bare schema name, is returned unchanged.
 */
export function canonicalRef(ref: string): string {
  if (!ref.startsWith(`${ROOT_POINTER}/`)) {
    return ref;
  }
  return appendPointer(ROOT_POINTER, refSegments(ref));
}

function refSegments(ref: string): string[] {
  try {
    return parseRefPointer(ref);
  } catch (error) {
    if (!(error instanceof URIError)) {
      throw error;
    }
    return writtenSegments(ref);
  }
}

/** The segments of a pointer that is not percent-encoded: only `~1` and `~0` are escapes. */
function writtenSegments(ref: string): string[] {
  return ref
    .slice(ROOT_POINTER.length + 1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/**
 * A pointer (`#` or `#/...`) is kept as written; a missing base is the root. Any other text is a
 * `path` given to the exported transformers, such as `/items/{id}` or `other.yaml#/a`, which the
 * original read as a `createRef` part, so it is read the same way here.
 */
function pointerBase(base: string | undefined): string {
  if (base === undefined || base === "") {
    return ROOT_POINTER;
  }
  return base === ROOT_POINTER || base.startsWith(`${ROOT_POINTER}/`) ? base : createRef([base]);
}

/**
 * Join parts into a local `$ref` (the original `createRef`, exported for 1.x by ADR-034). Empty
 * parts are skipped. A part that contains `#/` is parsed as a `$ref` and contributes its decoded
 * segments, so it throws URIError for a malformed percent escape; any other part is one segment.
 * Because of that parsing, the generator does not pass document keys here: it builds pointers
 * with {@link appendPointer}, which never parses a segment.
 */
export function createRef(parts: readonly PointerSegment[]): string {
  let ref = "#";
  for (const part of parts) {
    if (part === undefined || part === null || part === "") {
      continue;
    }
    const text = String(part);
    const segments = parseRefPointer(text);
    for (const segment of segments.length > 0 ? segments : [text]) {
      ref += `/${escapePointerSegment(segment)}`;
    }
  }
  return ref;
}
