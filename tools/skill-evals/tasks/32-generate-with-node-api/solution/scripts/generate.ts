import openapiTS, { astToString } from "openapi-typesafe";

/** TypeScript types for an OpenAPI document given as YAML or JSON text, with root type aliases. */
export async function generateTypes(document: string): Promise<string> {
  return astToString(await openapiTS(document, { rootTypes: true }));
}
