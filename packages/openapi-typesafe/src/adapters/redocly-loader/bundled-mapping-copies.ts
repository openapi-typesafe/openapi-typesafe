import { childPointer } from "../../domain/openapi/json-pointer.js";
import { type ComponentSchemas, componentSchemasOf, SCHEMAS_POINTER } from "./component-schemas.js";
import { findMappings, findRefHolders } from "./ref-holders.js";

/**
 * Redocly 1.x bundles every discriminator `mapping` value as if it were an external `$ref`: it
 * stores the target schema under the raw last segment of the pointer. For a local schema whose
 * key needs an escape (`a~b`, written `a~0b`; `c/d`, written `c~1d`) that segment is no existing
 * key, so the bundle added `a~0b` and `c~1d` to `components.schemas` as copies of `a~b` and
 * `c/d`, and the generator wrote each type twice. A copy is the very object of the schema it
 * copies, so a key the bundle added whose value is the value of a key the document had is removed,
 * and the mapping values and `$ref`s that name it point at the original.
 */

/** The keys of `components.schemas` before bundling: the bundle edits the document in place. */
export function schemaKeysOf(document: unknown): ReadonlySet<string> {
  return new Set(Object.keys(componentSchemasOf(document) ?? {}));
}

/** Each key the bundle added as a copy, with the pointer of the schema it copies. */
function copiesIn(schemas: ComponentSchemas, keysBefore: ReadonlySet<string>): Map<string, string> {
  const originals = new Map<unknown, string>();
  for (const key of keysBefore) {
    if (Object.hasOwn(schemas, key) && !originals.has(schemas[key])) {
      originals.set(schemas[key], key);
    }
  }
  const copies = new Map<string, string>();
  for (const [key, value] of Object.entries(schemas)) {
    const original = keysBefore.has(key) ? undefined : originals.get(value);
    if (original !== undefined) {
      copies.set(`${SCHEMAS_POINTER}/${key}`, childPointer(SCHEMAS_POINTER, original));
      delete schemas[key];
    }
  }
  return copies;
}

/** Remove the bundle's copies of the document's own schemas, in place. */
export function removeBundledMappingCopies(
  bundled: unknown,
  keysBefore: ReadonlySet<string>,
): void {
  const schemas = componentSchemasOf(bundled);
  const copies = schemas === undefined ? new Map<string, string>() : copiesIn(schemas, keysBefore);
  if (copies.size === 0) {
    return;
  }
  for (const mapping of findMappings(bundled)) {
    for (const [name, value] of Object.entries(mapping)) {
      const original = typeof value === "string" ? copies.get(value) : undefined;
      if (original !== undefined) {
        mapping[name] = original;
      }
    }
  }
  for (const { node } of findRefHolders(bundled)) {
    node.$ref = copies.get(node.$ref) ?? node.$ref;
  }
}
