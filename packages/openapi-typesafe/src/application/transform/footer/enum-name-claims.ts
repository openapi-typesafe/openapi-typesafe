import { freeNumberedName } from "../numbered-names.js";
import type { EnumGrouping } from "./enum-groups.js";
import { type EnumNameClaim, finalEnumNames } from "./final-enum-names.js";
import { type ClaimPlace, earlierRank, type WalkRank, WalkRanks } from "./walk-ranks.js";

/** A claim with the owner that made it. */
interface OwnedClaim extends EnumNameClaim {
  readonly owner: string;
}

/** The claims with the claims of the owners of each enum (`EnumGrouping`) folded into one. */
interface FoldedClaims {
  readonly claims: readonly EnumNameClaim[];
  /** The name each folded claim was given, to the name its enum's claim was given. */
  readonly aliases: ReadonlyMap<string, string>;
}

/** The claims of each enum, in the order they were made. */
function claimsByEnum(
  claims: ReadonlyMap<string, OwnedClaim>,
  grouping: EnumGrouping,
): Map<string, OwnedClaim[]> {
  const byEnum = new Map<string, OwnedClaim[]>();
  for (const claim of claims.values()) {
    const group = grouping.enumOf.get(claim.owner) ?? claim.owner;
    const list = byEnum.get(group);
    if (list === undefined) {
      byEnum.set(group, [claim]);
    } else {
      list.push(claim);
    }
  }
  return byEnum;
}

/**
 * The earliest place of the claims that asked for `name`: a claim of another name (another schema
 * that shares the enum, `--dedupe-enums`) has its place among the owners of that name.
 */
function rankAsking(claims: readonly OwnedClaim[], name: string): WalkRank | undefined {
  return claims
    .filter((claim) => claim.name === name)
    .reduce<WalkRank | undefined>((rank, claim) => earlierRank(rank, claim.rank), undefined);
}

/**
 * Folds the claims of the owners of each enum into one: the name the enum asks for, ranked where
 * the walk first met a claim of that name, so the order of the owners changes no name.
 */
function foldedClaims(
  claims: ReadonlyMap<string, OwnedClaim>,
  grouping: EnumGrouping,
): FoldedClaims {
  const folded: EnumNameClaim[] = [];
  const aliases = new Map<string, string>();
  for (const [group, [first, ...later]] of claimsByEnum(claims, grouping)) {
    if (first === undefined) {
      continue;
    }
    const name = grouping.names.get(group) ?? first.name;
    folded.push({ ...first, name, rank: rankAsking([first, ...later], name) });
    for (const claim of later) {
      aliases.set(claim.given, first.given);
    }
  }
  return { claims: folded, aliases };
}

/**
 * The names of the `--enum` declarations of one run, unique across the enums and apart from the
 * names the rest of the output may need.
 *
 * Every enum has an owner: the schema location it is named after, or with `--dedupe-enums` its
 * members (a tuple element: its location and values). Two owners whose names come out the same
 * (`status` and `Status`, or two `prefixItems` elements of other values) merged into one enum
 * before, so each accepted the values of the other (upstream behavior). Now the first owner keeps
 * the name and each later one gets the next free `Name_2`, `Name_3`, …; requests of one owner (a
 * property and an inline `allOf` item of one schema) still share one enum. "First" is the order
 * of the document (`WalkRanks`): the elements of a tuple are numbered together, by their position
 * in it, and a `$ref` the generator meets earlier does not change any name.
 *
 * A number never takes a name a location asks for: the name a component schema gives its own
 * enum (`Pair_2` for `#/components/schemas/Pair_2`), or a property's (`HolderSort_2` for
 * `Holder.sort_2`), even where that location comes later. Which names the locations ask for is
 * only known at the end of the run, as is which names the output needs: a global type the output
 * refers to (the `Blob` of `--binary-as-blob`, the `Record` of `Record<string, never>`), a helper
 * type, or `ApiPaths`. So the run gives each owner a name as it asks (`nameFor`), and
 * `finalNames` renames them once every request is known (`finalEnumNames`), which leaves output
 * that compiled before with its names (ADR-021).
 */
export class EnumNameClaims {
  private readonly mayBeNeeded: ReadonlySet<string>;
  private readonly componentNames: ReadonlySet<string>;
  /** The first owner of each name an enum asked for. */
  private readonly owners = new Map<string, string>();
  /** The claim of each owner, by name asked for and owner. */
  private readonly claims = new Map<string, OwnedClaim>();
  /** Every name given, and every name the output may need. */
  private readonly taken: Set<string>;
  /** Every name a number skips: the names taken, and the names of the component enums. */
  private readonly unavailable: Set<string>;
  private readonly ranks = new WalkRanks();

  /**
   * `mayBeNeeded`: the names an enum avoids until the end of the run; `componentNames`: the enum
   * names of the component schemas (`componentEnumNames`). Both are empty outside a run.
   */
  constructor(
    mayBeNeeded: ReadonlySet<string> = new Set(),
    componentNames: ReadonlySet<string> = new Set(),
  ) {
    this.mayBeNeeded = mayBeNeeded;
    this.componentNames = componentNames;
    this.taken = new Set(mayBeNeeded);
    this.unavailable = new Set([...mayBeNeeded, ...componentNames]);
  }

  /**
   * The declaration name of the enum `owner` asks to name `name`; the same for every request.
   * `place`: where the walk of the document met the request, if it did.
   */
  nameFor(name: string, owner: string, place: ClaimPlace = {}): string {
    const key = JSON.stringify([name, owner]);
    const rank = this.ranks.rankOf(place);
    const known = this.claims.get(key);
    if (known !== undefined) {
      this.claims.set(key, { ...known, rank: earlierRank(known.rank, rank) });
      return known.given;
    }
    const isFirstOwner = (this.owners.get(name) ?? owner) === owner;
    this.owners.set(name, this.owners.get(name) ?? owner);
    const isFree = isFirstOwner && !this.taken.has(name);
    const given = isFree ? name : freeNumberedName(name, this.unavailable);
    this.taken.add(given);
    this.unavailable.add(given);
    this.claims.set(key, { name, given, order: this.claims.size, rank, owner });
    return given;
  }

  /**
   * The enums to rename at the end, from the name the run gave to the final one
   * (`finalEnumNames`); `needed` holds the names the finished output declares or refers to.
   * `grouping`: the enum of each owner (`enumGrouping`); the owners of one enum get one name, and
   * their declarations merge. Without it, every owner is an enum of its own.
   */
  finalNames(
    needed: ReadonlySet<string>,
    grouping: EnumGrouping = { enumOf: new Map(), names: new Map() },
  ): ReadonlyMap<string, string> {
    const { claims, aliases } = foldedClaims(this.claims, grouping);
    const finals = finalEnumNames({
      claims,
      mayBeNeeded: this.mayBeNeeded,
      componentNames: this.componentNames,
      needed,
    });
    for (const [given, target] of aliases) {
      finals.set(given, finals.get(target) ?? target);
    }
    return new Map([...finals].filter(([given, final]) => given !== final));
  }
}
