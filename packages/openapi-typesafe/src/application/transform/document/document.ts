import { appendAll } from "../../../domain/append-all.js";
import { irKeyword, irObject, irRecord } from "../../../domain/ir/constructors.js";
import type {
  IrDeclaration,
  IrIntersectionType,
  IrObjectType,
  IrType,
  IrTypeAliasDeclaration,
} from "../../../domain/ir/nodes.js";
import type { ComponentsObject } from "../../../domain/openapi/components-object.js";
import type { DocumentObject } from "../../../domain/openapi/document-object.js";
import type { PathsObject } from "../../../domain/openapi/path-item-object.js";
import { READ_WRITE_MARKER_TYPES } from "../helper-types.js";
import type { TransformContext, TransformOptions } from "../transform-context.js";
import { componentsType } from "./components.js";
import { type DeclaredTypeLookup, declaredTypeLookup } from "./declared-types.js";
import { defsRootType } from "./defs-root.js";
import { keptDeprecatedComponents } from "./kept-deprecated.js";
import { pathMembers, pathsObjectType } from "./paths.js";
import { apiPathsEnumDeclaration } from "./paths-enum.js";
import { webhooksType } from "./webhooks.js";

/** The root types, in output order. */
export const ROOT_KEYS = Object.freeze(["paths", "webhooks", "components", "$defs"] as const);
type RootKey = (typeof ROOT_KEYS)[number];

export const OPERATIONS_NAME = "operations";
/** The type of a root without members: `Record<string, never>`. */
const EMPTY_ROOT_TYPE = irRecord(irKeyword("string"), irKeyword("never"));

/** A root's type and the declarations that follow it (the `--root-types` aliases). */
interface RootResult {
  readonly type: IrType;
  readonly aliases: readonly IrTypeAliasDeclaration[];
  /**
   * The root's final type, for a root that reads the types the whole file declares (`paths`, whose
   * overlap check follows references). `type` then only tells whether the root has members.
   */
  readonly withDeclaredTypes?: (lookup: DeclaredTypeLookup) => IrType;
}

type RootTransform = (
  node: object,
  context: TransformContext,
  document: DocumentObject,
) => RootResult;

/** Without `--exclude-deprecated` nothing is left out, so the scan is skipped. */
function keptDeprecated(document: DocumentObject, context: TransformContext): ReadonlySet<object> {
  return context.options.excludeDeprecated
    ? keptDeprecatedComponents(document, context.refs)
    : new Set();
}

const ROOT_TRANSFORMS: Readonly<Record<RootKey, RootTransform>> = {
  paths: (node, context) => {
    const members = pathMembers(node as PathsObject, context);
    return {
      type: irObject(members.map(({ member }) => member)),
      aliases: [],
      withDeclaredTypes: (lookup) => pathsObjectType(members, lookup),
    };
  },
  webhooks: (node, context) => ({ type: webhooksType(node as PathsObject, context), aliases: [] }),
  components: (node, context, document) => {
    const kept = keptDeprecated(document, context);
    const { type, rootTypes } = componentsType(node as ComponentsObject, context, kept);
    return { type, aliases: rootTypes };
  },
  $defs: (node, context) => ({
    type: defsRootType(node as NonNullable<DocumentObject["$defs"]>, context),
    aliases: [],
  }),
};

function emptyAlias(name: string): IrTypeAliasDeclaration {
  return { kind: "typeAlias", name, isExported: true, type: EMPTY_ROOT_TYPE, comments: [] };
}

/** A root type that declares something: an object with members, or an intersection of them. */
type RootBodyType = IrObjectType | IrIntersectionType;

function isRootBody(type: IrType): type is RootBodyType {
  return (type.kind === "object" && type.members.length > 0) || type.kind === "intersection";
}

/**
 * A root with members: an interface, or a type alias with `--export-type`. An intersection (the
 * `paths` of overlapping `--path-params-as-types` keys) can only be a type alias.
 */
