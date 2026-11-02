import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrObjectType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { Schema } from "../../../domain/openapi/schema-object.js";
import { transformSchema } from "../schema/schema-transform.js";
import type { TransformContext } from "../transform-context.js";

/**
 * The root `$defs` type: one required member per named subschema, so `#/$defs/<name>` refs
 * (`$defs["<name>"]`) resolve. The original transformed the whole `$defs` map as one schema,
 * which gave `Record<string, never>` and made every such ref `never` (research/legacy-bugs.md,
 * item 18).
 */
export function defsRootType(
  defs: Readonly<Record<string, Schema>>,
  context: TransformContext,
): IrObjectType {
  const members = Object.entries(defs).map(([name, schema]) => {
    const location = { path: createRef(["$defs", name]), schema };
    const type = transformSchema(schema, location, context);
    return irProperty(toPropertyName(name), type, { isReadonly: context.options.immutable });
  });
  return irObject(members);
}
