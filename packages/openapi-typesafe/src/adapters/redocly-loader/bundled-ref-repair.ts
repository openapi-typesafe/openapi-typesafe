import { escapePointerSegment, parseRefPointer } from "../../domain/openapi/json-pointer.js";
import { findRefHolders } from "./ref-holders.js";

/**
 * Redocly 1.x bundles an external `$ref` into a component named after the raw segment of the
 * original pointer (`a~0b`, `50%`), and writes the new local `$ref` without escaping it. Read as a
 * JSON Pointer, `#/components/schemas/a~0b` names the key `a~b`, which does not exist, and
 * `#/components/schemas/50%` is malformed, so the generator failed on it. This rewrites every
 * local `$ref` that does not resolve as a pointer but does resolve segment by segment as written.
 */

const LOCAL_REF_PREFIX = "#/";

function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function childAt(node: unknown, segment: string): unknown {
  if (!isContainer(node) || !Object.hasOwn(node, segment)) {
    return undefined;
  }
  return (node as Record<string, unknown>)[segment];
}

function resolves(document: unknown, segments: readonly string[]): boolean {
  return segments.reduce<unknown>(childAt, document) !== undefined;
}

/** The pointer's segments, or null when the pointer has a malformed percent escape. */
function decodedSegments(ref: string): string[] | null {
  try {
    return parseRefPointer(ref);
  } catch (error) {
    if (error instanceof URIError) {
      return null;
    }
    throw error;
  }
}

/** The repaired `$ref`, or null when the ref resolves already or cannot be repaired. */
function repairedRef(document: unknown, ref: string): string | null {
  const decoded = decodedSegments(ref);
  if (decoded && resolves(document, decoded)) {
    return null;
  }
  const raw = ref.slice(LOCAL_REF_PREFIX.length).split("/").filter(Boolean);
  if (!resolves(document, raw)) {
    return null;
  }
  return `${LOCAL_REF_PREFIX}${raw.map(escapePointerSegment).join("/")}`;
}

/** Repair the local `$ref`s of a bundled document in place, as Redocly's bundle edits it. */
export function repairBundledRefs(document: unknown): void {
  for (const { node } of findRefHolders(document)) {
    if (!node.$ref.startsWith(LOCAL_REF_PREFIX)) {
      continue;
    }
    const repaired = repairedRef(document, node.$ref);
    if (repaired !== null) {
      node.$ref = repaired;
    }
  }
}
