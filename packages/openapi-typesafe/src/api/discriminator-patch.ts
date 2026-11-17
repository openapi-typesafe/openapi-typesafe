import type { Logger } from "../application/ports/logger.js";
import { appendAll } from "../domain/append-all.js";
import { FIX, type OutputFix } from "../domain/output-fixes.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import type { DiscriminatorObject, OpenAPI3, SchemaObject } from "../types.js";
import {
  addEnumProperty,
  type DeclaredValues,
  declaredValues,
  type EnumPatch,
  requireDeclared,
} from "./discriminator-enum.js";
import {
  type DiscriminatorOwner,
  type EnumParent,
  enumParentOf,
} from "./discriminator-enum-parent.js";
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
  /** With the fix: schema-name values of other properties (`inheritOtherOwners`). */
  readonly otherInferredPatches: EnumPatch[];
  /** With the fix: the other properties each schema got a value of (`inheritOtherOwners`). */
  readonly otherProperties: Record<string, string[]>;
  /** With `discriminator-values`: the enum keys that a schema declares itself. */
  readonly declaredKeys: Set<string>;
  /** With `discriminator-values`: the owner's enum of each added enum, by that enum. */
  readonly enumParents: Map<object, EnumParent>;
  /** The property schema the document declared where an added enum replaced it, by that enum. */
  readonly replacedProperties: Map<object, unknown>;
}

/** Whether `discriminator-values` is on: values of two discriminators merge into one enum. */
export function mergesValues(state: ScanState): boolean {
  return state.fixes.has(FIX.DISCRIMINATOR_VALUES);
}

function patchedSchema(state: ScanState, patch: EnumPatch): SchemaObject | undefined {
  const { silent, logger } = state;
  return resolveDocumentRef<SchemaObject>(state.schema, patch.ref, { silent, logger });
}

/**
 * With `discriminator-values`: the properties the schema at `patch.ref` declares with exactly
 * these values already, so a patch would only repeat them (#2124); none without the fix.
 */
function declarationsOf(state: ScanState, patch: EnumPatch): readonly DeclaredValues[] {
  return state.fixes.has(FIX.DISCRIMINATOR_VALUES)
    ? declaredValues(patchedSchema(state, patch), patch)
    : [];
}

/**
 * Declared values take the place of the patch: the property becomes required where it is
 * declared, and with `--enum` each value is a member of the owner's enum, as a patch's would be,
 * so no two of them intersect to `never`.
 */
function useDeclarations(
  state: ScanState,
  patch: EnumPatch,
  declarations: readonly DeclaredValues[],
): void {
  for (const declared of declarations) {
    requireDeclared(declared, patch.discriminator.propertyName);
    recordEnumParent(state, patch, declared.property, true);
  }
  state.declaredKeys.add(enumKey(patch));
}

/**
 * With `discriminator-values`: the enum of the owner's property, for `key`: an enum the scan
 * added, a property a member declares its value with, or a discriminator object that a schema
 * inherited.
 */
export function recordEnumParent(
  state: ScanState,
  owner: DiscriminatorOwner,
  key: object,
  isDeclaredByMember = false,
): void {
  if (!state.fixes.has(FIX.DISCRIMINATOR_VALUES)) {
    return;
  }
  const { silent, logger } = state;
  const parent = enumParentOf(owner, (ref) =>
    resolveDocumentRef(state.schema, ref, { silent, logger }),
  );
  if (parent !== undefined) {
    state.enumParents.set(key, isDeclaredByMember ? { ...parent, isDeclaredByMember } : parent);
  }
}

/** The enum the schema at `patch.ref` gets, or null (with a warning) for another kind of schema. */
function addDiscriminatorEnum(state: ScanState, patch: EnumPatch): SchemaObject | null {
  const result = addEnumProperty(patchedSchema(state, patch), patch);
  if (result === null) {
    warnInvalidMapping(patch, state.logger);
    return null;
  }
  recordEnumParent(state, patch, result.added);
  if (result.replaced !== undefined) {
    state.replacedProperties.set(result.added, result.replaced);
  }
  return result.added;
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
  appendAll(
    merged,
    values.filter((value) => !merged.includes(value)),
  );
  return true;
}

/**
 * Add or replace the discriminator enum in the schema at `patch.ref`. Returns false, with a
 * warning, when that schema is neither an `allOf` nor an object schema. Without the fix every
 * patch adds a property, so two discriminators with different values intersect to `never`.
 */
export function patchDiscriminatorEnum(state: ScanState, patch: EnumPatch): boolean {
  const declarations = declarationsOf(state, patch);
  if (declarations.length > 0) {
    useDeclarations(state, patch, declarations);
    return true;
  }
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
    warningText(
      "Discriminator mapping has an invalid schema " +
        "(neither an object schema nor an allOf array): " +
        `${mapped} (Discriminator: ${patch.discriminatorRef})`,
      WARNING_CODES.DISCRIMINATOR_MAPPING_INVALID,
    ),
  );
}
