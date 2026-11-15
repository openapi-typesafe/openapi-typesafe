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

/**
 * The owners of the `--enum` enums of a run: requests of one owner share one enum.
 *
 * The owner of an enum is its schema location. A property and an inline `allOf` item of one
 * schema share it and one enum (two enums would make their intersection `never`). The elements
 * and items of an array and the record values of an object are typed at their holder's location
 * too, and so is everything in them (the `kind` of each element of `Shape` at `Shape/kind`), but
 * under one name TypeScript merges their declarations, so each would admit the values of the
 * others: an enum at a shared location owns its name with its set of values. It shares the enum
 * of the location's own schema when that enum has exactly its values, and enums of the same
 * values at a shared location share one enum.
 */
export class EnumOwners {
  /** The values the requests at a location of its own asked for so far, by location. */
  private readonly ownValues = new Map<string, Set<string>>();

  ownerOf(request: EnumDeclarationRequest): string {
    const values = valueKeys(request);
    const own = this.ownValues.get(request.name);
    if (request.isAtSharedLocation !== true) {
      this.ownValues.set(request.name, new Set([...(own ?? []), ...values]));
      return request.name;
    }
    // An object types its own properties before its record values, so the own enum is complete
    // when a record value's enum asks; an own enum met later keeps the location's name.
    if (own !== undefined && haveSameKeys(own, values)) {
      return request.name;
    }
    return JSON.stringify([request.name, [...values].sort(compareKeys)]);
  }
}
