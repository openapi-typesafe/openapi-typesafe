/**
 * Where the generator's walk of the document meets the owners of enum names, which orders the
 * owners that ask for one name (`inNamingOrder`). The walk visits every location once, in the
 * order of the document, whatever `$ref`s point into it; a `$ref` that types a schema elsewhere
 * (`SchemaRequest.isThroughRef`) is no place in the walk, so it changes no rank.
 */

/** One request's place: the location the walk types it at, and its position in a tuple there. */
export interface ClaimPlace {
  /** The walked location (`EnumDeclarationRequest.walkedAt`); undefined for a `$ref`'s request. */
  readonly walkedAt?: string | undefined;
  /** A tuple element's position in its tuple (`EnumDeclarationRequest.tupleIndex`). */
  readonly position?: number | undefined;
}

/** The rank of a place: when the walk first met its location, then the position there. */
export type WalkRank = readonly [location: number, position: number];

/** A schema that is no tuple element ranks before the elements of a tuple at its location. */
const NO_POSITION = -1;

/** Whether `left` comes before `right` in the walk; an unranked owner comes after every other. */
export function compareRanks(left: WalkRank | undefined, right: WalkRank | undefined): number {
  if (left === undefined || right === undefined) {
    return Number(left === undefined) - Number(right === undefined);
  }
  return left[0] - right[0] || left[1] - right[1];
}

/** The earlier of two ranks of one owner: elements of the same values share one owner. */
export function earlierRank(
  known: WalkRank | undefined,
  asked: WalkRank | undefined,
): WalkRank | undefined {
  return compareRanks(asked, known) < 0 ? asked : known;
}

/** The ranks of the walked locations of one run, in the order the walk first met them. */
export class WalkRanks {
  private readonly locations = new Map<string, number>();

  /** The rank of a place; undefined for a request the walk did not make. */
  rankOf(place: ClaimPlace): WalkRank | undefined {
    if (place.walkedAt === undefined) {
      return undefined;
    }
    const location = this.locations.get(place.walkedAt) ?? this.locations.size;
    this.locations.set(place.walkedAt, location);
    return [location, place.position ?? NO_POSITION];
  }
}
