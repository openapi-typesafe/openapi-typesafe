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
import { documentMember } from "./document-member.js";
import { pathItemType } from "./path-item.js";
import {
  coveringTemplateKeys,
  type PathKey,
  type PathKeyPart,
  type PathPlaceholder,
} from "./path-key-overlaps.js";

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

/** A path's member, and its key for the overlap check. */
interface PathMember {
  readonly member: IrMember;
  readonly key: PathKey;
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
    return { member: irProperty(toPropertyName(url), type, { isReadonly }), key: literalKey(url) };
  }
  const member: IrMember = {
    kind: "indexSignature",
    parameterName: "path",
    parameterType: irRaw(templateText(parts)),
    type,
    isReadonly,
    comments: [],
  };
  return { member, key: { kind: "template", parts } };
}

function literalKey(url: string): PathKey {
  return { kind: "literal", url };
}

/**
 * The members as one object type. When an index signature covers another key, TypeScript checks
 * the covered key's type against it and the object does not compile (TS2411, TS2413); then each
 * covering signature gets an object of its own in an intersection. An intersection does not check
 * its parts against each other, and every key has the type it had in the one object.
 */
function pathsObjectType(paths: readonly PathMember[]): IrType {
  const covering = coveringTemplateKeys(paths.map(({ key }) => key));
  if (covering.size === 0) {
    return irObject(paths.map(({ member }) => member));
  }
  const rest = paths.filter((_, index) => !covering.has(index)).map(({ member }) => member);
  const own = paths
    .filter((_, index) => covering.has(index))
    .map(({ member }) => irObject([member]));
  return irIntersection([irObject(rest), ...own]);
}

/** The `paths` interface body (OpenAPI 3.1 §4.8.8): one member per path, by URL. */
export function pathsType(paths: PathsObject, context: TransformContext): IrType {
  const members: PathMember[] = [];
  for (const [url, pathItem] of documentEntries(paths, context.options)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }
    if ("$ref" in pathItem) {
      const options = { isReadonly: context.options.immutable };
      const member = documentMember(url, refType(pathItem.$ref), pathItem, options);
      members.push({ member, key: literalKey(url) });
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
  return pathsObjectType(members);
}
