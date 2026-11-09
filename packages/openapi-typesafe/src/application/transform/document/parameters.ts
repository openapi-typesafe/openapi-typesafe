import {
  irIntersection,
  irKeyword,
  irObject,
  irProperty,
  irReference,
} from "../../../domain/ir/constructors.js";
import type { IrPropertyName, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { appendPointer } from "../../../domain/openapi/json-pointer.js";
import {
  PARAMETER_LOCATIONS,
  type ParameterLocation,
  type ParameterObject,
  type ParameterOrReference,
  QUERYSTRING_LOCATION,
} from "../../../domain/openapi/parameter-object.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { refType } from "../ref-type.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import { withSchemaComment } from "../schema-comment.js";
import type { TransformContext } from "../transform-context.js";
import { isExplodedQueryObject } from "./exploded-query.js";
import { parameterType } from "./parameter.js";

/** `[^{}]` keeps the scan linear: `[^}]` retried from every `{` of a long run of them. */
const PATH_TEMPLATE_RE = /\{([^{}]+)\}/g;

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

function entryType(
  { original, resolved }: ResolvedEntry,
  location: SchemaLocation,
  context: TransformContext,
): IrType {
  const path = appendPointer(location.path, ["parameters", resolved.in, resolved.name]);
  return "$ref" in original
    ? referencedParameterType(original.$ref, resolved)
    : parameterType(resolved, { ...location, path }, context);
}

function parameterMember(
  entry: ResolvedEntry,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const { resolved } = entry;
  const property = irProperty(parameterName(resolved.name), entryType(entry, location, context), {
    isOptional: resolved.in !== "path" && !resolved.required,
    isReadonly: context.options.immutable,
  });
  return withSchemaComment(property, resolved);
}

/**
 * The `query` member typed by an `in: querystring` parameter (OpenAPI 3.2, ADR-020): the parameter
 * is the whole query string. Null when there is none, or when `in: query` parameters sit next to
 * it, which 3.2 does not allow; those keep their types, and a warning names the parameter.
 */
function querystringMember(
  entries: readonly ParameterEntry[],
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature | null {
  const querystring = entries.find(
    (entry): entry is ResolvedEntry => entry.resolved?.in === QUERYSTRING_LOCATION,
  );
  if (!querystring || entries.some((entry) => entry.resolved?.in === "query")) {
    return null;
  }
  const property = irProperty(toPropertyName("query"), entryType(querystring, location, context), {
    isOptional: !querystring.resolved.required,
    isReadonly: context.options.immutable,
  });
  return withSchemaComment(property, querystring.resolved);
}

/** With `exploded-query-objects`, whether the parameter's object keys are keys of `query`. */
function isExplodedEntry(entry: ResolvedEntry, context: TransformContext): boolean {
  return (
    context.options.fixes.has(FIX.EXPLODED_QUERY_OBJECTS) &&
    isExplodedQueryObject(entry.resolved, context.refs)
  );
}

/**
 * An exploded object parameter's part of `query`: its object type. A parameter that may be left
 * out sends none of its keys then, so they are optional: `Partial<…>`.
 */
function explodedPart(
  entry: ResolvedEntry,
  location: SchemaLocation,
  context: TransformContext,
): IrType {
  const type = entryType(entry, location, context);
  return entry.resolved.required ? type : irReference("Partial", [type]);
}

/** A location's parameters as members, and the object types of its exploded parameters. */
interface LocationParts {
  readonly members: readonly IrPropertySignature[];
  readonly exploded: readonly IrType[];
  readonly isOptional: boolean;
}

/** Each parameter in document order, so the declarations they add keep their order. */
function locationParts(
  entries: readonly ResolvedEntry[],
  location: SchemaLocation,
  context: TransformContext,
): LocationParts {
  const members: IrPropertySignature[] = [];
  const exploded: IrType[] = [];
  let isOptional = true;
  for (const entry of entries) {
    if (isExplodedEntry(entry, context)) {
      exploded.push(explodedPart(entry, location, context));
      isOptional &&= !entry.resolved.required;
      continue;
    }
    const member = parameterMember(entry, location, context);
    members.push(member);
    isOptional &&= member.isOptional;
  }
  return { members, exploded, isOptional };
}

/** The members' object, intersected with the exploded parameters' types; `never` for none. */
function locationType({ members, exploded }: LocationParts): IrType {
  const types = [...(members.length > 0 ? [irObject(members)] : []), ...exploded];
  const [first] = types;
  if (first === undefined) {
    return irKeyword("never");
  }
  return types.length === 1 ? first : irIntersection(types);
}

/** One location's parameters; optional when all of them are, and `never` when there are none. */
function locationMember(
  parameterIn: ParameterLocation,
  entries: readonly ParameterEntry[],
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const located = entries.filter(
    (entry): entry is ResolvedEntry => entry.resolved?.in === parameterIn,
  );
  const parts = locationParts(located, location, context);
  return irProperty(toPropertyName(parameterIn), locationType(parts), {
    isOptional: parts.isOptional,
    isReadonly: context.options.immutable,
  });
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
  const querystring = querystringMember(entries, location, context);
  const members = PARAMETER_LOCATIONS.map((parameterIn) =>
    parameterIn === "query" && querystring
      ? querystring
      : locationMember(parameterIn, entries, location, context),
  );
  return irProperty(toPropertyName("parameters"), irObject(members), {
    isReadonly: context.options.immutable,
  });
}
