import { placeOf } from "../../../domain/openapi/document-places.js";
import { parseRefPointer, ROOT_POINTER } from "../../../domain/openapi/json-pointer.js";
import { QUERYSTRING_LOCATION } from "../../../domain/openapi/parameter-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import {
  childLocation,
  followLocated,
  followRefs,
  isJsonObject,
  type LocatedNode,
} from "./located-node.js";

/** The parts of a `$ref` pointer that both the original and the new types walk. */

export interface RefPointer {
  readonly rootSegment: string;
  /** The segments after the root: `#/components/schemas/A` gives `["schemas", "A"]`. */
  readonly segments: readonly string[];
}

/** Roots whose generated type is keyed by one segment: the path or webhook name. */
const NAMED_ROOTS: ReadonlySet<string> = new Set(["paths", "webhooks"]);

/**
 * How many segments after the root index the generated root type directly: one for `paths` and
 * `webhooks` (`paths["/a"]`, so the path item's own `parameters/0` is walked), two otherwise
 * (`components["schemas"]["A"]`).
 */
export function leadingSegmentsOf(pointer: RefPointer): number {
  return NAMED_ROOTS.has(pointer.rootSegment) ? 1 : 2;
}

export function refPointerOf(ref: string): RefPointer | null {
  const [rootSegment, ...segments] = parseRefPointer(ref);
  return rootSegment === undefined ? null : { rootSegment, segments };
}

/** The document node at the end of the leading segments, `$ref`s followed, with its location. */
export function leadingLocated(pointer: RefPointer, refs: RefResolver): LocatedNode {
  let located: LocatedNode = {
    node: refs.resolve(`#/${pointer.rootSegment}`),
    location: childLocation(ROOT_POINTER, pointer.rootSegment),
  };
  for (const segment of pointer.segments.slice(0, leadingSegmentsOf(pointer))) {
    const { node, location } = located;
    const child = isJsonObject(node) ? node[segment] : undefined;
    located = followLocated({ node: child, location: childLocation(location, segment) }, refs);
  }
  return located;
}

/** The node at the whole pointer, without following a `$ref` at its end. */
export function pointerNode(pointer: RefPointer, refs: RefResolver): unknown {
  let node = refs.resolve(`#/${pointer.rootSegment}`);
  pointer.segments.forEach((segment, index) => {
    const child = isJsonObject(node) || Array.isArray(node) ? (node as never)[segment] : undefined;
    node = index === pointer.segments.length - 1 ? child : followRefs(child, refs);
  });
  return node;
}

/** Whether the leading segments name a component schema, so the walk starts inside a schema. */
export function startsInSchema(pointer: RefPointer): boolean {
  return pointer.rootSegment === "components" && pointer.segments[0] === "schemas";
}

/**
 * Whether the container at `index` is typed as its `schema`: a media type
 * (`content/<media type>`), a header (`headers/<name>`) or a component parameter.
 */
export function isTypedAsSchema(pointer: RefPointer, index: number): boolean {
  const owner = pointer.segments[index - 2];
  const isComponentParameter =
    pointer.rootSegment === "components" && index === 2 && owner === "parameters";
  return owner === "content" || owner === "headers" || isComponentParameter;
}

/**
 * How the generated type of a header or component parameter holds its `content` (header.ts,
 * parameter.ts): one member per media type, the type of the first media type, `string` (a
 * parameter without the `parameter-header-content` fix), or not at all (a `schema` wins).
 */
export type ContentForm = "media-type-members" | "first-media-type" | "string" | "schema";

/**
 * The form of the `content` at `index` when it belongs to a header or a component parameter; null
 * for any other segment. An `in: querystring` parameter is typed by its `content` even next to a
 * `schema`.
 */
export function headerParameterContentForm(
  pointer: RefPointer,
  index: number,
  owner: unknown,
  options: SchemaOptions,
): ContentForm | null {
  const isHeader = pointer.segments[index - 2] === "headers";
  const isComponentParameter =
    pointer.rootSegment === "components" && index === 2 && pointer.segments[0] === "parameters";
  const isOwnContent = pointer.segments[index] === "content" && (isHeader || isComponentParameter);
  if (!isOwnContent || !isJsonObject(owner)) {
    return null;
  }
  const isFixed = options.fixes.has(FIX.PARAMETER_HEADER_CONTENT);
  if (isHeader) {
    if (owner.schema) {
      return "schema";
    }
    return isFixed ? "first-media-type" : "media-type-members";
  }
  if (owner.in === QUERYSTRING_LOCATION) {
    return "first-media-type";
  }
  if (owner.schema !== undefined) {
    return "schema";
  }
  return isFixed ? "first-media-type" : "string";
}

/**
 * Whether the segment at `index` is an operation's or path item's `parameters` list, indexed by
 * position next. The generated type groups parameters by `in` (`query`, `path`), so it has no
 * member `0`.
 */
export function isParameterList(pointer: RefPointer, index: number): boolean {
  const next = pointer.segments[index + 1] ?? "";
  return pointer.segments[index] === "parameters" && /^\d+$/.test(next);
}

/**
 * Whether the segment at `index` names a response header that is an optional member: one the
 * response lists without `required: true`. A `$ref` header counts as required, as the generated
 * type has it; a component header (`components/headers/<name>`) is a member of its own.
 */
export function isOptionalHeader(pointer: RefPointer, index: number, headers: unknown): boolean {
  const isComponentHeader = pointer.rootSegment === "components" && index === 1;
  if (pointer.segments[index - 1] !== "headers" || isComponentHeader || !isJsonObject(headers)) {
    return false;
  }
  const header = headers[pointer.segments[index] as string];
  return isJsonObject(header) && header.$ref === undefined && header.required !== true;
}

/**
 * Whether the segment at `index` names an operation that `--exclude-deprecated` leaves out: the
 * path item types it `never`, which has no member to index (`isIncludedOperation`).
 */
export function isExcludedOperation(
  pointer: RefPointer,
  index: number,
  pathItem: unknown,
  input: { readonly options: SchemaOptions; readonly refs: RefResolver },
): boolean {
  const segments = [pointer.rootSegment, ...pointer.segments.slice(0, index + 1)];
  if (!input.options.excludeDeprecated || placeOf(segments) !== "operation") {
    return false;
  }
  const segment = pointer.segments[index] as string;
  const operation = isJsonObject(pathItem) ? followRefs(pathItem[segment], input.refs) : undefined;
  return isJsonObject(operation) && Boolean(operation.deprecated);
}

/** A `requestBody` the operation does not mark `required` is an optional member. */
export function isOptionalRequestBody(container: unknown, refs: RefResolver): boolean {
  if (!isJsonObject(container) || container.requestBody === undefined) {
    return false;
  }
  const body = followRefs(container.requestBody, refs);
  return !(isJsonObject(body) && body.required === true);
}
