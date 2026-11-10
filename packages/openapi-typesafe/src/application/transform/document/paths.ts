import { irIntersection, irObject, irProperty, irRaw } from "../../../domain/ir/constructors.js";
import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { appendPointer, ROOT_POINTER } from "../../../domain/openapi/json-pointer.js";
import type { PathItemObject, PathsObject } from "../../../domain/openapi/path-item-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { TransformContext } from "../transform-context.js";
import { type DeclaredTypeLookup, NO_DECLARED_TYPES } from "./declared-types.js";
import { documentMember } from "./document-member.js";
import { pathItemType } from "./path-item.js";
import {
  type CoverRejection,
  coveringTemplateKeys,
  type PathKey,
  type PathKeyPart,
} from "./path-key-overlaps.js";
import {
  booleanExpandedKeys,
  pathTemplateParts,
  plainUrlOf,
  templateText,
} from "./path-template-key.js";
import { assignabilityProof } from "./type-assignability.js";

/** A path's member, its key and its path item type for the overlap check. */
export interface PathMember {
  readonly url: string;
  readonly member: IrMember;
  readonly key: PathKey;
  readonly type: IrType;
}

/** The key of the parts: a plain URL, or a template with placeholders left. */
export function pathKeyOf(parts: readonly PathKeyPart[]): PathKey {
  const plainUrl = plainUrlOf(parts);
  return plainUrl === null ? { kind: "template", parts } : literalKey(plainUrl);
}

/** The member of one key of a path: a property for a plain URL, else an index signature. */
function keyMember(url: string, parts: readonly PathKeyPart[], type: IrType, isReadonly: boolean) {
  const key = pathKeyOf(parts);
  if (key.kind === "literal") {
    const member = irProperty(toPropertyName(key.url), type, { isReadonly });
    return { url, member, key, type };
  }
  const member: IrMember = {
    kind: "indexSignature",
    parameterName: "path",
    parameterType: irRaw(templateText(parts)),
    type,
    isReadonly,
    comments: [],
  };
  return { url, member, key, type };
}

/**
 * Whether a key of the path at `url` is written. A URL that `${boolean}` keys give is not when it
 * is taken already: by a path of the document, which OpenAPI matches before a template (Paths
 * Object), or by the keys of an earlier path. A property written twice does not compile (TS2300).
 * `takenUrls` starts with the document's URLs and gets each expanded URL, in document order.
 */
export function isUntakenKey(url: string, key: PathKey, takenUrls: Set<string>): boolean {
  const isExpandedUrl = key.kind === "literal" && key.url !== url;
  if (!isExpandedUrl) {
    return true;
  }
  const isTaken = takenUrls.has(key.url);
  takenUrls.add(key.url);
  return !isTaken;
}

function withoutTakenUrls(url: string, members: readonly PathMember[], takenUrls: Set<string>) {
  return members.filter(({ key }) => isUntakenKey(url, key, takenUrls));
}

/** The members of a path: one, or one per key of its `${boolean}` placeholders. */
function pathItemMembers(
  url: string,
  pathItem: PathItemObject,
  context: TransformContext,
): PathMember[] {
  const isReadonly = context.options.immutable;
  const type = pathItemType(
    pathItem,
    { path: appendPointer(ROOT_POINTER, ["paths", url]) },
    context,
  );
  const parts =
    context.options.pathParamsAsTypes && url.includes("{")
      ? pathTemplateParts(url, pathItem, context)
      : null;
  if (parts === null) {
    const member = irProperty(toPropertyName(url), type, { isReadonly });
    return [{ url, member, key: literalKey(url), type }];
  }
  return booleanExpandedKeys(parts).map((key) => keyMember(url, key, type, isReadonly));
}

function literalKey(url: string): PathKey {
  return { kind: "literal", url };
}

const PATHS_TYPE_NAME = "paths";

