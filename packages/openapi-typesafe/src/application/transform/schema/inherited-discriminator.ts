import type { IrMember } from "../../../domain/ir/nodes.js";
import { unionAt, unionReaches } from "../../../domain/openapi/discriminated-union.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { discriminatorProperty } from "./discriminator-property.js";
import { ownerEnumMembersType } from "./enum-rule.js";
import type { Discriminator } from "./schema-context.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * Whether the schema at `path` is a union that its own members inherit from (upstream #1665).
 * Each member sets the discriminator value, so a value of the union's own would make every member
 * `never`. The union's own keywords, which its members get, are typed at the same path.
 */
function isInheritedUnion(path: string, request: SchemaRequest): boolean {
  const resolve = (ref: string) => request.context.refs.resolve(ref);
  const union = unionAt(path, resolve);
  return union !== undefined && unionReaches(union, path, resolve);
}

/** A discriminator a parent's mapping implies for the schema at `path`. */
export interface InheritedDiscriminator {
  readonly discriminator: Discriminator;
  readonly path: string;
}

/**
 * The discriminator a parent's mapping implies for this schema, if it adds a property. A schema
 * with no path (a caller's own schema) is no component, so no mapping names it.
 */
export function inheritedDiscriminator(
  schema: SchemaObject,
  request: SchemaRequest,
): InheritedDiscriminator | undefined {
  const { path } = request.location;
  if ((!schema.allOf && !schema.anyOf) || path === undefined) {
    return undefined;
  }
  const { discriminators } = request.context;
  // A schema does not get the discriminator it defines for its children, nor one added already.
  const isAdded = !schema.discriminator && !discriminators.isHandled(path);
  const discriminator = isAdded ? discriminators.objectAt(path) : undefined;
  return discriminator && !isInheritedUnion(path, request) ? { discriminator, path } : undefined;
}

/** The property of an inherited discriminator, typed as the schema's value. */
export function discriminatorMember(
  { discriminator, path }: InheritedDiscriminator,
  request: SchemaRequest,
): IrMember {
  // With `discriminator-values`, the value is a member of the owner's enum (#1700).
  const valueType = (value: string | undefined) =>
    ownerEnumMembersType(discriminator, [value], request);
  return discriminatorProperty(discriminator, path, request.context.options.immutable, valueType);
}
