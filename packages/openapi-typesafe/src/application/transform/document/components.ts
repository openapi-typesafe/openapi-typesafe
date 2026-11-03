import { irKeyword, irObject, irProperty } from "../../../domain/ir/constructors.js";
import { hasIdentifierStart, withIdentifierParts } from "../../../domain/ir/identifier-text.js";
import type {
  IrPropertySignature,
  IrType,
  IrTypeAliasDeclaration,
} from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import {
  COMPONENT_KINDS,
  type ComponentKind,
  type ComponentsObject,
  DECLARED_COMPONENT_KINDS,
  isEnumSchema,
  singularizeComponentKind,
} from "../../../domain/openapi/components-object.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import { documentEntries } from "../document-entries.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { withSchemaComment } from "../schema-comment.js";
import type { TransformContext } from "../transform-context.js";
import { headerType } from "./header.js";
import { contentEntryType } from "./media-type.js";
import { parameterType } from "./parameter.js";
import { pathItemType } from "./path-item.js";
import { requestBodyType } from "./request-body.js";
import { responseType } from "./response.js";
import { rootTypeAlias } from "./root-type-aliases.js";

type ComponentTransform = (
  item: never,
  location: SchemaLocation,
  context: TransformContext,
) => IrType;

const COMPONENT_TRANSFORMS: Readonly<Record<ComponentKind, ComponentTransform>> = {
  schemas: transformSchema,
  responses: responseType,
  parameters: parameterType,
  requestBodies: requestBodyType,
  headers: headerType,
  pathItems: pathItemType,
  mediaTypes: contentEntryType,
};

/** The `components` type and the `--root-types` aliases. */
export interface ComponentsResult {
  readonly type: IrType;
  readonly rootTypes: readonly IrTypeAliasDeclaration[];
}

/** One component; the `transform` callback may replace its type, as for nested schemas. */
function componentMember(
  kind: ComponentKind,
  name: string,
  item: unknown,
  context: TransformContext,
): IrPropertySignature {
  const location = { path: createRef(["components", kind, name]), schema: item };
  const type = COMPONENT_TRANSFORMS[kind](item as never, location, context);
  const custom = context.callbacks.transform(item, location);
  const property = irProperty(toPropertyName(name), custom?.type ?? type, {
    isOptional: custom?.isOptional ?? false,
    isReadonly: context.options.immutable,
  });
  return withSchemaComment(property, item);
}

/**
 * The root alias name: `SchemaPet`, `ResponseNotFound`, … A taken name gets `_2`, `_3`, … The
 * original checks for conflicts before it removes the schema prefix, and so does this; for a clash
 * of exported names see `addRootAlias`.
 *
 * The original could build a name that is no identifier, so the generated file did not parse
 * (research/legacy-bugs.md, item 16): a kept casing keeps spaces and symbols, which become `_`;
 * and a name without the prefix can start with a digit, so it keeps the prefix (`Schema1`).
 */
function rootTypeName(
  kind: ComponentKind,
  name: string,
  aliases: Readonly<Record<string, IrTypeAliasDeclaration>>,
  context: TransformContext,
): string {
  const { options, casing } = context;
  const prefix = casing.pascalCase(singularizeComponentKind(kind));
  const isSchema = kind === "schemas";
  const base = withIdentifierParts(
    options.rootTypesKeepCasing && isSchema ? name : casing.pascalCase(name),
  );
  const exportedName = (alias: string): string => {
    const unprefixed = alias.replace(prefix, "");
    const isUnprefixed = options.rootTypesNoSchemaPrefix && isSchema;
    return isUnprefixed && hasIdentifierStart(unprefixed) ? unprefixed : alias;
  };
  let alias = `${prefix}${base}`;
  for (let counter = 2; aliases[alias] !== undefined; counter++) {
    alias = `${prefix}${base}_${counter}`;
  }
  return exportedName(alias);
}

/**
 * Add a root alias. When its exported name is taken (two schemas of one PascalCase name without
 * the prefix), the later schema takes the name and the earlier one has no alias, as in the
 * original. That output is valid, so a number for the earlier alias would change it (backlog 30).
 */
function addRootAlias(
  aliases: Record<string, IrTypeAliasDeclaration>,
  alias: string,
  kind: ComponentKind,
  name: string,
): void {
  aliases[alias] = rootTypeAlias(alias, kind, name);
}

/** `--root-types` skips enum schemas under `--enum`: the enum itself is exported. */
function hasRootType(kind: ComponentKind, item: unknown, context: TransformContext): boolean {
  const { options } = context;
  return options.rootTypes && !(options.enum && kind === "schemas" && isEnumSchema(item));
}

function kindMember(
  kind: ComponentKind,
  components: ComponentsObject,
  aliases: Record<string, IrTypeAliasDeclaration>,
  context: TransformContext,
): IrPropertySignature {
  const startedAt = context.diagnostics.now();
  const items: IrPropertySignature[] = [];
  for (const [name, item] of documentEntries(components[kind] ?? {}, context.options)) {
    items.push(componentMember(kind, name, item, context));
    if (hasRootType(kind, item, context)) {
      addRootAlias(aliases, rootTypeName(kind, name, aliases, context), kind, name);
    }
  }
  const type = items.length > 0 ? irObject(items) : irKeyword("never");
  context.diagnostics.debug(
    `Transformed components → ${kind}`,
    context.diagnostics.now() - startedAt,
  );
  return irProperty(toPropertyName(kind), type);
}

/** The `components` interface body (OpenAPI 3.1 §4.8.7), one member per component kind. */
export function componentsType(
  components: ComponentsObject,
  context: TransformContext,
): ComponentsResult {
  // A plain object, as in the original: its key order (integer-like names first) is the
  // output order.
  const aliases: Record<string, IrTypeAliasDeclaration> = {};
  const declaredKinds = DECLARED_COMPONENT_KINDS.filter((kind) => components[kind] !== undefined);
  const members = [...COMPONENT_KINDS, ...declaredKinds].map((kind) =>
    kindMember(kind, components, aliases, context),
  );
  return { type: irObject(members), rootTypes: Object.values(aliases) };
}
