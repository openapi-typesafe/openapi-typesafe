import { childPointer } from "../../domain/openapi/json-pointer.js";
import { componentSchemasOf, SCHEMAS_POINTER } from "./component-schemas.js";
import { findMappings } from "./ref-holders.js";

/**
 * A discriminator `mapping` value may be a schema name (`cat: Cat`) or a URI reference. Redocly
 * reads every value as a `$ref`, so a name failed with "Can't resolve $ref". OpenAPI 3.1.1
 * (§4.8.25) leaves a value that is both to the implementation and recommends the schema name; a
 * relative URI is then written `./Cat`. So a value that is a key of the document's
 * `components.schemas` becomes the pointer to that schema, in place, before the `$ref`s are
 * resolved. Any other value stays a URI reference.
 */
export function pointMappingNamesAtSchemas(document: unknown): void {
  const schemas = componentSchemasOf(document);
  if (schemas === undefined) {
    return;
  }
  for (const mapping of findMappings(document)) {
    for (const [name, value] of Object.entries(mapping)) {
      if (typeof value === "string" && Object.hasOwn(schemas, value)) {
        mapping[name] = childPointer(SCHEMAS_POINTER, value);
      }
    }
  }
}
