import { freeNumberedName } from "../numbered-names.js";
import { compareRanks, type WalkRank } from "./walk-ranks.js";

/**
 * The final names of the `--enum` declarations of a document, known once every location has asked
 * for its name (`EnumNameClaims.finalNames`), so they do not depend on the order the generator
 * meets the locations in.
 */

/** One owner's request for an enum name, as `EnumNameClaims` recorded it. */
export interface EnumNameClaim {
  /** The name the owner asked for. */
  readonly name: string;
  /** The name the run gave it, which the output refers to until the end. */
  readonly given: string;
  /** When the owner first asked. */
  readonly order: number;
  /** Where the walk of the document first met the owner; undefined where only `$ref`s typed it. */
  readonly rank: WalkRank | undefined;
}

export interface FinalNamesInput {
  readonly claims: readonly EnumNameClaim[];
  /** Names an enum avoids until the end, and gets back where the output does not need them. */
  readonly mayBeNeeded: ReadonlySet<string>;
  /** The names that component schemas give their enums (`componentEnumNames`). */
  readonly componentNames: ReadonlySet<string>;
  /** The names the finished output declares or refers to, besides its enums. */
  readonly needed: ReadonlySet<string>;
}

/**
 * The claims of one name in the order they get names: where the walk of the document first met
 * each owner (`WalkRanks`), so the first owner in the document keeps the name. The elements of
 * a tuple share the tuple's location and rank by position, so a tuple's elements are numbered
 * together and in order, and a `$ref` to a later element met first changes no name. An owner
 * that only `$ref`s typed (a location the walk does not visit) comes last. `claims` come in the
 * order they asked, which the stable sort keeps among owners of one rank.
 */
export function inNamingOrder(claims: readonly EnumNameClaim[]): EnumNameClaim[] {
  return [...claims].sort((left, right) => compareRanks(left.rank, right.rank));
}

function claimsByName(claims: readonly EnumNameClaim[]): Map<string, EnumNameClaim[]> {
  const byName = new Map<string, EnumNameClaim[]>();
  for (const claim of [...claims].sort((left, right) => left.order - right.order)) {
    byName.set(claim.name, [...(byName.get(claim.name) ?? []), claim]);
  }
  return byName;
}

/**
 * The final name of each claim, by the name the run gave it. The first claim of a name keeps it;
 * a name the output may need goes to a number first, as during the run, and comes back where the
 * finished output does not need it. Every later claim gets the next free number, which skips
 * every name an owner asked for, the component enum names and the names the output may need:
 * a number never takes the name of a location that asks for it later.
 */
export function finalEnumNames(input: FinalNamesInput): Map<string, string> {
  const byName = claimsByName(input.claims);
  const unavailable = new Set([...input.mayBeNeeded, ...input.componentNames, ...byName.keys()]);
  const finals = new Map<string, string>();
  const numbered = (name: string): string => {
    const free = freeNumberedName(name, unavailable);
    unavailable.add(free);
    return free;
  };
  for (const [name, claims] of byName) {
    const [first, ...later] = inNamingOrder(claims);
    if (first !== undefined) {
      const standIn = input.mayBeNeeded.has(name) ? numbered(name) : name;
      finals.set(first.given, input.needed.has(name) ? standIn : name);
    }
    for (const claim of later) {
      finals.set(claim.given, numbered(name));
    }
  }
  return finals;
}
