import { freeNumberedName } from "../numbered-names.js";
import { EnumNaming } from "./enum-naming.js";
import type { OwnedRequest } from "./enum-owners.js";

/**
 * One enum that `--dedupe-enums` shares at the end of a run: the dedupe key of its members, and
 * the requests of every owner that shares it, in the order they asked.
 */
export interface SharedEnum {
  readonly key: string;
  readonly requests: readonly OwnedRequest[];
}

/** How `--dedupe-enums` names the enums it shares, once every request of the run is known. */
export interface SharedEnumNames {
  /** The name each enum asks for, by key; an enum left out asks for its first request's name. */
  namesOf(enums: readonly SharedEnum[]): ReadonlyMap<string, string>;
}

/** The name of the first request of an enum that `isCounted` counts, else of its first one. */
function firstNameOf(
  { requests }: SharedEnum,
  isCounted: (owned: OwnedRequest) => boolean,
): string | undefined {
  return (requests.find(isCounted) ?? requests[0])?.ownName;
}

function namesByKey(
  enums: readonly SharedEnum[],
  isCounted: (owned: OwnedRequest) => boolean,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const shared of enums) {
    const name = firstNameOf(shared, isCounted);
    if (name !== undefined) {
      names.set(shared.key, name);
    }
  }
  return names;
}

/**
 * The original: the enum takes the name of the first schema that declares it. A request that only
 * refers to an owner's enum (`isOwnerReference`) does not count: an `allOf` item that narrows an
 * inherited enum asks for its base's enum, and with `discriminator-values` a member's value asks
 * for the owner's, maybe before the first schema that declares the values is typed. Counted, it
 * would give the shared enum the base's or the owner's name; so each shared enum is named as the
 * document order does (`Kind`, not `PetMode`; `OtherKind`, not `PetPetType`), as upstream.
 */
export const FIRST_DECLARING_SCHEMA_NAMES: SharedEnumNames = {
  namesOf: (enums) => namesByKey(enums, ({ request }) => request.isOwnerReference !== true),
};

interface NameCandidate {
  readonly name: string;
  readonly isComponentSchema: boolean;
}

/**
 * Whether `candidate` names the enum better than `other`: a component schema that is the enum
 * itself, then the shorter name, then the earlier one in code-unit order. No part depends on the
 * document order, so adding or moving a schema changes the name only when the new one ranks first.
 */
function isBetterName(candidate: NameCandidate, other: NameCandidate): boolean {
  if (candidate.isComponentSchema !== other.isComponentSchema) {
    return candidate.isComponentSchema;
  }
  if (candidate.name.length !== other.name.length) {
    return candidate.name.length < other.name.length;
  }
  return candidate.name < other.name;
}

/** The candidates from best to worst. */
function ranked(candidates: readonly NameCandidate[]): NameCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.name === right.name && left.isComponentSchema === right.isComponentSchema) {
      return 0;
    }
    return isBetterName(left, right) ? -1 : 1;
  });
}

/**
 * The names an enum's schemas give it. Only a schema the walk of the document types names the
 * enum: a `$ref` that types its target elsewhere (`walkedAt` undefined), such as one into a
 * `$defs` entry of an enum schema, which the walk does not type, changes no name. Each name is
 * built with a fresh naming state: the run's state depends on the names built before
 * (`EnumNaming`).
 */
function candidatesOf({ requests }: SharedEnum): NameCandidate[] {
  return requests
    .filter(({ request }) => request.walkedAt !== undefined)
    .map(({ request }) => ({
      name: new EnumNaming().enumName(request.name),
      isComponentSchema: request.isComponentSchema,
    }));
}

/**
 * The `dedupe-enum-names` fix (ADR-021, upstream #1683): each enum takes the best name of all of
 * its schemas. Two enums whose best names are the same (two schemas that give one name) are
 * resolved in key order, which is the order of their values: the later one takes its next name
 * that is free, or else a number of its best name that no schema gives (`PetState_2`). Left to the
 * run, the number would follow the document order.
 */
export const BEST_SCHEMA_NAMES: SharedEnumNames = {
  namesOf(enums) {
    const candidatesByKey = new Map(enums.map((shared) => [shared.key, candidatesOf(shared)]));
    const chosen = new Map<string, string>();
    const unavailable = new Set([...candidatesByKey.values()].flat().map(({ name }) => name));
    const taken = new Set<string>();
    for (const key of [...candidatesByKey.keys()].sort()) {
      const names = ranked(candidatesByKey.get(key) ?? []).map(({ name }) => name);
      const best = names[0];
      const free = names.find((candidate) => !taken.has(candidate));
      const name = free ?? (best === undefined ? undefined : freeNumberedName(best, unavailable));
      if (name !== undefined) {
        chosen.set(key, name);
        taken.add(name);
        unavailable.add(name);
      }
    }
    const firsts = FIRST_DECLARING_SCHEMA_NAMES.namesOf(enums);
    return new Map([...firsts, ...chosen]);
  },
};
