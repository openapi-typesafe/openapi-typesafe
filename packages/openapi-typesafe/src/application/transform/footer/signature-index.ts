import type { IrIndexSignature, IrMember, IrType } from "../../../domain/ir/nodes.js";
import { isAssignableToTemplate, type TemplateShape } from "../document/template-key-match.js";
import { propertyKey } from "./evaluation.js";

/**
 * Which members of an object type `T[K]` reads, as TypeScript picks them
 * (`getPropertyTypeForIndexType`, `findApplicableIndexInfo`): a literal key reads its property;
 * otherwise every index signature whose key type admits `K`, intersected, and a `string`
 * signature only where no other one applies. A templated path of `--path-params-as-types` is such
 * a signature (`` [path: `/pets/${number}`] ``), so `paths["/pets/{name}"]` reads only the
 * signatures that match the URL, not the first one of `paths`.
 */

/** The key types of the raw key texts the generator writes (`` `/pets/${number}` ``), by text. */
export type RawKeyTypes = ReadonlyMap<string, readonly TemplateShape[]>;

/** What a key reads: the types of the members it reads, or why it reads none. */
export type MemberRead =
  | { readonly kind: "types"; readonly types: readonly IrType[] }
  | { readonly kind: "missing" }
  | { readonly kind: "opaque" };

const MISSING_READ: MemberRead = { kind: "missing" };
const OPAQUE_READ: MemberRead = { kind: "opaque" };

type Applicability = "applies" | "not" | "unknown";

function isStringKeyword(type: IrType): boolean {
  return type.kind === "keyword" && type.keyword === "string";
}

/** Whether a signature that is not `[key: string]` applies to the key. */
function applicability(
  signature: IrIndexSignature,
  key: TemplateShape,
  keyTypes: RawKeyTypes,
): Applicability {
  const { parameterType } = signature;
  const targets = parameterType.kind === "raw" ? keyTypes.get(parameterType.text) : undefined;
  if (targets === undefined) {
    // A key type the generator does not write for a templated path (a callback's raw type) is
    // not modeled.
    return "unknown";
  }
  return targets.some((target) => isAssignableToTemplate(key, target)) ? "applies" : "not";
}

/** The signatures a key that names no property reads. */
function signatureRead(
  members: readonly IrMember[],
  key: TemplateShape,
  keyTypes: RawKeyTypes,
): MemberRead {
  const signatures = members.filter(
    (member): member is IrIndexSignature => member.kind === "indexSignature",
  );
  const others = signatures.filter((signature) => !isStringKeyword(signature.parameterType));
  const found = others.map((signature) => applicability(signature, key, keyTypes));
  if (found.includes("unknown")) {
    return OPAQUE_READ;
  }
  const applicable = others.filter((_, at) => found[at] === "applies");
  const string = signatures.find((signature) => isStringKeyword(signature.parameterType));
  const read = applicable.length > 0 || string === undefined ? applicable : [string];
  return read.length > 0 ? { kind: "types", types: read.map(({ type }) => type) } : MISSING_READ;
}

/**
 * The members one key type reads. A key that names no member is missing, but for a key every
 * object has (`toString`), which is opaque.
 */
export function memberRead(
  members: readonly IrMember[],
  key: TemplateShape,
  keyTypes: RawKeyTypes,
): MemberRead {
  const [text] = key.texts;
  if (key.types.length > 0 || text === undefined) {
    return signatureRead(members, key, keyTypes);
  }
  const property = members.find(
    (member) => member.kind === "property" && propertyKey(member.name) === text,
  );
  if (property !== undefined) {
    return { kind: "types", types: [property.type] };
  }
  const read = signatureRead(members, key, keyTypes);
  return read.kind === "missing" && text in {} ? OPAQUE_READ : read;
}
