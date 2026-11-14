import { freeNumberedName } from "../numbered-names.js";
import { type EnumNameClaim, inNamingOrder, lowestPosition } from "./final-enum-names.js";

/** The name the run gives an `--enum-values` array, and whether the array is declared now. */
export interface EnumValuesName {
  readonly name: string;
  readonly isNew: boolean;
}

/**
 * The names of the `--enum-values` arrays of one run. Arrays of one name (`Discount/type` and
 * `discount/type`, the elements of one tuple, typed at the tuple's location) are numbered:
 * `discountTypeValues`, `discountTypeValues_2`, … A redeclared `const` does not compile, so each
 * array needs its own name. The run gives names as the arrays come (`nameFor`); `finalNames`
 * numbers the elements of a tuple by their position, as `--enum` does (`finalEnumNames`), so a
 * `$ref` to a later element met first does not take the tuple's name from the first element.
 * Every unnumbered name ends with `Values`, so a number never takes a name another array asks for.
 */
export class EnumValuesNames {
  /** The claim of each array, by its name, type and values. */
  private readonly claims = new Map<string, EnumNameClaim>();
  private readonly given = new Set<string>();

  /**
   * The name of the array `key` asks to name `name`; the same for every request of the array.
   * `position`: a tuple element's position in its tuple.
   */
  nameFor(key: string, name: string, position: number | undefined): EnumValuesName {
    const known = this.claims.get(key);
    if (known !== undefined) {
      this.claims.set(key, { ...known, position: lowestPosition(known.position, position) });
      return { name: known.given, isNew: false };
    }
    const given = this.given.has(name) ? freeNumberedName(name, this.given) : name;
    this.given.add(given);
    this.claims.set(key, { name, given, order: this.claims.size, position });
    return { name: given, isNew: true };
  }

  /** The arrays to rename at the end, from the name the run gave to the final one. */
  finalNames(): ReadonlyMap<string, string> {
    const byName = new Map<string, EnumNameClaim[]>();
    for (const claim of this.claims.values()) {
      byName.set(claim.name, [...(byName.get(claim.name) ?? []), claim]);
    }
    const finals = new Map<string, string>();
    for (const [name, claims] of byName) {
      const taken = new Set<string>();
      for (const claim of inNamingOrder(claims)) {
        const final = taken.has(name) ? freeNumberedName(name, taken) : name;
        taken.add(final);
        finals.set(claim.given, final);
      }
    }
    return new Map([...finals].filter(([given, final]) => given !== final));
  }
}
