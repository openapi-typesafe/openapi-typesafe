import { irRaw } from "../../../domain/ir/constructors.js";
import type { IrDeclaration } from "../../../domain/ir/nodes.js";
import type { PathsObject } from "../../../domain/openapi/path-item-object.js";
import { documentEntries } from "../document-entries.js";
import type { TransformContext } from "../transform-context.js";
import { pathTemplateParts, templateText } from "./path-template-key.js";

/**
 * `--path-params-as-types` and `$ref`s into a templated path. Such a path is an index signature
 * of `paths` (`` [path: `/pets/${number}`] ``), so `paths["/pets/{id}"]`, the type of a `$ref`
 * to it, names no key: `{id}` is no number (TS2339). The reference indexes `paths` by the
 * template instead, which reaches the signature. With only `${string}` placeholders the URL
 * itself matches the template and the output compiles, so it stays as it is.
 */

const PATHS_TYPE_NAME = "paths";

/** The template of each templated path whose URL does not match it, by URL. */
export function unmatchedTemplateKeys(
  paths: PathsObject | undefined,
  context: TransformContext,
): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  if (!context.options.pathParamsAsTypes || paths === undefined) {
    return keys;
  }
  for (const [url, pathItem] of documentEntries(paths, context.options)) {
    if (!pathItem || typeof pathItem !== "object" || "$ref" in pathItem || !url.includes("{")) {
      continue;
    }
    const parts = pathTemplateParts(url, pathItem, context) ?? [];
    if (parts.some((part) => part.kind === "placeholder" && part.type !== "string")) {
      keys.set(url, templateText(parts));
    }
  }
  return keys;
}

function isNode(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** `paths["<url>"]`: an index of the `paths` root by a string literal. */
function pathsIndexUrl(node: Readonly<Record<string, unknown>>): string | undefined {
  const object = node.object as Readonly<Record<string, unknown>> | undefined;
  const index = node.index as Readonly<Record<string, unknown>> | undefined;
  const isPathsIndex =
    node.kind === "indexedAccess" &&
    object?.kind === "reference" &&
    object.name === PATHS_TYPE_NAME &&
    (object.typeArguments as readonly unknown[] | undefined)?.length === 0 &&
    index?.kind === "stringLiteral";
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
