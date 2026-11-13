import { freeNumberedName } from "../numbered-names.js";
import { type EnumNameClaim, finalEnumNames } from "./final-enum-names.js";

/** An owner's lowest tuple position: elements of the same values share one owner. */
function lowestPosition(known: number | undefined, asked: number | undefined): number | undefined {
  const positions = [known, asked].filter((position) => position !== undefined);
  return positions.length === 0 ? undefined : Math.min(...positions);
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
 * property and an inline `allOf` item of one schema) still share one enum. The elements of a
 * tuple are numbered by their position in it.
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
  private readonly claims = new Map<string, EnumNameClaim>();
  /** Every name given, and every name the output may need. */
  private readonly taken: Set<string>;
  /** Every name a number skips: the names taken, and the names of the component enums. */
  private readonly unavailable: Set<string>;

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
   * `position`: a tuple element's position in its tuple.
   */
  nameFor(name: string, owner: string, position?: number): string {
    const key = JSON.stringify([name, owner]);
    const known = this.claims.get(key);
    if (known !== undefined) {
      this.claims.set(key, { ...known, position: lowestPosition(known.position, position) });
      return known.given;
    }
    const isFirstOwner = (this.owners.get(name) ?? owner) === owner;
    this.owners.set(name, this.owners.get(name) ?? owner);
    const isFree = isFirstOwner && !this.taken.has(name);
    const given = isFree ? name : freeNumberedName(name, this.unavailable);
    this.taken.add(given);
    this.unavailable.add(given);
    this.claims.set(key, { name, given, order: this.claims.size, position });
    return given;
  }

  /**
   * The enums to rename at the end, from the name the run gave to the final one
   * (`finalEnumNames`); `needed` holds the names the finished output declares or refers to.
   */
  finalNames(needed: ReadonlySet<string>): ReadonlyMap<string, string> {
    const finals = finalEnumNames({
      claims: [...this.claims.values()],
      mayBeNeeded: this.mayBeNeeded,
      componentNames: this.componentNames,
      needed,
    });
    return new Map([...finals].filter(([given, final]) => given !== final));
  }
}
