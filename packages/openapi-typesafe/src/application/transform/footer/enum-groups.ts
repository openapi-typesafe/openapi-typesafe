import { dedupeKey, wholeMembers } from "./enum-dedupe-key.js";
import type { EnumOwners, OwnedRequest } from "./enum-owners.js";
import type { SharedEnum, SharedEnumNames } from "./shared-enum-names.js";

/**
 * The enums of a run, known at its end: which owners share one enum, and the name each enum asks
 * for (`EnumNameClaims.finalNames` folds the claims of an enum's owners into one).
 */
export interface EnumGrouping {
  /** The enum of each owner a request got during the run. */
  readonly enumOf: ReadonlyMap<string, string>;
  /** The name each enum asks for, by enum; an enum left out asks for its first claim's name. */
  readonly names: ReadonlyMap<string, string>;
}

/** Appends `item` to the list of `key`, so a large group is built in linear time. */
function appendTo<T>(lists: Map<string, T[]>, key: string, item: T): void {
  const list = lists.get(key);
  if (list === undefined) {
    lists.set(key, [item]);
  } else {
    list.push(item);
  }
}

/** The requests of each final owner (`EnumOwners.mergedOwners`), in the order they asked. */
function requestsByOwner(
  owners: EnumOwners,
  merged: ReadonlyMap<string, string>,
): Map<string, OwnedRequest[]> {
  const byOwner = new Map<string, OwnedRequest[]>();
  for (const owned of owners.requests()) {
    appendTo(byOwner, merged.get(owned.owner) ?? owned.owner, owned);
  }
  return byOwner;
}

/** The enum of each owner a request got, from the groups of requests of each enum. */
function enumsOfOwners(groups: ReadonlyMap<string, readonly OwnedRequest[]>): Map<string, string> {
  const enumOf = new Map<string, string>();
  for (const [group, requests] of groups) {
    for (const { owner } of requests) {
      enumOf.set(owner, group);
    }
  }
  return enumOf;
}

/** The owners of the same whole members as one enum each, by dedupe key, in asking order. */
function sharedEnums(
  owners: EnumOwners,
  merged: ReadonlyMap<string, string>,
  byOwner: ReadonlyMap<string, readonly OwnedRequest[]>,
): Map<string, OwnedRequest[]> {
  const keyOfOwner = new Map<string, string>();
  for (const [owner, requests] of byOwner) {
    keyOfOwner.set(owner, dedupeKey(wholeMembers(requests.map(({ request }) => request))));
  }
  const byKey = new Map<string, OwnedRequest[]>();
  for (const owned of owners.requests()) {
    const key = keyOfOwner.get(merged.get(owned.owner) ?? owned.owner);
    if (key !== undefined) {
      appendTo(byKey, key, owned);
    }
  }
  return byKey;
}

/**
 * The enums of a run. Every owner has one enum (`EnumOwners`); with `--dedupe-enums` (`sharing`)
 * owners whose whole members are the same share one, named by `sharing`. The members are those of
 * every request of the owner, so `--dedupe-enums` never shares one request of an owner with
 * another schema: the owner's enum would split in two, and the intersection of its requests (a
 * property and an inline `allOf` item) would be `never`.
 */
export function enumGrouping(owners: EnumOwners, sharing: SharedEnumNames | null): EnumGrouping {
  const merged = owners.mergedOwners();
  const byOwner = requestsByOwner(owners, merged);
  if (sharing === null) {
    const names = new Map<string, string>();
    for (const [owner, [first]] of byOwner) {
      names.set(owner, first?.ownName ?? owner);
    }
    return { enumOf: enumsOfOwners(byOwner), names };
  }
  const byKey = sharedEnums(owners, merged, byOwner);
  const enums: SharedEnum[] = [...byKey].map(([key, requests]) => ({ key, requests }));
  return { enumOf: enumsOfOwners(byKey), names: sharing.namesOf(enums) };
}
