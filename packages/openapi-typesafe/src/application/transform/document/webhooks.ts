import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { appendPointer, ROOT_POINTER } from "../../../domain/openapi/json-pointer.js";
import type { PathItemObject, PathsObject } from "../../../domain/openapi/path-item-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { TransformContext } from "../transform-context.js";
import { pathItemType } from "./path-item.js";

/**
 * The `webhooks` interface body (OpenAPI 3.1 §4.8.1): one path item per webhook name. A `$ref`
 * entry (often to `components/pathItems`) is the type it points at, as in `paths`; the original
 * read it as a path item, so every method was `never`. Members carry no JSDoc.
 */
export function webhooksType(webhooks: PathsObject, context: TransformContext): IrType {
  const members = documentEntries(webhooks, context.options).map(([name, pathItem]) => {
    const type = webhookType(name, pathItem, context);
    return irProperty(toPropertyName(name), type, { isReadonly: context.options.immutable });
  });
  return irObject(members);
}

function webhookType(
  name: string,
  pathItem: PathsObject[string],
  context: TransformContext,
): IrType {
  // A document may hold any value here; one that is no object is read as a path item, as before.
  if (typeof pathItem === "object" && pathItem !== null && "$ref" in pathItem) {
    return refType(pathItem.$ref);
  }
  const location = { path: appendPointer(ROOT_POINTER, ["webhooks", name]) };
  return pathItemType(pathItem as PathItemObject, location, context);
}
