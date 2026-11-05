import type { DiscriminatorObject, ReferenceObject, SchemaObject } from "../types.js";
import type { EnumPatch } from "./discriminator-enum.js";
import { enumKey, patchDiscriminatorEnum, type ScanState } from "./discriminator-patch.js";
import { resolveDocumentRef } from "./document-refs.js";

/**
 * The `discriminator-values` fix: a schema inherits one discriminator per property. A schema that
 * owns a discriminator keeps its own (#2200), so the scan does not record the one it inherits for
 * another property (`Content` owns `subtype` and `allOf`s `Element`, which owns `contentType`).
 * Its members (`Video`) still get a value of that property, found here from the owners above.
 */

/** A discriminator and the schema that defines it. */
interface OtherOwner {
  readonly discriminator: DiscriminatorObject;
  readonly ownerRef: string;
}

/** The `$ref`s of a schema's `allOf` items. */
function allOfRefs(state: ScanState, ref: string): string[] {
  const { silent, logger } = state;
  const schema = resolveDocumentRef<SchemaObject>(state.schema, ref, { silent, logger });
  const items = (schema?.allOf ?? []) as (SchemaObject | ReferenceObject)[];
  return items.flatMap((item) =>
    "$ref" in item && typeof item.$ref === "string" ? [item.$ref] : [],
  );
}

/**
 * The owners' discriminators that the schema at `parentRef` and its `allOf` parents define, the
 * nearest one per property, except the property of `parentRef`'s own discriminator.
 */
function otherOwners(state: ScanState, parentRef: string): OtherOwner[] {
  const own = state.objects[parentRef]?.propertyName;
  const found = new Map<string, OtherOwner>();
  const visited = new Set<string>();
  const queue = [parentRef];
  for (let ref = queue.shift(); ref !== undefined; ref = queue.shift()) {
    if (visited.has(ref)) {
      continue;
    }
    visited.add(ref);
    const discriminator = state.owners.has(ref) ? state.objects[ref] : undefined;
    const name = discriminator?.propertyName;
    if (discriminator && name !== undefined && name !== own && !found.has(name)) {
      found.set(name, { discriminator, ownerRef: ref });
    }
    queue.push(...allOfRefs(state, ref));
  }
  return [...found.values()];
}

/**
 * The child redefines this property, so its `allOf` items omit it: a parent may have a value of
 * its own, as `Content` has when `Element`'s mapping names it.
 */
function recordOtherProperty(state: ScanState, ref: string, propertyName: string): void {
  const names = state.otherProperties[ref] ?? [];
  if (!names.includes(propertyName)) {
    names.push(propertyName);
  }
  state.otherProperties[ref] = names;
}

/**
 * The child at `ref` of the schema at `parentRef` gets a value of each other property: a mapped
 * one at once, else its schema name after both passes, where no mapping gives one. The schema's
 * own discriminator property is still added, so these patches do not mark it handled.
 */
export function inheritOtherOwners(state: ScanState, parentRef: string, ref: string): void {
  const childProperty = state.objects[ref]?.propertyName;
  for (const { discriminator, ownerRef } of otherOwners(state, parentRef)) {
    if (discriminator.propertyName === childProperty) {
      continue;
    }
    recordOtherProperty(state, ref, discriminator.propertyName);
    const mapped = Object.entries(discriminator.mapping ?? {})
      .filter(([, target]) => target === ref)
      .map(([value]) => value);
    const name = ref.slice(ref.lastIndexOf("/") + 1);
    const patch: EnumPatch = { ref, values: mapped, discriminator, discriminatorRef: ownerRef };
    if (mapped.length > 0) {
      patchDiscriminatorEnum(state, patch);
    } else {
      state.otherInferredPatches.push({ ...patch, values: [name] });
    }
  }
}

/** The deferred schema-name values of other properties; see `inheritOtherOwners`. */
export function applyOtherInferredPatches(state: ScanState, mapped: ReadonlySet<string>): void {
  for (const patch of state.otherInferredPatches) {
    if (!mapped.has(enumKey(patch))) {
      patchDiscriminatorEnum(state, patch);
    }
  }
}
