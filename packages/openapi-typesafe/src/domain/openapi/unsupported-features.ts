import { createRef } from "./json-pointer.js";

/**
 * OpenAPI 3.2 features the generator does not turn into types yet. Without a warning they would
 * disappear from the output: the operations are not in `paths`, a streamed media type has no
 * content type, and an `in: querystring` parameter is not in `parameters`.
 */
export const UnsupportedFeature = {
  QUERY_OPERATION: "query",
  ADDITIONAL_OPERATIONS: "additionalOperations",
  ITEM_SCHEMA: "itemSchema",
  QUERYSTRING_PARAMETER: "querystring",
} as const;
export type UnsupportedFeature = (typeof UnsupportedFeature)[keyof typeof UnsupportedFeature];

/** One place in the document that uses a feature the output leaves out. */
export interface UnsupportedFeatureUse {
  readonly feature: UnsupportedFeature;
  /** A JSON Pointer to the object that has the feature's key, such as `#/paths/~1items`. */
  readonly pointer: string;
}

const PATH_ITEM_FEATURES = [
  UnsupportedFeature.QUERY_OPERATION,
  UnsupportedFeature.ADDITIONAL_OPERATIONS,
] as const;

/**
 * Keys whose values are schemas or example data, never path items or media types. The walk does
 * not enter them, so a schema property named `content` or `itemSchema` is not reported.
 */
const DATA_KEYS: ReadonlySet<string> = new Set([
  "schema",
  "schemas",
  "itemSchema",
  "$defs",
  "example",
  "examples",
  "default",
  "const",
  "enum",
]);

type JsonObject = Readonly<Record<string, unknown>>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathItemUses(pathItems: unknown, root: readonly string[]): UnsupportedFeatureUse[] {
  if (!isObject(pathItems)) {
    return [];
  }
  return Object.entries(pathItems).flatMap(([key, pathItem]) =>
    PATH_ITEM_FEATURES.filter((feature) => isObject(pathItem) && feature in pathItem).map(
      (feature) => ({ feature, pointer: createRef([...root, key]) }),
    ),
  );
}

/** The media types of one `content` map that have an `itemSchema`. */
function contentUses(content: unknown, segments: readonly string[]): UnsupportedFeatureUse[] {
  if (!isObject(content)) {
    return [];
  }
  return Object.entries(content)
    .filter(([, media]) => isObject(media) && UnsupportedFeature.ITEM_SCHEMA in media)
    .map(([mediaType]) => ({
      feature: UnsupportedFeature.ITEM_SCHEMA,
      pointer: createRef([...segments, mediaType]),
    }));
}

/** A parameter object with `in: querystring`. */
function querystringUses(node: JsonObject, segments: readonly string[]): UnsupportedFeatureUse[] {
  return node.in === UnsupportedFeature.QUERYSTRING_PARAMETER && typeof node.name === "string"
    ? [{ feature: UnsupportedFeature.QUERYSTRING_PARAMETER, pointer: createRef(segments) }]
    : [];
}

/**
 * Media types with `itemSchema` (the values of a `content` map) and `in: querystring` parameters,
 * outside schemas, examples and extensions.
 */
function nestedUses(node: unknown, segments: readonly string[]): UnsupportedFeatureUse[] {
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => nestedUses(item, [...segments, String(index)]));
  }
  if (!isObject(node)) {
    return [];
  }
  const uses = querystringUses(node, segments);
  for (const [key, value] of Object.entries(node)) {
    if (DATA_KEYS.has(key) || key.startsWith("x-")) {
      continue;
    }
    if (key === "content") {
      uses.push(...contentUses(value, [...segments, key]));
    }
    uses.push(...nestedUses(value, [...segments, key]));
  }
  return uses;
}

/** Every use of a feature in `UnsupportedFeature`, in document order of each kind. */
export function findUnsupportedFeatures(document: unknown): UnsupportedFeatureUse[] {
  if (!isObject(document)) {
    return [];
  }
  const components = isObject(document.components) ? document.components : {};
  return [
    ...pathItemUses(document.paths, ["paths"]),
    ...pathItemUses(document.webhooks, ["webhooks"]),
    ...pathItemUses(components.pathItems, ["components", "pathItems"]),
    ...nestedUses(document, []),
  ];
}
