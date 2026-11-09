import { irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import {
  appendPointer,
  parseRefPointer,
  ROOT_POINTER,
} from "../../../domain/openapi/json-pointer.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import {
  type ParameterObject,
  type ParameterOrReference,
  QUERYSTRING_LOCATION,
} from "../../../domain/openapi/parameter-object.js";
import {
  ADDITIONAL_OPERATIONS_KEY,
  HTTP_METHODS,
  type PathItemObject,
  QUERY_METHOD,
} from "../../../domain/openapi/path-item-object.js";
import { indexBy, refType } from "../ref-type.js";
import type { RefResolver } from "../schema/schema-context.js";
import type { TransformContext } from "../transform-context.js";
import { mergedParameters, type ParameterEntry, parameterEntries } from "./parameter-entries.js";

/**
 * The type of a parameter `$ref`. The original indexed the parameter's location and name
 * (`refType`): `#/paths/~1a/get/parameters/0` gave
 * `paths["/a"]["get"]["parameters"]["query"]["q"]`.
 * Where the generated type differs, that does not compile, and only there it changes:
 *
 * - A location whose parameters are all optional is an optional member (`query?:`), so indexing it
 *   fails (TS2339); it is wrapped in `NonNullable` before the name is indexed.
 * - An OpenAPI 3.2 `in: querystring` parameter is the whole `query` member (ADR-020), not a member
 *   `querystring`, so the pointer reads `["query"]`.
 *
 * A `$ref` to a component parameter, or into a list the generator types elsewhere (a `$ref` path
 * item or operation, a callback), keeps the original type.
 */

const INDEX_RE = /^\d+$/;
const OPERATION_KEYS: ReadonlySet<string> = new Set([...HTTP_METHODS, QUERY_METHOD]);

/** A `parameters/N` pointer, split into its root and the segments of the list's owner. */
interface ParameterListPointer {
  readonly root: string;
  readonly owner: readonly string[];
}

function listPointerOf(ref: string): ParameterListPointer | null {
  if (!ref.startsWith(`${ROOT_POINTER}/`)) {
    return null;
  }
  const [root, ...segments] = parseRefPointer(ref);
  const [list, position] = segments.slice(-2);
  const isList = list === "parameters" && position !== undefined && INDEX_RE.test(position);
  return root !== undefined && isList ? { root, owner: segments.slice(0, -2) } : null;
}

function pointerTo(root: string, segments: readonly string[]): string {
  return appendPointer(ROOT_POINTER, [root, ...segments]);
}

/** Whether the segments name a path item that `pathItemType` types in place. */
function isPathItemAt(root: string, segments: readonly string[]): boolean {
  const isNamedRoot = root === "paths" || root === "webhooks";
  return (
    (isNamedRoot && segments.length === 1) ||
    (root === "components" && segments[0] === "pathItems" && segments.length === 2)
  );
}

/** The segments of the path item that holds the operation at `owner`, or null. */
function pathItemOfOperation(root: string, owner: readonly string[]): readonly string[] | null {
  const method = owner.at(-1) ?? "";
  if (OPERATION_KEYS.has(method) && isPathItemAt(root, owner.slice(0, -1))) {
    return owner.slice(0, -1);
  }
  const isAdditional = owner.at(-2) === ADDITIONAL_OPERATIONS_KEY;
  return isAdditional && isPathItemAt(root, owner.slice(0, -2)) ? owner.slice(0, -2) : null;
}

function documentNode<T>(refs: RefResolver, root: string, segments: readonly string[]): T | null {
  const node = refs.resolve(pointerTo(root, segments));
  const isTypedHere = typeof node === "object" && node !== null && !("$ref" in node);
  return isTypedHere ? (node as T) : null;
}

/** The parameters the generator types at the list's owner; null where it types them elsewhere. */
function typedParameters(
  pointer: ParameterListPointer,
  refs: RefResolver,
): readonly ParameterOrReference[] | null {
  const { root, owner } = pointer;
  if (isPathItemAt(root, owner)) {
    return documentNode<PathItemObject>(refs, root, owner)?.parameters ?? null;
  }
  const pathItemSegments = pathItemOfOperation(root, owner);
  const pathItem = pathItemSegments && documentNode<PathItemObject>(refs, root, pathItemSegments);
  const operation = pathItem && documentNode<OperationObject>(refs, root, owner);
  return pathItem && operation ? mergedParameters(pathItem, operation, refs) : null;
}

/** A location member is optional when none of its parameters is required (`locationParts`). */
function isLocationOptional(entries: readonly ParameterEntry[], location: string): boolean {
  return entries
    .filter((entry) => entry.resolved?.in === location)
    .every((entry) => location !== "path" && !entry.resolved?.required);
}

/** The corrected type, or null where the original type compiles or no correction applies. */
function correctedType(
  listType: IrType,
  entries: readonly ParameterEntry[],
  parameter: ParameterObject,
): IrType | null {
  if (parameter.in === QUERYSTRING_LOCATION) {
    // Next to `in: query` parameters it is not in the generated types (QUERYSTRING_NEXT_TO_QUERY).
    const isTyped = !entries.some((entry) => entry.resolved?.in === "query");
    return isTyped ? indexBy(listType, "query") : null;
  }
  if (!isLocationOptional(entries, parameter.in)) {
    return null;
  }
  const location = irReference("NonNullable", [indexBy(listType, parameter.in)]);
  return indexBy(location, parameter.name);
}

/** The type of a parameter `$ref` whose target resolved to `resolved`; see the module comment. */
export function referencedParameterType(
  ref: string,
  resolved: ParameterObject,
  context: TransformContext,
): IrType {
  // A `$ref` that resolves to another `$ref` is not a parameter object yet: index it as a path.
  if ((resolved as { $ref?: unknown }).$ref) {
    return refType(ref, { parameter: null });
  }
  const original = refType(ref, { parameter: { in: resolved.in, name: resolved.name } });
  const pointer = listPointerOf(ref);
  const parameters = pointer && typedParameters(pointer, context.refs);
  if (pointer === null || parameters === null) {
    return original;
  }
  const listType = refType(pointerTo(pointer.root, [...pointer.owner, "parameters"]));
  return correctedType(listType, parameterEntries(parameters, context), resolved) ?? original;
}
