import { childPointer, ROOT_POINTER } from "../../domain/openapi/json-pointer.js";

/** `components.schemas` of a parsed document, which the loader repairs in place. */

export type ComponentSchemas = Record<string, unknown>;

/** `#/components/schemas`. */
export const SCHEMAS_POINTER = childPointer(childPointer(ROOT_POINTER, "components"), "schemas");

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The `components.schemas` object of a document, when it has one. */
export function componentSchemasOf(document: unknown): ComponentSchemas | undefined {
  const components = isContainer(document) ? document.components : undefined;
  const schemas = isContainer(components) ? components.schemas : undefined;
  return isContainer(schemas) ? schemas : undefined;
}
