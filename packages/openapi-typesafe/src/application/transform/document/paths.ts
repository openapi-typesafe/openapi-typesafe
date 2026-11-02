import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type {
  ParameterObject,
  ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import {
  HTTP_METHODS,
  type PathItemObject,
  type PathsObject,
} from "../../../domain/openapi/path-item-object.js";
import type { ReferenceSchema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { TransformContext } from "../transform-context.js";
import { documentMember } from "./document-member.js";
import { pathItemType } from "./path-item.js";

const PATH_PARAMETER_RE = /\{[^}]+\}/g;

/** `${type}`: the text of a template literal type placeholder. */
function placeholder(type: string): string {
  return `\${${type}}`;
}

/** Placeholders by parameter schema type; anything else is a string placeholder. */
const PLACEHOLDERS: ReadonlyMap<unknown, string> = new Map([
  ["number", placeholder("number")],
  ["integer", placeholder("number")],
  ["boolean", placeholder("boolean")],
]);
const STRING_PLACEHOLDER = placeholder("string");

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
  for (const method of HTTP_METHODS) {
    if (!(method in pathItem)) {
      continue;
    }
    const entry = pathItem[method] as OperationObject | ReferenceSchema;
    const operation = (entry as ReferenceSchema).$ref
      ? (context.refs.resolve((entry as ReferenceSchema).$ref) as OperationObject | undefined)
      : (entry as OperationObject);
    addPathParameters(operation?.parameters ?? [], byName, context);
  }
  return byName;
}

/**
 * `--path-params-as-types`: the URL as a template literal type, each `{name}` replaced by a
 * placeholder for its parameter's type. Null when the URL has no complete `{…}` placeholder.
 */
function pathTemplateText(
  url: string,
  pathItem: PathItemObject,
  context: TransformContext,
): string | null {
  const matches = url.match(PATH_PARAMETER_RE);
  if (!matches) {
    return null;
  }
  const parameters = pathParameters(pathItem, context);
  let text = `\`${url}\``;
  for (const match of matches) {
    const schema = parameters.get(match.slice(1, -1))?.schema as SchemaObject | undefined;
    // Only the first occurrence is replaced per match, as in the original.
    text = text.replace(match, PLACEHOLDERS.get(schema?.type) ?? STRING_PLACEHOLDER);
  }
  return text;
}

function pathItemMember(
  url: string,
  pathItem: PathItemObject,
  context: TransformContext,
): IrMember {
  const isReadonly = context.options.immutable;
  const type = pathItemType(pathItem, { path: createRef(["paths", url]) }, context);
  const text =
    context.options.pathParamsAsTypes && url.includes("{")
      ? pathTemplateText(url, pathItem, context)
      : null;
  const keyType = text === null ? null : context.templates.parse(text);
  if (keyType === null) {
    return irProperty(toPropertyName(url), type, { isReadonly });
  }
  return {
    kind: "indexSignature",
    parameterName: "path",
    parameterType: keyType,
    type,
    isReadonly,
    comments: [],
  };
}

/** The `paths` interface body (OpenAPI 3.1 §4.8.8): one member per path, by URL. */
export function pathsType(paths: PathsObject, context: TransformContext): IrType {
  const members: IrMember[] = [];
  for (const [url, pathItem] of documentEntries(paths, context.options)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }
    if ("$ref" in pathItem) {
      members.push(
        documentMember(url, refType(pathItem.$ref), pathItem, {
          isReadonly: context.options.immutable,
        }),
      );
      continue;
    }
    const startedAt = context.diagnostics.now();
    const member = pathItemMember(url, pathItem, context);
    members.push(member);
    // The original reports only paths written as properties.
    if (member.kind === "property") {
      context.diagnostics.debug(`Transformed path "${url}"`, context.diagnostics.now() - startedAt);
    }
  }
  return irObject(members);
}
