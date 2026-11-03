import type { OperationObject } from "./operation-object.js";
import type { ParameterOrReference } from "./parameter-object.js";
import type { ReferenceSchema } from "./schema-object.js";

/** The methods every generated path item lists, with `?: never` when the document has none. */
export type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

/** The operation fields of a path item, in the order the generated types list them. */
export const HTTP_METHODS: readonly HttpMethod[] = Object.freeze([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

/**
 * The OpenAPI 3.2 QUERY method. Its member is written only when the path item declares it, so
 * documents without it keep their output (ADR-020).
 */
export const QUERY_METHOD = "query";

/** Every operation field of a path item. */
export type PathItemMethod = HttpMethod | typeof QUERY_METHOD;

/** The OpenAPI 3.2 path item field for methods other than the fixed fields, by exact name. */
export const ADDITIONAL_OPERATIONS_KEY = "additionalOperations";

export type OperationEntry = OperationObject | ReferenceSchema;

/** The parts of a Path Item Object the generator reads (OpenAPI 3.2 §4.8.9). */
export type PathItemObject = {
  readonly parameters?: readonly ParameterOrReference[];
  readonly additionalOperations?: Readonly<Record<string, OperationEntry>>;
} & { readonly [method in PathItemMethod]?: OperationEntry };

/** Path items by URL template (OpenAPI 3.1 §4.8.8); webhooks use the same shape by name. */
export type PathsObject = Readonly<Record<string, PathItemObject | ReferenceSchema>>;

/** One operation of a path item and the method it is declared under. */
export interface PathItemOperation {
  /** A fixed field (`get`, `query`, …) or an `additionalOperations` name (`SUBSCRIBE`). */
  readonly method: string;
  readonly operation: OperationEntry;
  /** JSON Pointer segments from the path item to the operation. */
  readonly segments: readonly string[];
}

/**
 * Every operation of a path item: the fixed methods in output order, then `query`, then
 * `additionalOperations` in document order.
 */
export function pathItemOperations(pathItem: PathItemObject): PathItemOperation[] {
  const methods: readonly PathItemMethod[] = [...HTTP_METHODS, QUERY_METHOD];
  const fixed = methods.flatMap((method) => {
    const operation = pathItem[method];
    return operation ? [{ method, operation, segments: [method] }] : [];
  });
  const additional = Object.entries(pathItem.additionalOperations ?? {}).map(
    ([method, operation]) => ({
      method,
      operation,
      segments: [ADDITIONAL_OPERATIONS_KEY, method],
    }),
  );
  return [...fixed, ...additional];
}
