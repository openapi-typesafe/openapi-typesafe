import type { Logger } from "../application/ports/logger.js";
import type {
  DiscriminatorObject,
  GeneratorOptions,
  OpenAPI3,
  ReferenceObject,
  SchemaObject,
} from "../types.js";
import { defaultLogger } from "./default-ports.js";
import type { EnumPatch } from "./discriminator-enum.js";
import {
  type DiscriminatorScanOptions,
  enumKey,
  markHandled,
  mergesValues,
  patchDiscriminatorEnum,
  type ScanState,
} from "./discriminator-patch.js";
import { walkDocument } from "./document-refs.js";
import { createRef } from "./legacy-utils.js";

/**
 * The inherited discriminator pre-pass. It finds every discriminator in the bundled document and
 * patches the mapped schemas in place with a required enum property, so that TypeScript can narrow
 * the generated union. The behavior and the warning text match the original `scanDiscriminators`.
 */

type DiscriminatorMapping = Record<string, { inferred?: string; defined?: string[] }>;

/** The schema name at the end of each `oneOf` `$ref` is the inferred discriminator value. */
function inferredMapping(oneOf: (SchemaObject | ReferenceObject)[]): DiscriminatorMapping {
  const mapping: DiscriminatorMapping = {};
  for (const item of oneOf) {
    if (!("$ref" in item)) {
      continue;
    }
    const value = item.$ref.split("/").pop();
    if (value) {
      mapping[item.$ref] = { ...mapping[item.$ref], inferred: value };
    }
  }
  return mapping;
}

/** Values defined in `discriminator.mapping` replace inferred ones for the same schema. */
function addDefinedMapping(
  mapping: DiscriminatorMapping,
  discriminator: DiscriminatorObject,
): void {
  for (const [mappedValue, mappedRef] of Object.entries(discriminator.mapping ?? {})) {
    if (!mappedRef) {
      continue;
    }
    if (!mapping[mappedRef]?.defined) {
      mapping[mappedRef] = { defined: [] };
    }
    mapping[mappedRef].defined?.push(mappedValue);
  }
}

function patchMappedSchemas(
  state: ScanState,
  mapping: DiscriminatorMapping,
  discriminator: Omit<EnumPatch, "ref" | "values">,
): void {
  for (const [ref, { inferred, defined }] of Object.entries(mapping)) {
    const isSkipped = !mergesValues(state) && state.refsHandled.includes(ref);
    if (isSkipped || (!inferred && !defined)) {
      continue;
    }
    // A defined value wins: the schema name may not be the value the API sends.
    const values = defined ?? [inferred as string];
    if (mergesValues(state) && defined === undefined) {
      // A mapping found later, in this pass or the next, may name the schema.
      state.inferredPatches.push({ ...discriminator, ref, values });
    } else if (patchDiscriminatorEnum(state, { ...discriminator, ref, values })) {
      markHandled(state, ref);
    }
  }
}

/** Pass 1: collect every discriminator; patch the schemas of a discriminator + `oneOf`. */
function collectDiscriminator(
  state: ScanState,
  value: Record<string, unknown>,
  path: (string | number)[],
): void {
  const discriminator = value.discriminator as DiscriminatorObject | undefined;
  if (!discriminator?.propertyName) {
    return;
  }
  const discriminatorRef = createRef(path);
  state.objects[discriminatorRef] = discriminator;
  if (!Array.isArray(value.oneOf)) {
    return;
  }
  const mapping = inferredMapping(value.oneOf);
  if (discriminator.mapping) {
    addDefinedMapping(mapping, discriminator);
  }
  patchMappedSchemas(state, mapping, { discriminator, discriminatorRef });
}

/** The mapping keys of `discriminator` that point at `ref`. */
function valuesMappedTo(discriminator: DiscriminatorObject, ref: string): string[] {
  return Object.entries(discriminator.mapping ?? {})
    .filter(([, mappedRef]) => mappedRef === ref)
    .map(([mappedValue]) => mappedValue);
}

/**
 * An `allOf` item that is a `$ref` to a discriminator owner: the schema at `ref` inherits the
 * discriminator, and gets its enum when the parent's mapping names it. Returns false when the
 * `$ref` owns no discriminator, which ends the scan of this `allOf` (as in the original).
 */
function inheritFromRef(state: ScanState, parentRef: string, ref: string): boolean {
  const discriminator = state.objects[parentRef];
  if (!discriminator) {
    return false;
  }
  const values = valuesMappedTo(discriminator, ref);
  const patch = { ref, values, discriminator, discriminatorRef: parentRef };
  if (values.length > 0 && patchDiscriminatorEnum(state, patch)) {
    markHandled(state, ref);
  }
  state.objects[ref] = { ...discriminator };
  return true;
}

/** Pass 2: a schema whose `allOf` holds a discriminator, or a `$ref` to one, inherits it. */
function inheritDiscriminators(
  state: ScanState,
  value: Record<string, unknown>,
  path: (string | number)[],
): void {
  if (!Array.isArray(value.allOf)) {
    return;
  }
  for (const item of value.allOf as (SchemaObject | ReferenceObject)[]) {
    if ("$ref" in item) {
      if (!inheritFromRef(state, item.$ref, createRef(path))) {
        return;
      }
    } else if (item.discriminator?.propertyName) {
      state.objects[createRef(path)] = { ...item.discriminator };
    }
  }
}

/** The discriminators of a bundled document, after patching the mapped schemas in place. */
export interface DiscriminatorScan {
  objects: Record<string, DiscriminatorObject>;
  refsHandled: string[];
}

/**
 * With the fix: a schema-name value, only for a schema and property that no mapping gave a value.
 * Every enum patched so far came from a mapping, since schema-name values wait for this step.
 */
function applyInferredPatches(state: ScanState): void {
  const mapped = new Set(state.patchedEnums.keys());
  for (const patch of state.inferredPatches) {
    if (!mapped.has(enumKey(patch)) && patchDiscriminatorEnum(state, patch)) {
      markHandled(state, patch.ref);
    }
  }
}

/** Find every discriminator in `schema`; warnings go to `logger` unless `silent`. */
export function findDiscriminators(
  schema: OpenAPI3,
  options: DiscriminatorScanOptions,
): DiscriminatorScan {
  const state: ScanState = {
    ...options,
    schema,
    objects: {},
    refsHandled: [],
    patchedEnums: new Map(),
    inferredPatches: [],
  };
  walkDocument(schema, (value, path) => collectDiscriminator(state, value, path));
  // A second pass, because an `allOf` may name a discriminator that is defined later.
  walkDocument(schema, (value, path) => inheritDiscriminators(state, value, path));
  applyInferredPatches(state);
  return { objects: state.objects, refsHandled: state.refsHandled };
}

/**
 * Return a key–value map of discriminator objects found in a schema. Warnings go to `logger`;
 * without one, to the default terminal logger, as the original did.
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function scanDiscriminators(
  schema: OpenAPI3,
  options: GeneratorOptions,
  logger: Logger = defaultLogger(options.silent ?? false),
): DiscriminatorScan {
  const silent = options.silent ?? false;
  return findDiscriminators(schema, { silent, logger, fixes: new Set() });
}
