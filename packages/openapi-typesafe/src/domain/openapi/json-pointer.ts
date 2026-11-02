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

/** Escape one segment for a JSON Pointer (`~` → `~0`, `/` → `~1`). */
export function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Join parts into a local `$ref` (the original `createRef`). Empty parts are skipped. A part that
 * is itself a `$ref` contributes its segments; any other part is one segment.
 */
export function createRef(parts: readonly (string | number | null | undefined)[]): string {
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
