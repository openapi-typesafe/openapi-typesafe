import { appendPointer, parseRefPointer, ROOT_POINTER } from "./json-pointer.js";
import { QUERYSTRING_LOCATION } from "./parameter-object.js";
import { type PathItemObject, pathItemOperations } from "./path-item-object.js";

/**
 * OpenAPI 3.2 uses that the generated types leave out, so each one gets a warning. The 3.2
 * features are typed (ADR-020); what is left is an `in: querystring` parameter next to
 * `in: query` parameters of the same operation, which 3.2 does not allow: the `query`
 * parameters keep their types and the `querystring` parameter is not in the output.
 */
export const UnsupportedFeature = {
  QUERYSTRING_NEXT_TO_QUERY: "querystring",
} as const;
export type UnsupportedFeature = (typeof UnsupportedFeature)[keyof typeof UnsupportedFeature];

/** One place in the document that uses a feature the output leaves out. */
export interface UnsupportedFeatureUse {
  readonly feature: UnsupportedFeature;
  /** A JSON Pointer to the object that has the feature's key, such as `#/paths/~1items`. */
  readonly pointer: string;
}

const QUERY_LOCATION = "query";
const LOCAL_REF_PREFIX = "#/";

type JsonObject = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value at a local `$ref` (`#/...`) of the document; null for other or broken `$ref`s. */
function resolveLocal(document: JsonObject, value: unknown): unknown {
  if (!isObject(value) || typeof value.$ref !== "string") {
    return value;
  }
  if (!value.$ref.startsWith(LOCAL_REF_PREFIX)) {
    return null;
  }
  let node: unknown = document;
  for (const segment of parseRefPointer(value.$ref)) {
    node = isObject(node) || Array.isArray(node) ? (node as JsonObject)[segment] : undefined;
  }
  return node ?? null;
}

/** A parameter where it is written, with the object its `$ref` points to. */
interface LocatedParameter {
  readonly pointer: string;
  readonly parameter: JsonObject;
}

function locatedParameters(
  document: JsonObject,
  parameters: unknown,
  segments: readonly string[],
): LocatedParameter[] {
  if (!Array.isArray(parameters)) {
    return [];
  }
  return parameters.flatMap((entry, index) => {
    const parameter = resolveLocal(document, entry);
    const pointer = appendPointer(ROOT_POINTER, [...segments, index]);
    return isObject(parameter) ? [{ pointer, parameter }] : [];
  });
}

/** Path item parameters, then the operation's, which replace those of the same `in` and name. */
function mergedParameters(
  shared: readonly LocatedParameter[],
  own: readonly LocatedParameter[],
): LocatedParameter[] {
  const byKey = new Map<string, LocatedParameter>();
  for (const located of [...shared, ...own]) {
    byKey.set(`${String(located.parameter.in)}-${String(located.parameter.name)}`, located);
  }
  return [...byKey.values()];
}

/** The `querystring` parameters of one operation that has `in: query` parameters as well. */
function querystringPointers(parameters: readonly LocatedParameter[]): string[] {
  const hasQuery = parameters.some(({ parameter }) => parameter.in === QUERY_LOCATION);
  return hasQuery
    ? parameters
        .filter(({ parameter }) => parameter.in === QUERYSTRING_LOCATION)
        .map(({ pointer }) => pointer)
    : [];
}

/** Pointers of `querystring` parameters next to `query` ones in the operations of a path item. */
function pathItemPointers(
  document: JsonObject,
  pathItem: JsonObject,
  segments: readonly string[],
): string[] {
  const shared = locatedParameters(document, pathItem.parameters, [...segments, "parameters"]);
  return pathItemOperations(pathItem as PathItemObject).flatMap((entry) => {
    const operation = resolveLocal(document, entry.operation);
    if (!isObject(operation)) {
      return [];
    }
    const operationSegments = [...segments, ...entry.segments, "parameters"];
    const own = locatedParameters(document, operation.parameters, operationSegments);
    return querystringPointers(mergedParameters(shared, own));
  });
}

function pathItemsPointers(
  document: JsonObject,
  pathItems: unknown,
  root: readonly string[],
): string[] {
  if (!isObject(pathItems)) {
    return [];
  }
  return Object.entries(pathItems).flatMap(([key, pathItem]) =>
    isObject(pathItem) ? pathItemPointers(document, pathItem, [...root, key]) : [],
  );
}

/**
 * Every use of a feature in `UnsupportedFeature`, once per pointer, in document order: `paths`,
 * then `webhooks`, then `components.pathItems`.
 */
export function findUnsupportedFeatures(document: unknown): UnsupportedFeatureUse[] {
  if (!isObject(document)) {
    return [];
  }
  const components = isObject(document.components) ? document.components : {};
  const pointers = [
    ...pathItemsPointers(document, document.paths, ["paths"]),
    ...pathItemsPointers(document, document.webhooks, ["webhooks"]),
    ...pathItemsPointers(document, components.pathItems, ["components", "pathItems"]),
  ];
  return [...new Set(pointers)].map((pointer) => ({
    feature: UnsupportedFeature.QUERYSTRING_NEXT_TO_QUERY,
    pointer,
  }));
}
