import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type {
  ParameterObject,
  ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import type { PathItemObject } from "../../../domain/openapi/path-item-object.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { RefResolver } from "../schema/schema-context.js";
import type { TransformContext } from "../transform-context.js";

/** A parameter as written in the document, and the object its `$ref` points to. */
export interface ParameterEntry {
  readonly original: ParameterOrReference;
  readonly resolved: ParameterObject | undefined;
}

/** An entry whose `$ref` resolved, so its location and name are known. */
export type ResolvedEntry = ParameterEntry & { readonly resolved: ParameterObject };

/** The parameter object itself, or the one its `$ref` points to. */
export function resolveParameter(
  parameter: ParameterOrReference,
  refs: RefResolver,
): ParameterObject | undefined {
  return "$ref" in parameter
    ? (refs.resolve(parameter.$ref) as ParameterObject | undefined)
    : parameter;
}

function isDeprecatedParameter(parameter: ParameterObject | undefined): boolean {
  const schema = parameter?.schema as SchemaObject | undefined;
  return Boolean(parameter?.deprecated || schema?.deprecated);
}

/** Resolved parameters, sorted for `--alphabetize`, without deprecated ones if excluded. */
export function parameterEntries(
  parameters: readonly ParameterOrReference[],
  context: TransformContext,
): ParameterEntry[] {
  const entries = parameters.map((original) => ({
    original,
    resolved: resolveParameter(original, context.refs),
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

/**
 * Path item parameters followed by the operation's, keyed by location and name, so an operation
 * parameter replaces the path item parameter it redefines (upstream issue #1798).
 */
export function mergedParameters(
  pathItem: PathItemObject,
  operation: OperationObject,
  refs: RefResolver,
): ParameterOrReference[] {
  const byKey = new Map<string, ParameterOrReference>();
  for (const parameter of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const resolved = resolveParameter(parameter, refs);
    byKey.set(`${resolved?.in}-${resolved?.name}`, parameter);
  }
  return [...byKey.values()];
}
