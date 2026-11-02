import type { Logger } from "../application/ports/logger.js";
import type {
  DiscriminatorObject,
  GeneratorOptions,
  ObjectSubtype,
  OpenAPI3,
  ReferenceObject,
  SchemaObject,
} from "../types.js";
import { defaultLogger } from "./default-ports.js";
import { createRef, resolveRef, walk } from "./legacy-utils.js";

/**
 * The inherited discriminator pre-pass. It finds every discriminator in the bundled document and
 * patches the mapped schemas in place with a required enum property, so that TypeScript can narrow
 * the generated union. The behavior and the warning text match the original `scanDiscriminators`.
 */

type DiscriminatorMapping = Record<string, { inferred?: string; defined?: string[] }>;

/** What the two passes share: the document they patch and what they found so far. */
interface ScanState {
  readonly schema: OpenAPI3;
  readonly silent: boolean;
  readonly logger: Logger;
  readonly objects: Record<string, DiscriminatorObject>;
  readonly refsHandled: string[];
}

/** One mapped schema to patch: `ref` is the schema; `discriminatorRef` owns the discriminator. */
interface EnumPatch {
  readonly ref: string;
  readonly values: string[];
  readonly discriminator: DiscriminatorObject;
  readonly discriminatorRef: string;
}

function discriminatorEnum(values: string[], previous?: SchemaObject): SchemaObject {
  return {
    type: "string",
    enum: values,
    description: previous?.description
      ? `${previous.description} (enum property replaced by openapi-typesafe)`
      : "discriminator enum property added by openapi-typesafe",
  };
}

/** An `allOf` schema gets one more item that holds the required enum property. */
function patchAllOf(allOf: (SchemaObject | ReferenceObject)[], patch: EnumPatch): void {
  allOf.push({
    type: "object",
    required: [patch.discriminator.propertyName],
    properties: { [patch.discriminator.propertyName]: discriminatorEnum(patch.values) },
  });
}

/** An object schema gets the enum property, which is always required, added or replaced. */
function patchObjectSchema(schema: SchemaObject & ObjectSubtype, patch: EnumPatch): void {
  const name = patch.discriminator.propertyName;
  if (!schema.properties) {
    schema.properties = {};
  }
  if (!schema.required) {
    schema.required = [name];
  } else if (!schema.required.includes(name)) {
    schema.required.push(name);
  }
  schema.properties[name] = discriminatorEnum(
    patch.values,
    schema.properties[name] as SchemaObject,
  );
}

function isObjectSchema(schema: unknown): schema is SchemaObject & ObjectSubtype {
  return (
    typeof schema === "object" && schema !== null && "type" in schema && schema.type === "object"
  );
}

/**
 * Add or replace the discriminator enum in the schema at `patch.ref`. Returns false, with a
 * warning, when that schema is neither an `allOf` nor an object schema.
 */
function patchDiscriminatorEnum(state: ScanState, patch: EnumPatch): boolean {
  const { silent, logger } = state;
  const resolved = resolveRef<SchemaObject>(state.schema, patch.ref, { silent, logger });
  if (resolved?.allOf) {
    patchAllOf(resolved.allOf, patch);
    return true;
  }
  if (isObjectSchema(resolved)) {
    patchObjectSchema(resolved, patch);
    return true;
  }
  warnInvalidMapping(patch, state.logger);
  return false;
}

function warnInvalidMapping(patch: EnumPatch, logger: Logger): void {
  const mapped = `${patch.ref} => ${patch.values.join(", ")}`;
  logger.warn(
    "Discriminator mapping has an invalid schema (neither an object schema nor an allOf array): " +
      `${mapped} (Discriminator: ${patch.discriminatorRef})`,
  );
}

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
    if (state.refsHandled.includes(ref) || (!inferred && !defined)) {
      continue;
    }
    // A defined value wins: the schema name may not be the value the API sends.
    const values = defined ?? [inferred as string];
    if (patchDiscriminatorEnum(state, { ...discriminator, ref, values })) {
      state.refsHandled.push(ref);
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
    state.refsHandled.push(ref);
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

/**
 * Return a key–value map of discriminator objects found in a schema. Warnings go to `logger`;
 * without one, to the default terminal logger, as the original did.
 */
export function scanDiscriminators(
  schema: OpenAPI3,
  options: GeneratorOptions,
  logger: Logger = defaultLogger(options.silent ?? false),
): { objects: Record<string, DiscriminatorObject>; refsHandled: string[] } {
  const silent = options.silent ?? false;
  const state: ScanState = { schema, silent, logger, objects: {}, refsHandled: [] };
  walk(schema, (value, path) => collectDiscriminator(state, value, path));
  // A second pass, because an `allOf` may name a discriminator that is defined later.
  walk(schema, (value, path) => inheritDiscriminators(state, value, path));
  return { objects: state.objects, refsHandled: state.refsHandled };
}
