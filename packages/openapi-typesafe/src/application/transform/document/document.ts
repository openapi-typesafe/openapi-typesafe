import { irKeyword, irRecord } from "../../../domain/ir/constructors.js";
import type {
  IrDeclaration,
  IrObjectType,
  IrType,
  IrTypeAliasDeclaration,
} from "../../../domain/ir/nodes.js";
import type { ComponentsObject } from "../../../domain/openapi/components-object.js";
import type { DocumentObject } from "../../../domain/openapi/document-object.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { PathsObject } from "../../../domain/openapi/path-item-object.js";
import type { Schema } from "../../../domain/openapi/schema-object.js";
import { transformSchema } from "../schema/schema-transform.js";
import type { TransformContext, TransformOptions } from "../transform-context.js";
import { componentsType } from "./components.js";
import { pathsType } from "./paths.js";
import { apiPathsEnumDeclaration } from "./paths-enum.js";
import { webhooksType } from "./webhooks.js";

/** The root types, in output order. */
const ROOT_KEYS = Object.freeze(["paths", "webhooks", "components", "$defs"] as const);
type RootKey = (typeof ROOT_KEYS)[number];

const OPERATIONS_NAME = "operations";
/** The type of a root without members: `Record<string, never>`. */
const EMPTY_ROOT_TYPE = irRecord(irKeyword("string"), irKeyword("never"));

/** `--read-write-markers` helper types, with the original's source text. */
const READ_WRITE_HELPERS = `
export type $Read<T> = { readonly $read: T };
export type $Write<T> = { readonly $write: T };
export type Readable<T> = T extends $Write<any> ? never : T extends $Read<infer U> ? Readable<U> : T extends (infer E)[] ? Readable<E>[] : T extends object ? { [K in keyof T as NonNullable<T[K]> extends $Write<any> ? never : K]: Readable<T[K]> } : T;
export type Writable<T> = T extends $Read<any> ? never : T extends $Write<infer U> ? Writable<U> : T extends (infer E)[] ? Writable<E>[] : T extends object ? { [K in keyof T as NonNullable<T[K]> extends $Read<any> ? never : K]: Writable<T[K]> } & { [K in keyof T as NonNullable<T[K]> extends $Read<any> ? K : never]?: never } : T;
`;

/** A root's type and the declarations that follow it (the `--root-types` aliases). */
interface RootResult {
  readonly type: IrType;
  readonly aliases: readonly IrTypeAliasDeclaration[];
}

const ROOT_TRANSFORMS: Readonly<
  Record<RootKey, (node: object, context: TransformContext) => RootResult>
> = {
  paths: (node, context) => ({ type: pathsType(node as PathsObject, context), aliases: [] }),
  webhooks: (node, context) => ({ type: webhooksType(node as PathsObject, context), aliases: [] }),
  components: (node, context) => {
    const { type, rootTypes } = componentsType(node as ComponentsObject, context);
    return { type, aliases: rootTypes };
  },
  $defs: (node, context) => {
    const location = { path: createRef(["$defs"]), schema: node };
    return { type: transformSchema(node as Schema, location, context), aliases: [] };
  },
};

function emptyAlias(name: string): IrTypeAliasDeclaration {
  return { kind: "typeAlias", name, isExported: true, type: EMPTY_ROOT_TYPE, comments: [] };
}

/** A root with members: an interface, or a type alias with `--export-type`. */
function rootDeclaration(
  name: RootKey,
  type: IrObjectType,
  options: TransformOptions,
): IrDeclaration {
  return options.exportType
    ? { kind: "typeAlias", name, isExported: true, type, comments: [] }
    : { kind: "interface", name, isExported: true, members: type.members, comments: [] };
}

/**
 * The declarations of one root. A root that is missing, or whose type has no members, is
 * `Record<string, never>`. Only an object type counts as having members: a callback type the IR
 * keeps as raw text does not (ADR-004).
 */
function rootDeclarations(
  root: RootKey,
  document: DocumentObject,
  context: TransformContext,
): IrDeclaration[] {
  const node: unknown = document[root];
  if (!node || typeof node !== "object") {
    context.diagnostics.debug(`${root} done (skipped)`, 0);
    return [emptyAlias(root)];
  }
  const startedAt = context.diagnostics.now();
  const { type, aliases } = ROOT_TRANSFORMS[root](node, context);
  if (type.kind !== "object" || type.members.length === 0) {
    context.diagnostics.debug(`${root} done (skipped)`, 0);
    return [emptyAlias(root), ...aliases];
  }
  const declaration = rootDeclaration(root, type, context.options);
  context.diagnostics.debug(`${root} done`, context.diagnostics.now() - startedAt);
  return [declaration, ...aliases];
}

/**
 * The document's declarations before the footer: helper types, injected code, then one root type
 * per root key with the aliases that follow it.
 */
export function documentBody(document: DocumentObject, context: TransformContext): IrDeclaration[] {
  const declarations: IrDeclaration[] = [];
  if (context.options.readWriteMarkers) {
    declarations.push({ kind: "rawDeclaration", text: READ_WRITE_HELPERS });
  }
  if (context.options.inject) {
    declarations.push({ kind: "rawDeclaration", text: context.options.inject });
  }
  for (const root of ROOT_KEYS) {
    declarations.push(...rootDeclarations(root, document, context));
  }
  return declarations;
}

/**
 * The declarations after the footer: an empty `operations` type when the footer has no
 * operations, and the `--make-paths-enum` enum.
 */
export function documentClosing(
  document: DocumentObject,
  context: TransformContext,
  hasOperations: boolean,
): IrDeclaration[] {
  const declarations: IrDeclaration[] = [];
  if (!hasOperations) {
    declarations.push(emptyAlias(OPERATIONS_NAME));
  }
  if (context.options.makePathsEnum && document.paths) {
    declarations.push(apiPathsEnumDeclaration(document.paths));
  }
  return declarations;
}
