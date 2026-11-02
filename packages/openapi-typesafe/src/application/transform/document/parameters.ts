import { irKeyword, irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrPropertyName, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import {
  PARAMETER_LOCATIONS,
  type ParameterLocation,
  type ParameterObject,
  type ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { refType } from "../ref-type.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import { withSchemaComment } from "../schema-comment.js";
import type { TransformContext } from "../transform-context.js";
import { parameterType } from "./parameter.js";

const PATH_TEMPLATE_RE = /\{([^}]+)\}/g;

/** A parameter as written in the document, and the object its `$ref` points to. */
interface ParameterEntry {
  readonly original: ParameterOrReference;
  readonly resolved: ParameterObject | undefined;
}

/** An entry whose `$ref` resolved, so its location and name are known. */
type ResolvedEntry = ParameterEntry & { readonly resolved: ParameterObject };

function resolveParameter(
  parameter: ParameterOrReference,
  context: TransformContext,
): ParameterObject | undefined {
  return "$ref" in parameter
    ? (context.refs.resolve(parameter.$ref) as ParameterObject | undefined)
    : parameter;
}

/** Required string parameters for every `{name}` in a path template. */
function pathTemplateParameters(path: string): ParameterObject[] {
  return (path.match(PATH_TEMPLATE_RE) ?? []).map((match) => ({
    name: match.slice(1, -1),
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

/** `--generate-path-params`: add the path template parameters the list does not define. */
function withPathTemplateParameters(
  parameters: readonly ParameterOrReference[],
  location: SchemaLocation,
  context: TransformContext,
): ParameterOrReference[] {
  const result = [...parameters];
  if (!context.options.generatePathParams || !location.path) {
    return result;
  }
  for (const parameter of pathTemplateParameters(location.path)) {
    const isDefined = result.some((candidate) => {
      const resolved = resolveParameter(candidate, context);
      return resolved?.in === "path" && resolved.name === parameter.name;
    });
    if (!isDefined) {
      result.push(parameter);
    }
  }
  return result;
}

function isDeprecatedParameter(parameter: ParameterObject | undefined): boolean {
  const schema = parameter?.schema as SchemaObject | undefined;
  return Boolean(parameter?.deprecated || schema?.deprecated);
}

/** Resolved parameters, sorted for `--alphabetize`, without deprecated ones if excluded. */
function parameterEntries(
  parameters: readonly ParameterOrReference[],
  context: TransformContext,
): ParameterEntry[] {
  const entries = parameters.map((original) => ({
    original,
    resolved: resolveParameter(original, context),
  }));
  if (context.options.alphabetize) {
    // Unlike map keys, the original sorts parameters with the default locale's `localeCompare`.
    entries.sort((left, right) =>
      (left.resolved?.name ?? "").localeCompare(right.resolved?.name ?? ""),
    );
  }
  return context.options.excludeDeprecated
    ? entries.filter(({ resolved }) => !isDeprecatedParameter(resolved))
    : entries;
}

/** The original quotes a name that is not text (a missing name prints as `"undefined"`). */
function parameterName(name: unknown): IrPropertyName {
  return typeof name === "string" || typeof name === "number"
    ? toPropertyName(name)
    : { kind: "string", value: String(name) };
}

function referencedParameterType(ref: string, resolved: ParameterObject): IrType {
  // A `$ref` that resolves to another `$ref` is not a parameter object yet: index it as a path.
  const isParameter = !(resolved as { $ref?: unknown }).$ref;
  const parameter = isParameter ? { in: resolved.in, name: resolved.name } : null;
  return refType(ref, { parameter });
}

function parameterMember(
  { original, resolved }: ResolvedEntry,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const path = createRef([location.path, "parameters", resolved.in, resolved.name]);
  const type =
    "$ref" in original
      ? referencedParameterType(original.$ref, resolved)
      : parameterType(resolved, { ...location, path }, context);
  const property = irProperty(parameterName(resolved.name), type, {
    isOptional: resolved.in !== "path" && !resolved.required,
    isReadonly: context.options.immutable,
  });
  return withSchemaComment(property, resolved);
}

/** One location's parameters; optional when all of them are, and `never` when there are none. */
function locationMember(
  parameterIn: ParameterLocation,
  entries: readonly ParameterEntry[],
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const members = entries
    .filter((entry): entry is ResolvedEntry => entry.resolved?.in === parameterIn)
    .map((entry) => parameterMember(entry, location, context));
  return irProperty(
    toPropertyName(parameterIn),
    members.length > 0 ? irObject(members) : irKeyword("never"),
    {
      isOptional: members.every((member) => member.isOptional),
      isReadonly: context.options.immutable,
    },
  );
}

/**
 * The `parameters` property of an operation or path item: one member per location, each an object
 * of that location's parameters. `location.path` is the path template for
 * `--generate-path-params`.
 */
export function parametersMember(
  parameters: readonly ParameterOrReference[],
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const entries = parameterEntries(
    withPathTemplateParameters(parameters, location, context),
    context,
  );
  const members = PARAMETER_LOCATIONS.map((parameterIn) =>
    locationMember(parameterIn, entries, location, context),
  );
  return irProperty(toPropertyName("parameters"), irObject(members), {
    isReadonly: context.options.immutable,
  });
}
