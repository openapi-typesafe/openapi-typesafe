import { escapeTemplateText } from "../../../domain/ir/raw-text-escapes.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type {
  ParameterObject,
  ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import {
  type PathItemObject,
  pathItemOperations,
} from "../../../domain/openapi/path-item-object.js";
import type { ReferenceSchema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type { TransformContext } from "../transform-context.js";
import type { PathKeyPart, PathPlaceholder } from "./path-key-overlaps.js";
import {
  type PathParameterMatch,
  placeholderText,
  replacedTemplateParts,
} from "./path-template-replace.js";

/** The `--path-params-as-types` key of a path: its URL with a placeholder per parameter. */

/** `[^{}]` keeps the scan linear: `[^}]` retried from every `{` of a long run of them. */
const PATH_PARAMETER_RE = /\{[^{}]+\}/g;

/** Placeholders by parameter schema type; anything else is a string placeholder. */
const PLACEHOLDERS: ReadonlyMap<unknown, PathPlaceholder> = new Map([
  ["number", "number"],
  ["integer", "number"],
  ["boolean", "boolean"],
]);
const STRING_PLACEHOLDER: PathPlaceholder = "string";

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

/** Each `{name}` of the URL and its own placeholder, from the URL split at the matches. */
function splitTemplateParts(url: string, matches: readonly PathParameterMatch[]): PathKeyPart[] {
  return url.split(PATH_PARAMETER_RE).flatMap((text, index): PathKeyPart[] => {
    const type = matches[index]?.type;
    const textPart: PathKeyPart = { kind: "text", text };
    return type === undefined ? [textPart] : [textPart, { kind: "placeholder", type }];
  });
}

/**
 * `--path-params-as-types`: the URL as template parts, each `{name}` replaced by a placeholder for
 * its parameter's type, the way the original replaces them unless the `path-param-type-names` fix
 * is on (see `replacedTemplateParts`). Null when the URL has no complete `{…}` placeholder.
 */
export function pathTemplateParts(
  url: string,
  pathItem: PathItemObject,
  context: TransformContext,
): PathKeyPart[] | null {
  const found = url.match(PATH_PARAMETER_RE);
  if (!found) {
    return null;
  }
  const parameters = pathParameters(pathItem, context);
  const matches = found.map((match): PathParameterMatch => {
    const schema = parameters.get(match.slice(1, -1))?.schema as SchemaObject | undefined;
    return { match, type: PLACEHOLDERS.get(schema?.type) ?? STRING_PLACEHOLDER };
  });
  return context.options.fixes.has(FIX.PATH_PARAM_TYPE_NAMES)
    ? splitTemplateParts(url, matches)
    : replacedTemplateParts(url, matches);
}

/**
 * The template literal type of the parts. The original escaped only backticks: a backslash or
 * `${` in the URL could end the literal or open a placeholder, and add code to the generated file
 * (intentional fix). So the text parts are escaped.
 */
export function templateText(parts: readonly PathKeyPart[]): string {
  const text = parts
    .map((part) =>
      part.kind === "text" ? escapeTemplateText(part.text) : placeholderText(part.type),
    )
    .join("");
  return `\`${text}\``;
}

const BOOLEAN_TEXTS = ["true", "false"] as const;

/**
 * The keys of the parts with each `${boolean}` written as `true` and as `false`. `${boolean}` is
 * the union `"true" | "false"`, and an index signature takes no union of literals (TS1337), so
 * the original's `` [path: `/flags/${boolean}`] `` did not compile. A path with n boolean
 * parameters gets 2ⁿ keys, all with the same path item type; a key left without placeholders is
 * a plain URL (`/flags/true`).
 */
export function booleanExpandedKeys(parts: readonly PathKeyPart[]): PathKeyPart[][] {
  return parts.reduce<PathKeyPart[][]>(
    (keys, part) => {
      const choices: readonly PathKeyPart[] =
        part.kind === "placeholder" && part.type === "boolean"
          ? BOOLEAN_TEXTS.map((text) => ({ kind: "text", text }))
          : [part];
      return keys.flatMap((key) => choices.map((choice) => [...key, choice]));
    },
    [[]],
  );
}

/** The URL of parts without placeholders; null when one is left. */
export function plainUrlOf(parts: readonly PathKeyPart[]): string | null {
  const texts = parts.map((part) => (part.kind === "text" ? part.text : null));
  return texts.includes(null) ? null : texts.join("");
}
