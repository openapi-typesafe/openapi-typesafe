import {
  appendPointer,
  parseRefPointer,
  ROOT_POINTER,
} from "../../../domain/openapi/json-pointer.js";
import type { TypePlacement } from "./schema-rule.js";

/**
 * The pointer an `--enum-values` array reads its schema's type at in the generated types
 * (`FlattenedDeepRequired<paths>["/a"]["get"]["parameters"]["query"]["status"]`). It is built from
 * the schema's location and must follow the generated shape wherever that differs from it.
 */

const UNION_KEYWORDS: ReadonlySet<string> = new Set(["anyOf", "oneOf"]);
const INDEX_RE = /^\d+$/;

function isUnionPosition(pointer: readonly string[], index: number): boolean {
  const next = pointer[index + 1];
  return UNION_KEYWORDS.has(pointer[index] as string) && next !== undefined && INDEX_RE.test(next);
}

const PARAMETERS = "parameters";

/** Where the `parameters` of a path item sit in its pointer: `paths/<key>/…`, `components/…`. */
function pathItemParametersIndex(pointer: readonly string[]): number | null {
  if (pointer[0] === "paths" || pointer[0] === "webhooks") {
    return 2;
  }
  return pointer[0] === "components" && pointer[1] === "pathItems" ? 3 : null;
}

/**
 * The location of a path item parameter repeats `parameters` (`paths/~1a/parameters/parameters/
 * path/id`), which keeps the generated names as they were. The generated type has the segment
 * once: `paths["/a"]["parameters"]["path"]["id"]`.
 */
function withSingleParametersSegment(pointer: readonly string[]): readonly string[] {
  const index = pathItemParametersIndex(pointer);
  const isRepeated =
    index !== null && pointer[index] === PARAMETERS && pointer[index + 1] === PARAMETERS;
  return isRepeated ? [...pointer.slice(0, index), ...pointer.slice(index + 1)] : pointer;
}

/**
 * The segments of a location's pointer as the generated types hold them: a location under the
 * placement's location is under its type path (an exploded query object's properties are keys of
 * `query`).
 */
function placedSegments(path: string, placement: TypePlacement | undefined): readonly string[] {
  const segments = parseRefPointer(path);
  if (placement === undefined) {
    return segments;
  }
  const location = parseRefPointer(placement.locationPath);
  const isUnder = location.every((segment, index) => segments[index] === segment);
  return isUnder
    ? [...parseRefPointer(placement.typePath), ...segments.slice(location.length)]
    : segments;
}

/**
 * The pointer of `--enum-values` arrays without union positions (`anyOf/0`), so names stay
 * stable. Every property after the first union position is narrowed with `Extract`: a no-op where
 * all variants have it, and the needed narrowing where only some do.
 */
export function enumValuesPointer(
  path: string | undefined,
  placement?: TypePlacement,
): { ref: string; extract: string[] } {
  const pointer = withSingleParametersSegment(placedSegments(path ?? "", placement));
  const kept: string[] = [];
  let firstVariantStart: number | null = null;
  for (let index = 0; index < pointer.length; index++) {
    if (isUnionPosition(pointer, index)) {
      firstVariantStart ??= index + 2;
      index++;
      continue;
    }
    kept.push(pointer[index] as string);
  }
  const extract =
    firstVariantStart === null
      ? []
      : pointer
          .slice(firstVariantStart)
          .filter((segment) => !UNION_KEYWORDS.has(segment) && !INDEX_RE.test(segment));
  return { ref: appendPointer(ROOT_POINTER, kept), extract };
}