/** The URL of `paths["/apps/{id}"]`, or null for any other type. */
function pathsIndexOf(type: IrType): string | null {
  if (type.kind !== "indexedAccess" || type.index.kind !== "stringLiteral") {
    return null;
  }
  const { object } = type;
  const isPaths =
    object.kind === "reference" &&
    object.name === PATHS_TYPE_NAME &&
    object.typeArguments.length === 0;
  return isPaths ? type.index.value : null;
}

/**
 * The lookup, and `paths["/apps/{id}"]` as that path's item. The declarations cannot read it: a
 * templated path is no property of `paths`, and TypeScript finds it through the signature.
 */
function withPathItems(
  paths: readonly PathMember[],
  lookup: DeclaredTypeLookup,
): DeclaredTypeLookup {
  const byUrl = new Map(paths.map((path) => [path.url, path.type]));
  return (type) => {
    const url = pathsIndexOf(type);
    return (url === null ? undefined : byUrl.get(url)) ?? lookup(type);
  };
}

/**
 * The rejection of a covered path item: only one proven not assignable to the signature's type
 * counts (ADR-028). A pair the proof cannot decide keeps the original output, which may well
 * compile (`Record<string, never>` fits `{ [key: string]: unknown }`).
 */
function rejectionOf(paths: readonly PathMember[], lookup: DeclaredTypeLookup): CoverRejection {
  const relate = assignabilityProof(withPathItems(paths, lookup));
  return (coveringIndex, coveredIndex) => {
    const coveringPath = paths[coveringIndex];
    const coveredPath = paths[coveredIndex];
    return (
      coveringPath !== undefined &&
      coveredPath !== undefined &&
      relate(coveredPath.type, coveringPath.type) === "rejected"
    );
  };
}

/**
 * The members as one object type. When an index signature covers another key, TypeScript checks
 * the covered key's type against it. Where that check surely fails (TS2411, TS2413), each such
 * signature gets an object of its own in an intersection: an intersection does not check its parts
 * against each other, and every key has the type it had in the one object. Output that compiles
 * keeps the one object. The lookup reads the types that path items reference; without it, a
 * reference decides nothing.
 */
export function pathsObjectType(
  paths: readonly PathMember[],
  lookup: DeclaredTypeLookup = NO_DECLARED_TYPES,
): IrType {
  const keys = paths.map(({ key }) => key);
  const covering = coveringTemplateKeys(keys, rejectionOf(paths, lookup));
  if (covering.size === 0) {
    return irObject(paths.map(({ member }) => member));
  }
  const rest = paths.filter((_, index) => !covering.has(index)).map(({ member }) => member);
  const own = paths
    .filter((_, index) => covering.has(index))
    .map(({ member }) => irObject([member]));
  return irIntersection([irObject(rest), ...own]);
}

/** The members of the `paths` interface (OpenAPI 3.1 §4.8.8): one per path, by URL. */
export function pathMembers(paths: PathsObject, context: TransformContext): PathMember[] {
  const members: PathMember[] = [];
  const takenUrls = new Set(Object.keys(paths));
  for (const [url, pathItem] of documentEntries(paths, context.options)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }
    if ("$ref" in pathItem) {
      const options = { isReadonly: context.options.immutable };
      const member = documentMember(url, refType(pathItem.$ref), pathItem, options);
      members.push({ url, member, key: literalKey(url), type: member.type });
      continue;
    }
    const startedAt = context.diagnostics.now();
    const pathMembersOfUrl = pathItemMembers(url, pathItem, context);
    members.push(...withoutTakenUrls(url, pathMembersOfUrl, takenUrls));
    // The original reports only paths written as properties.
    if (pathMembersOfUrl[0]?.key.kind === "literal" && pathMembersOfUrl[0].key.url === url) {
      context.diagnostics.debug(`Transformed path "${url}"`, context.diagnostics.now() - startedAt);
    }
  }
  return members;
}

/**
 * The `paths` interface body, with only the path items' own types for the overlap check. The
 * document transform checks the overlaps again once the referenced types are declared.
 */
export function pathsType(paths: PathsObject, context: TransformContext): IrType {
  return pathsObjectType(pathMembers(paths, context));
}
