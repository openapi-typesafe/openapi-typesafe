import type { EnumDeclarationRequest } from "../schema/schema-context.js";

/** The values of a request as JSON texts, so `"1"` and `1` stay apart. */
function valueKeys(request: EnumDeclarationRequest): Set<string> {
  return new Set(request.values.map((value) => JSON.stringify(value)));
}

/** Orders the distinct keys of a set: no two are equal. */
function compareKeys(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function haveSameKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((key) => right.has(key));
}

/** A shared-location owner: the location it is named after, and its values. */
interface SharedOwner {
  readonly location: string;
  readonly values: ReadonlySet<string>;
}

/**
 * The owners of the `--enum` enums of a run: requests of one owner share one enum.
 *
 * The owner of an enum is its schema location. A property and an inline `allOf` item of one
 * schema share it and one enum (two enums would make their intersection `never`). The elements
 * and items of an array and the record values of an object are typed at their holder's location
 * too, and so is everything in them (the `kind` of each element of `Shape` at `Shape/kind`), but
 * under one name TypeScript merges their declarations, so each would admit the values of the
 * others: an enum at a shared location owns its name with its set of values, and enums of the
 * same values at a shared location share one enum.
 *
 * Such an enum also shares the enum of the location's own schema when that enum has exactly its
 * values. The own values are complete only at the end of the run (an inline `allOf` item may be
 * typed after the record values), so the run keeps the two owners apart and `mergedOwners` joins
 * them at the end: no order of typing decides which enums are one.
 */
export class EnumOwners {
  /** The values the requests at a location of its own asked for, by location. */
  private readonly ownValues = new Map<string, Set<string>>();
  private readonly sharedOwners = new Map<string, SharedOwner>();

  /** The owner of a request whose enum the run declares; it records the request's values. */
  ownerOf(request: EnumDeclarationRequest): string {
    const values = valueKeys(request);
    if (request.isAtSharedLocation !== true) {
      const own = this.ownValues.get(request.name) ?? new Set();
      this.ownValues.set(request.name, new Set([...own, ...values]));
      return request.name;
    }
    const owner = JSON.stringify([request.name, [...values].sort(compareKeys)]);
    this.sharedOwners.set(owner, { location: request.name, values });
    return owner;
  }

  /**
   * The owner each shared-location owner joins at the end: its location, where the location's
   * own enum has exactly its values. Known only once every request asked.
   */
  mergedOwners(): ReadonlyMap<string, string> {
    const merged = new Map<string, string>();
    for (const [owner, { location, values }] of this.sharedOwners) {
      const own = this.ownValues.get(location);
      if (own !== undefined && haveSameKeys(own, values)) {
        merged.set(owner, location);
      }
    }
    return merged;
  }
}
