import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { PathItemObject, PathsObject } from "../../../domain/openapi/path-item-object.js";
import { documentEntries } from "../document-entries.js";
import type { TransformContext } from "../transform-context.js";
import { pathItemType } from "./path-item.js";

/**
 * The `webhooks` interface body (OpenAPI 3.1 §4.8.1): one path item per webhook name. Unlike
 * `paths`, a `$ref` entry is read as a path item (so every method is `never`), as in the original,
 * and members carry no JSDoc.
 */
export function webhooksType(webhooks: PathsObject, context: TransformContext): IrType {
  const members = documentEntries(webhooks, context.options).map(([name, pathItem]) => {
    const location = { path: createRef(["webhooks", name]) };
    const type = pathItemType(pathItem as PathItemObject, location, context);
    return irProperty(toPropertyName(name), type, { isReadonly: context.options.immutable });
  });
  return irObject(members);
}
