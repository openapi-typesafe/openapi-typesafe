import { freeNumberedName } from "../numbered-names.js";

/**
 * The names of the `--enum` declarations of one run, unique across the enums and apart from the
 * names the rest of the output may need.
 *
 * Every enum has an owner: the schema location it is named after, or with `--dedupe-enums` its
 * members. Two owners whose names come out the same (`status` and `Status`) merged into one enum
 * before, so each accepted the values of the other (upstream behavior). Now the first owner keeps
 * the name and each later one gets the next free `Name_2`, `Name_3`, …; requests of one owner (a
 * property and an inline `allOf` item of one schema) still share one enum.
 *
 * An enum also gives way to a name the output may need, which is only known at the end: a global
 * type the output refers to (the `Blob` of `--binary-as-blob`, the `Record` of
 * `Record<string, never>`), a helper type, or `ApiPaths`. Until then it takes the numbered name;
 * `givenBack` lists the ones whose own name the output turned out not to need, so output that
 * compiled before keeps its names (ADR-021).
 */
export class EnumNameClaims {
  private readonly mayBeNeeded: ReadonlySet<string>;
  /** The first owner of each name an enum asked for. */
  private readonly owners = new Map<string, string>();
  /** The name given to each owner, by name asked for and owner. */
  private readonly given = new Map<string, string>();
  /** Every name given, and every name the output may need. */
  private readonly taken: Set<string>;
  /** A numbered name given only because the output may need the name asked for: that name. */
  private readonly standIns = new Map<string, string>();

  /** `mayBeNeeded`: the names an enum avoids until the end of the run; empty outside a run. */
  constructor(mayBeNeeded: ReadonlySet<string> = new Set()) {
    this.mayBeNeeded = mayBeNeeded;
    this.taken = new Set(mayBeNeeded);
  }

  /** The declaration name of the enum `owner` asks to name `name`; the same for every request. */
  nameFor(name: string, owner: string): string {
    const key = JSON.stringify([name, owner]);
    const known = this.given.get(key);
    if (known !== undefined) {
      return known;
    }
    const isFirstOwner = (this.owners.get(name) ?? owner) === owner;
    this.owners.set(name, this.owners.get(name) ?? owner);
    const isFree = isFirstOwner && !this.taken.has(name);
    const declared = isFree ? name : freeNumberedName(name, this.taken);
    if (isFirstOwner && this.mayBeNeeded.has(name)) {
      this.standIns.set(declared, name);
    }
    this.taken.add(declared);
    this.given.set(key, declared);
    return declared;
  }

  /**
   * The numbered names to rename back to the name asked for, because `needed` (the names the
   * finished output declares or refers to) does not hold that name.
   */
  givenBack(needed: ReadonlySet<string>): ReadonlyMap<string, string> {
    return new Map([...this.standIns].filter(([, name]) => !needed.has(name)));
  }
}
