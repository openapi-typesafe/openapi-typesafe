import { freeNumberedName } from "../numbered-names.js";

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
  /** For a tuple element: its lowest position in the tuple. */
  readonly position: number | undefined;
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

/** The order of a name's claims: the first gets the name, the later ones numbers. */
type ClaimRank = readonly [number, number, number];

/**
 * The claims of one name in the order they get names. An owner that is no tuple element ranks by
 * when it asked; the elements of a tuple rank together, where the first of them asked, and among
 * themselves by position, so a `$ref` to a later element met first does not take the tuple's
 * name from the first element.
 */
function inNamingOrder(claims: readonly EnumNameClaim[]): EnumNameClaim[] {
  const elementOrders = claims.flatMap((claim) =>
    claim.position === undefined ? [] : claim.order,
  );
  const tupleOrder = Math.min(...elementOrders);
  const rank = (claim: EnumNameClaim): ClaimRank =>
    claim.position === undefined
      ? [claim.order, 0, claim.order]
      : [tupleOrder, claim.position, claim.order];
  const compare = (left: ClaimRank, right: ClaimRank) =>
    left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  return [...claims].sort((left, right) => compare(rank(left), rank(right)));
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
