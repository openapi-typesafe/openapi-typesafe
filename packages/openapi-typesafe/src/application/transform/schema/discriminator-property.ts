import { irProperty } from "../../../domain/ir/constructors.js";
import type { IrPropertySignature } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import { literalType } from "../literal-type.js";
import type { Discriminator } from "./schema-context.js";

/**
 * The value a schema has for its parent's discriminator: the mapping key whose target is this
 * schema (a full `$ref` or a bare schema name), else the schema's own name (the last segment).
 */
function discriminatorValue(discriminator: Discriminator, path: string): string | undefined {
  const name = parseRefPointer(path).pop();
  const match = Object.entries(discriminator.mapping ?? {}).find(([, target]) =>
    target.startsWith("#") ? parseRefPointer(target).pop() === name : target === name,
  );
  return match ? match[0] : name;
}

/** The discriminator property, typed as its literal value (`createDiscriminatorProperty`). */
export function discriminatorProperty(
  discriminator: Discriminator,
  path: string,
  isReadonly: boolean,
): IrPropertySignature {
  const value = discriminatorValue(discriminator, path);
  return irProperty(toPropertyName(discriminator.propertyName), literalType(value), { isReadonly });
}
