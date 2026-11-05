import { irIntersection, irObject, irProperty, irRaw } from "../../../domain/ir/constructors.js";
import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { escapeTemplateText } from "../../../domain/ir/raw-text-escapes.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type {
  ParameterObject,
  ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import {
  type PathItemObject,
  type PathsObject,
  pathItemOperations,
} from "../../../domain/openapi/path-item-object.js";
import type { ReferenceSchema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { TransformContext } from "../transform-context.js";
import { type DeclaredTypeLookup, NO_DECLARED_TYPES } from "./declared-types.js";
import { documentMember } from "./document-member.js";
import { pathItemType } from "./path-item.js";
import { type PathItemRejection, pathItemRejection } from "./path-item-conflicts.js";
import {
  type CoverRejection,
  coveringTemplateKeys,
  type PathKey,
  type PathKeyPart,
  type PathPlaceholder,
} from "./path-key-overlaps.js";
import { assignabilityProof } from "./type-assignability.js";

const PATH_PARAMETER_RE = /\{[^}]+\}/g;

/** Placeholders by parameter schema type; anything else is a string placeholder. */
const PLACEHOLDERS: ReadonlyMap<unknown, PathPlaceholder> = new Map([
  ["number", "number"],
  ["integer", "number"],
  ["boolean", "boolean"],
]);
const STRING_PLACEHOLDER: PathPlaceholder = "string";

/** `${type}`: the text of a template literal type placeholder. */
function placeholderText(type: PathPlaceholder): string {
  return `\${${type}}`;
}

function resolvedParameter(
  parameter: ParameterOrReference,
  context: TransformContext,
): ParameterObject | undefined {
  return "$ref" in parameter && parameter.$ref
    ? (context.refs.resolve(parameter.$ref) as ParameterObject | undefined)
    : (parameter as ParameterObject);
}

function addPathParameters(
  parameters: readonly ParameterOrReference[],
  byName: Map<string, ParameterObject>,
  context: TransformContext,
): void {
  for (const parameter of parameters) {
    const resolved = resolvedParameter(parameter, context);
    if (resolved && resolved.in === "path") {
      byName.set(resolved.name, resolved);
    }
  }
}

/** Path parameters of the path item and of its operations; later definitions win. */
function pathParameters(
  pathItem: PathItemObject,
  context: TransformContext,
): Map<string, ParameterObject> {
  const byName = new Map<string, ParameterObject>();
  addPathParameters(pathItem.parameters ?? [], byName, context);
  for (const { operation: entry } of pathItemOperations(pathItem)) {
    const operation = (entry as ReferenceSchema).$ref
      ? (context.refs.resolve((entry as ReferenceSchema).$ref) as OperationObject | undefined)
      : (entry as OperationObject);
    addPathParameters(operation?.parameters ?? [], byName, context);
  }
  return byName;
}

/**
 * `--path-params-as-types`: the URL as template parts, each `{name}` replaced by a placeholder for
 * its parameter's type. Null when the URL has no complete `{…}` placeholder.
 */
function pathTemplateParts(
  url: string,
  pathItem: PathItemObject,
  context: TransformContext,
): PathKeyPart[] | null {
  const matches = url.match(PATH_PARAMETER_RE);
  if (!matches) {
    return null;
  }
  const parameters = pathParameters(pathItem, context);
  const placeholders = matches.map((match) => {
    const schema = parameters.get(match.slice(1, -1))?.schema as SchemaObject | undefined;
    return PLACEHOLDERS.get(schema?.type) ?? STRING_PLACEHOLDER;
  });
  return url.split(PATH_PARAMETER_RE).flatMap((text, index): PathKeyPart[] => {
    const type = placeholders[index];
    const textPart: PathKeyPart = { kind: "text", text };
    return type === undefined ? [textPart] : [textPart, { kind: "placeholder", type }];
  });
}

/**
 * The template literal type of the parts. The original escaped only backticks: a backslash or
 * `${` in the URL could end the literal or open a placeholder, and add code to the generated file
 * (intentional fix). So the text parts are escaped.
 */
function templateText(parts: readonly PathKeyPart[]): string {
  const text = parts
    .map((part) =>
      part.kind === "text" ? escapeTemplateText(part.text) : placeholderText(part.type),
    )
    .join("");
  return `\`${text}\``;
}

/** A path's member, its key and its path item type for the overlap check. */
export interface PathMember {
  readonly url: string;
  readonly member: IrMember;
  readonly key: PathKey;
  readonly type: IrType;
}

function pathItemMember(
  url: string,
  pathItem: PathItemObject,
  context: TransformContext,
): PathMember {
  const isReadonly = context.options.immutable;
  const type = pathItemType(pathItem, { path: createRef(["paths", url]) }, context);
  const parts =
    context.options.pathParamsAsTypes && url.includes("{")
      ? pathTemplateParts(url, pathItem, context)
      : null;
  if (parts === null) {
    const member = irProperty(toPropertyName(url), type, { isReadonly });
    return { url, member, key: literalKey(url), type };
  }
  const member: IrMember = {
    kind: "indexSignature",
    parameterName: "path",
    parameterType: irRaw(templateText(parts)),
    type,
    isReadonly,
    comments: [],
  };
  return { url, member, key: { kind: "template", parts }, type };
}

function literalKey(url: string): PathKey {
  return { kind: "literal", url };
}

/** A cover rejection by the indexes of the paths, from a rejection of their path item types. */
function rejectionOf(paths: readonly PathMember[], isRejected: PathItemRejection): CoverRejection {
  return (coveringIndex, coveredIndex) => {
    const coveringPath = paths[coveringIndex];
    const coveredPath = paths[coveredIndex];
    return (
      coveringPath !== undefined &&
      coveredPath !== undefined &&
      isRejected(coveredPath.type, coveringPath.type)
    );
  };
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
 * The exact check. Once the declarations are known, a covered path item that is not proven
 * assignable to the signature's type counts as rejected, so every output compiles. Before that,
 * only a proven rejection counts: references cannot be read yet.
 */
function exactRejection(
  paths: readonly PathMember[],
  lookup: DeclaredTypeLookup,
): PathItemRejection {
  if (lookup === NO_DECLARED_TYPES) {
    return pathItemRejection();
  }
  const isAssignable = assignabilityProof(withPathItems(paths, lookup));
  return (covered, covering) => !isAssignable(covered, covering);
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
  const covering = coveringTemplateKeys(keys, {
    sampled: rejectionOf(paths, pathItemRejection()),
    exact: rejectionOf(paths, exactRejection(paths, lookup)),
  });
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
    const path = pathItemMember(url, pathItem, context);
    members.push(path);
    // The original reports only paths written as properties.
    if (path.member.kind === "property") {
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