function rootDeclaration(
  name: RootKey,
  type: RootBodyType,
  options: TransformOptions,
): IrDeclaration {
  return options.exportType || type.kind === "intersection"
    ? { kind: "typeAlias", name, isExported: true, type, comments: [] }
    : { kind: "interface", name, isExported: true, members: type.members, comments: [] };
}

/**
 * The declarations of one root: its type, then its aliases. `finish` gives the root's declaration
 * again from the types the whole file declares, for a root with `withDeclaredTypes`.
 */
interface RootDeclarations {
  readonly declarations: readonly IrDeclaration[];
  readonly finish?: (lookup: DeclaredTypeLookup) => IrDeclaration;
}

/**
 * The declarations of one root. A root that is missing, or whose type has no members, is
 * `Record<string, never>`. Only an object type (or the `paths` intersection) counts as having
 * members: a callback type the IR keeps as raw text does not (ADR-004).
 */
function rootDeclarations(
  root: RootKey,
  document: DocumentObject,
  context: TransformContext,
): RootDeclarations {
  const node: unknown = document[root];
  if (!node || typeof node !== "object") {
    context.diagnostics.debug(`${root} done (skipped)`, 0);
    return { declarations: [emptyAlias(root)] };
  }
  const startedAt = context.diagnostics.now();
  const { type, aliases, withDeclaredTypes } = ROOT_TRANSFORMS[root](node, context, document);
  if (!isRootBody(type)) {
    context.diagnostics.debug(`${root} done (skipped)`, 0);
    return { declarations: [emptyAlias(root), ...aliases] };
  }
  const declaration = rootDeclaration(root, type, context.options);
  context.diagnostics.debug(`${root} done`, context.diagnostics.now() - startedAt);
  const finish =
    withDeclaredTypes &&
    ((lookup: DeclaredTypeLookup) => {
      const finished = withDeclaredTypes(lookup);
      return isRootBody(finished) ? rootDeclaration(root, finished, context.options) : declaration;
    });
  return { declarations: [declaration, ...aliases], ...(finish ? { finish } : {}) };
}

/**
 * Every root's declarations in output order. A root with `finish` gets its declaration from the
 * types of the other roots and of the footer (the `operations` interface), which exist only once
 * every root is transformed.
 */
function rootsDeclarations(
  document: DocumentObject,
  context: TransformContext,
  footer: () => readonly IrDeclaration[],
): IrDeclaration[] {
  const roots = ROOT_KEYS.map((root) => rootDeclarations(root, document, context));
  const transformed = roots.flatMap(({ declarations }) => declarations);
  if (roots.every(({ finish }) => finish === undefined)) {
    return transformed;
  }
  const lookup = declaredTypeLookup([...transformed, ...footer()]);
  return roots.flatMap(({ declarations, finish }) => {
    const [declaration, ...aliases] = declarations;
    return finish === undefined || declaration === undefined
      ? declarations
      : [finish(lookup), ...aliases];
  });
}

/**
 * The `inject` text as written (ADR-010, decision 4), without the blank lines around it. The
 * original reprinted it with the TypeScript printer; text without code printed nothing then.
 */
function withoutBlankLinesAround(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

/** No footer declarations: the roots' references to `operations` stay unresolved. */
const NO_FOOTER = (): readonly IrDeclaration[] => [];

/**
 * The document's declarations before the footer: helper types, injected code, then one root type
 * per root key with the aliases that follow it. `footer` reads the footer's declarations once the
 * roots are transformed.
 */
export function documentBody(
  document: DocumentObject,
  context: TransformContext,
  footer: () => readonly IrDeclaration[] = NO_FOOTER,
): IrDeclaration[] {
  const declarations: IrDeclaration[] = [];
  if (context.options.readWriteMarkers) {
    declarations.push({ kind: "rawDeclaration", text: READ_WRITE_MARKER_TYPES });
  }
  const inject = withoutBlankLinesAround(context.options.inject ?? "");
  if (inject !== "") {
    declarations.push({ kind: "rawDeclaration", text: inject });
  }
  appendAll(declarations, rootsDeclarations(document, context, footer));
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
