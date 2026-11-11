import { irRaw } from "../../../domain/ir/constructors.js";
import type { IrDeclaration } from "../../../domain/ir/nodes.js";
import type { PathsObject } from "../../../domain/openapi/path-item-object.js";
import { documentEntries } from "../document-entries.js";
import type { RawKeyTypes } from "../footer/signature-index.js";
import { HELPER_TYPES } from "../helper-types.js";
import type { TransformContext } from "../transform-context.js";
import { keyShapesOf, type PathKey } from "./path-key-overlaps.js";
import { booleanExpandedKeys, pathTemplateParts, templateText } from "./path-template-key.js";
import { isUntakenKey, pathKeyOf } from "./paths.js";
import type { TemplateShape } from "./template-key-match.js";

/**
 * `--path-params-as-types` and `$ref`s into a templated path. Such a path is an index signature
 * of `paths` (`` [path: `/pets/${number}`] ``), so `paths["/pets/{id}"]`, the type of a `$ref`
 * to it, names no key: `{id}` is no number (TS2339). The reference indexes `paths` by the
 * template instead, which reaches the signature; so does the type of an `--enum-values` array,
 * which indexes `FlattenedDeepRequired<paths>`. With only `${string}` placeholders the URL
 * itself matches the template and the output compiles, so it stays as it is.
 */

const PATHS_TYPE_NAME = "paths";

/** A templated path of the document and the keys it is written with. */
interface TemplatedPath {
  readonly url: string;
  /**
   * Its keys. A `${boolean}` key the document's own path took (`/flags/true` next to
   * `/flags/{enabled}`) is left out, so the keys name only this path's members.
   */
  readonly keys: readonly PathKey[];
  /** A placeholder is not `${string}`, so the URL does not match the keys. */
  readonly isUnmatched: boolean;
}

/** The text a key is written with: a string literal, or a template literal type. */
function keyText(key: PathKey): string {
  return key.kind === "literal" ? JSON.stringify(key.url) : templateText(key.parts);
}

/** The index that names all keys of a path: their union. */
function indexText(keys: readonly PathKey[]): string {
  return keys.map(keyText).join(" | ");
}

/** The templated paths of `--path-params-as-types`, in the order `pathMembers` writes them. */
function templatedPaths(
  paths: PathsObject | null | undefined,
  context: TransformContext,
): TemplatedPath[] {
  // A document may hold any value as `paths`; one that is no object has no paths.
  if (!context.options.pathParamsAsTypes || typeof paths !== "object" || paths === null) {
    return [];
  }
  // The same walk as `pathMembers`, so a URL is taken by the same path as there.
  const takenUrls = new Set(Object.keys(paths));
  const templated: TemplatedPath[] = [];
  for (const [url, pathItem] of documentEntries(paths, context.options)) {
    if (!pathItem || typeof pathItem !== "object" || "$ref" in pathItem || !url.includes("{")) {
      continue;
    }
    const parts = pathTemplateParts(url, pathItem, context);
    if (parts !== null) {
      const keys = booleanExpandedKeys(parts)
        .map(pathKeyOf)
        .filter((key) => isUntakenKey(url, key, takenUrls));
      const isUnmatched = parts.some(
        (part) => part.kind === "placeholder" && part.type !== "string",
      );
      templated.push({ url, keys, isUnmatched });
    }
  }
  return templated;
}

/**
 * The index of each templated path whose URL does not match its keys, by URL. A path whose every
 * key was taken has no member, so it has no index.
 */
export function unmatchedTemplateKeys(
  paths: PathsObject | null | undefined,
  context: TransformContext,
): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  for (const path of templatedPaths(paths, context)) {
    if (path.isUnmatched && path.keys.length > 0) {
      keys.set(path.url, indexText(path.keys));
    }
  }
  return keys;
}

/**
 * The key types of the raw keys written for templated paths: each signature's template, and each
 * index of `unmatchedTemplateKeys`, so the `--enum-values` check reads the members TypeScript
 * reads.
 */
export function templateKeyTypes(
  paths: PathsObject | null | undefined,
  context: TransformContext,
): RawKeyTypes {
  const keyTypes = new Map<string, readonly TemplateShape[]>();
  for (const { keys } of templatedPaths(paths, context)) {
    for (const key of keys) {
      keyTypes.set(keyText(key), keyShapesOf(key));
    }
    if (keys.length > 1) {
      keyTypes.set(indexText(keys), keys.flatMap(keyShapesOf));
    }
  }
  return keyTypes;
}

function isNode(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isBarePathsReference(node: unknown): boolean {
  const reference = node as Readonly<Record<string, unknown>> | undefined;
  return (
    reference?.kind === "reference" &&
    reference.name === PATHS_TYPE_NAME &&
    (reference.typeArguments as readonly unknown[] | undefined)?.length === 0
  );
}

/**
 * The `paths` root as a `$ref` or an `--enum-values` array indexes it: `paths`, or
 * `FlattenedDeepRequired<paths>` (`rootType`), whose mapped keys are those of `paths`.
 */
function isPathsRoot(node: unknown): boolean {
  const reference = node as Readonly<Record<string, unknown>> | undefined;
  const typeArguments = reference?.typeArguments as readonly unknown[] | undefined;
  const isDeepRoot =
    reference?.kind === "reference" &&
    reference.name === HELPER_TYPES.flattenedDeepRequired.name &&
    typeArguments?.length === 1 &&
    isBarePathsReference(typeArguments[0]);
  return isDeepRoot || isBarePathsReference(node);
}

/** `paths["<url>"]`: an index of the `paths` root by a string literal. */
function pathsIndexUrl(node: Readonly<Record<string, unknown>>): string | undefined {
  const index = node.index as Readonly<Record<string, unknown>> | undefined;
  const isPathsIndex =
    node.kind === "indexedAccess" && isPathsRoot(node.object) && index?.kind === "stringLiteral";
  return isPathsIndex ? (index.value as string) : undefined;
}

function rewrittenNode(value: unknown, keys: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewrittenNode(item, keys));
  }
  if (!isNode(value)) {
    return value;
  }
  const template = keys.get(pathsIndexUrl(value) ?? "");
  if (template !== undefined) {
    return { ...value, index: irRaw(template) };
  }
  // `origin` holds the compiler node a raw type was printed from; it is not IR.
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "origin" ? child : rewrittenNode(child, keys),
    ]),
  );
}

/** The declarations with each `paths["<url>"]` of an unmatched template indexed by it. */
export function withTemplatePathRefs<T extends IrDeclaration>(
  declarations: readonly T[],
  keys: ReadonlyMap<string, string>,
): T[] {
  return keys.size === 0 ? [...declarations] : (rewrittenNode(declarations, keys) as T[]);
}
