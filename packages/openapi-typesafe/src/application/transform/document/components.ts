import { irKeyword, irObject, irProperty } from "../../../domain/ir/constructors.js";
import {
  hasIdentifierStart,
  isReservedTypeName,
  withIdentifierParts,
} from "../../../domain/ir/identifier-text.js";
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
import { FIX } from "../../../domain/output-fixes.js";
import { type DeprecatedEntryFilter, documentEntries } from "../document-entries.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { schemaCommentOptionsOf, withSchemaComment } from "../schema-comment.js";
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
  return withSchemaComment(property, item, schemaCommentOptionsOf(context.options.fixes));
}

/**
 * The root alias name: `SchemaPet`, `ResponseNotFound`, … A taken name gets `_2`, `_3`, … The
 * original checks for conflicts before it removes the schema prefix, and so does this; for a clash
 * of exported names see `addRootAlias`.
 *
 * The original could build a name that is no identifier, so the generated file did not parse
 * (research/legacy-bugs.md, item 16): a kept casing keeps spaces and symbols, which become `_`;
 * and a name without the prefix can start with a digit, so it keeps the prefix (`Schema1`). A
 * kept casing without the prefix can also give a reserved name (`void`, `class`), which keeps the
 * prefix too (`Schemavoid`).
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
    const isTypeName = hasIdentifierStart(unprefixed) && !isReservedTypeName(unprefixed);
    return isUnprefixed && isTypeName ? unprefixed : alias;
  };
  let alias = `${prefix}${base}`;
  for (let counter = 2; aliases[alias] !== undefined; counter++) {
    alias = `${prefix}${base}_${counter}`;
  }
  return exportedName(alias);
}

/**
 * Add a root alias. When its exported name is taken (two schemas of one PascalCase name without
 * the prefix), the later schema takes the name, as in the original. Without the
 * `root-type-numbering` fix the earlier one then has no alias: that output is valid, so a number
 * for it would change it (backlog 30). With the fix the earlier alias is kept aside and follows
 * the others under the same name; `renameTakenAliases` numbers it once every name is known.
 */
function addRootAlias(request: ComponentsRequest, alias: IrTypeAliasDeclaration): void {
  const { aliases, displaced } = request;
  const previous = aliases[alias.name];
  if (previous !== undefined && displaced !== null) {
    displaced.push(previous);
  }
  aliases[alias.name] = alias;
}

/** `--root-types` skips enum schemas under `--enum`: the enum itself is exported. */
function hasRootType(kind: ComponentKind, item: unknown, context: TransformContext): boolean {
  const { options } = context;
  return options.rootTypes && !(options.enum && kind === "schemas" && isEnumSchema(item));
}

/** The components of one run, and the deprecated ones that kept output still references. */
interface ComponentsRequest {
  readonly components: ComponentsObject;
  readonly isKept: DeprecatedEntryFilter;
  readonly aliases: Record<string, IrTypeAliasDeclaration>;
  /** With the `root-type-numbering` fix: the aliases a later schema took the name of, in order. */
  readonly displaced: IrTypeAliasDeclaration[] | null;
}

function kindMember(
  kind: ComponentKind,
  request: ComponentsRequest,
  context: TransformContext,
): IrPropertySignature {
  const { components, isKept, aliases } = request;
  const startedAt = context.diagnostics.now();
  const items: IrPropertySignature[] = [];
  for (const [name, item] of documentEntries(components[kind] ?? {}, context.options, isKept)) {
    items.push(componentMember(kind, name, item, context));
    if (hasRootType(kind, item, context)) {
      addRootAlias(request, rootTypeAlias(rootTypeName(kind, name, aliases, context), kind, name));
    }
  }
  const type = items.length > 0 ? irObject(items) : irKeyword("never");
  context.diagnostics.debug(
    `Transformed components → ${kind}`,
    context.diagnostics.now() - startedAt,
  );
  return irProperty(toPropertyName(kind), type);
}

/**
 * The `components` interface body (OpenAPI 3.1 §4.8.7), one member per component kind. With
 * `--exclude-deprecated`, `kept` holds the deprecated components that kept output references
 * (`keptDeprecatedComponents`); they stay, so no reference names a missing key.
 */
export function componentsType(
  components: ComponentsObject,
  context: TransformContext,
  kept: ReadonlySet<object> = new Set(),
): ComponentsResult {
  // A plain object, as in the original: its key order (integer-like names first) is the
  // output order.
  const aliases: Record<string, IrTypeAliasDeclaration> = {};
  const displaced = context.options.fixes.has(FIX.ROOT_TYPE_NUMBERING) ? [] : null;
  const isKept = (item: unknown) => kept.has(item as object);
  const request = { components, isKept, aliases, displaced };
  const declaredKinds = DECLARED_COMPONENT_KINDS.filter((kind) => components[kind] !== undefined);
  const members = [...COMPONENT_KINDS, ...declaredKinds].map((kind) =>
    kindMember(kind, request, context),
  );
  const rootTypes = Object.values(aliases);
  return {
    type: irObject(members),
    rootTypes: [...rootTypes, ...(displaced ?? [])],
  };
}
