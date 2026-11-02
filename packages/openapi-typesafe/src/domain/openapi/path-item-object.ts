import type { OperationObject } from "./operation-object.js";
import type { ParameterOrReference } from "./parameter-object.js";
import type { ReferenceSchema } from "./schema-object.js";

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

/** The parts of a Path Item Object the generator reads (OpenAPI 3.1 §4.8.9). */
export type PathItemObject = {
  readonly parameters?: readonly ParameterOrReference[];
} & { readonly [method in HttpMethod]?: OperationObject | ReferenceSchema };

/** Path items by URL template (OpenAPI 3.1 §4.8.8); webhooks use the same shape by name. */
export type PathsObject = Readonly<Record<string, PathItemObject | ReferenceSchema>>;
