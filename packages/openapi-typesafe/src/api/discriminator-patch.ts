import type { Logger } from "../application/ports/logger.js";
import { OutputFix } from "../domain/output-fixes.js";
import type { DiscriminatorObject, OpenAPI3, SchemaObject } from "../types.js";
import { addEnumProperty, type EnumPatch } from "./discriminator-enum.js";
import { resolveDocumentRef } from "./document-refs.js";

/**
 * The state of the discriminator pre-pass and the in-place patch of a mapped schema: the enum
 * property that the generated union narrows by. Two discriminators of one property may patch one
 * schema; how they combine is the `discriminator-values` fix (ADR-021, roadmap R12).
 */

/** How to scan: the warnings, and the output fixes of the run (ADR-021). */
export interface DiscriminatorScanOptions {
  readonly silent: boolean;
  readonly logger: Logger;
  readonly fixes: ReadonlySet<OutputFix>;
}

/** What the two passes share: the document they patch and what they found so far. */
export interface ScanState extends DiscriminatorScanOptions {
  readonly schema: OpenAPI3;
  readonly objects: Record<string, DiscriminatorObject>;
  /** The schemas that define a discriminator themselves (pass 1), not by inheritance. */
  readonly owners: Set<string>;
  readonly refsHandled: string[];
  /** With the fix: the enum added to each schema, by schema and property, so values merge. */
  readonly patchedEnums: Map<string, SchemaObject>;
  /** With the fix: schema-name values, applied after both passes where no mapping names one. */
  readonly inferredPatches: EnumPatch[];
}

/** Whether `discriminator-values` is on: values of two discriminators merge into one enum. */
export function mergesValues(state: ScanState): boolean {
  return state.fixes.has(OutputFix.DISCRIMINATOR_VALUES);
}

/** The enum the schema at `patch.ref` gets, or null (with a warning) for another kind of schema. */
function addDiscriminatorEnum(state: ScanState, patch: EnumPatch): SchemaObject | null {
  const { silent, logger } = state;
  const resolved = resolveDocumentRef<SchemaObject>(state.schema, patch.ref, { silent, logger });
  const added = addEnumProperty(resolved, patch);
  if (added === null) {
    warnInvalidMapping(patch, state.logger);
  }
  return added;
}

/** One schema and discriminator property; two discriminators of one property share an enum. */
export function enumKey(patch: EnumPatch): string {
  return `${patch.ref}\n${patch.discriminator.propertyName}`;
}

/** With the fix, a second discriminator of the same property adds its values to the first enum. */
function mergeIntoPatchedEnum(state: ScanState, key: string, values: readonly string[]): boolean {
  const patched = state.patchedEnums.get(key);
  if (patched === undefined) {
    return false;
  }
  const merged = patched.enum as unknown[];
  merged.push(...values.filter((value) => !merged.includes(value)));
  return true;
}

/**
 * Add or replace the discriminator enum in the schema at `patch.ref`. Returns false, with a
 * warning, when that schema is neither an `allOf` nor an object schema. Without the fix every
 * patch adds a property, so two discriminators with different values intersect to `never`.
 */
export function patchDiscriminatorEnum(state: ScanState, patch: EnumPatch): boolean {
  if (!mergesValues(state)) {
    return addDiscriminatorEnum(state, patch) !== null;
  }
  const key = enumKey(patch);
  if (mergeIntoPatchedEnum(state, key, patch.values)) {
    return true;
  }
  const added = addDiscriminatorEnum(state, patch);
  if (added !== null) {
    state.patchedEnums.set(key, added);
  }
  return added !== null;
}

export function markHandled(state: ScanState, ref: string): void {
  if (!state.refsHandled.includes(ref)) {
    state.refsHandled.push(ref);
  }
}

function warnInvalidMapping(patch: EnumPatch, logger: Logger): void {
  const mapped = `${patch.ref} => ${patch.values.join(", ")}`;
  logger.warn(
    "Discriminator mapping has an invalid schema (neither an object schema nor an allOf array): " +
      `${mapped} (Discriminator: ${patch.discriminatorRef})`,
  );
}
