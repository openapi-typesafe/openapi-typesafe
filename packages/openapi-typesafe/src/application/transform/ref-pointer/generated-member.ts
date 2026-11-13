import type { IndexSignatureMember } from "./index-signature-member.js";
import type { JsonObject } from "./located-node.js";
import type { VariantsForm } from "./variants-form.js";

/**
 * What the generated type of a schema has under a key (`generatedMember`), and how the members of
 * the parts of an intersection or a union join.
 */

export type GeneratedMember =
  | {
      readonly kind: "property";
      readonly node: unknown;
      readonly location: string | undefined;
      readonly isOptional: boolean;
      /** `$Read<T>` or `$Write<T>` (`isMarkedProperty`): no member but the marker's own. */
      readonly isMarked: boolean;
    }
  | IndexSignatureMember
  /**
   * `$defs`, a map of names. The original indexes it through `NonNullable` (`indexKeyword`), so it
   * is present, and each definition is a member of it.
   */
  | { readonly kind: "names"; readonly names: JsonObject; readonly location: string | undefined }
  /**
   * The index signature of `Record<string, never>` (`type: object` without object keywords):
   * every key is `never`, which compiles, as does every key after it.
   */
  | { readonly kind: "never" }
  | { readonly kind: "missing" }
  | { readonly kind: "opaque" };

export const MISSING: GeneratedMember = { kind: "missing" };
export const OPAQUE: GeneratedMember = { kind: "opaque" };
export const NEVER_VALUES: GeneratedMember = { kind: "never" };

export function isMissing(member: GeneratedMember): boolean {
  return member.kind === "missing";
}

function isUnknownIndex(member: GeneratedMember): boolean {
  return member.kind === "index" && member.node === undefined;
}

function isOptionalProperty(member: GeneratedMember): boolean {
  return member.kind === "property" && member.isOptional;
}

function isDeclared(member: GeneratedMember): boolean {
  return member.kind === "property" || member.kind === "names";
}

function isIndexSignature(member: GeneratedMember): boolean {
  return member.kind === "index" || member.kind === "never";
}

/**
 * A key of an intersection: missing if every part misses it; the part's member if only one part
 * has it (`A & B` where `B` has no such key and no index signature). Where several parts have it
 * as optional properties, `(A | undefined) & (B | undefined)` may still be `undefined`, so it is
 * optional; else opaque. A part's `[key: string]: unknown` adds nothing (`unknown & T` is `T`),
 * and only such parts give `unknown`. Where a part declares the key, TypeScript reads the
 * declared members alone: the index signatures of the other parts take no part in it.
 */
export function intersectionMember(members: readonly GeneratedMember[]): GeneratedMember {
  const found = members.filter((member) => !isMissing(member));
  const isKeyDeclared = found.some(isDeclared);
  const typed = found.filter(
    (member) => !isUnknownIndex(member) && !(isKeyDeclared && isIndexSignature(member)),
  );
  const [only] = typed;
  if (only === undefined) {
    return found[0] ?? MISSING;
  }
  if (typed.length === 1) {
    return only.kind === "opaque" ? OPAQUE : only;
  }
  return typed.every(isOptionalProperty) && only.kind === "property"
    ? { ...only, isOptional: true }
    : OPAQUE;
}

/**
 * A key of `WithRequired<Base, "a"> | WithRequired<Base, "b">` (`anyof-oneof-required`): the
 * base's member in every variant, required where every variant requires the key, as `-?` drops
 * `undefined`.
 */
function requiredVariantsMember(
  base: GeneratedMember,
  key: string,
  keyLists: readonly (readonly string[])[],
): GeneratedMember {
  const isRequiredByAll = keyLists.every((keys) => keys.includes(key));
  return base.kind === "property" && isRequiredByAll ? { ...base, isOptional: false } : base;
}

/**
 * A key of `Base & (A | B)`, which TypeScript reads as `(Base & A) | (Base & B)`: the base's
 * member when no variant has the key; an optional property when one of the joined members is one,
 * as the union may then be `undefined`; else opaque. A key of `Base | A | B` is missing if one of
 * them misses it. The `WithRequired` variants read the base (`requiredVariantsMember`).
 */
export function variantsMember(
  base: GeneratedMember,
  variants: readonly GeneratedMember[],
  form: VariantsForm,
  key: string,
): GeneratedMember {
  if (form.kind === "required") {
    return requiredVariantsMember(base, key, form.keyLists);
  }
  if (form.kind === "intersection") {
    const joined = variants.map((variant) => intersectionMember([base, variant]));
    if (joined.every((member) => member === base)) {
      return base;
    }
    return joined.find(isOptionalProperty) ?? OPAQUE;
  }
  return form.kind === "union" && [base, ...variants].some(isMissing) ? MISSING : OPAQUE;
}
