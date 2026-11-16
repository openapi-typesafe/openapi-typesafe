import type { EnumDeclarationRequest } from "../schema/schema-context.js";

/** A request the run declared an enum for: the owner it got, and the name it asked for. */
export interface OwnedRequest {
  readonly owner: string;
  readonly ownName: string;
  readonly request: EnumDeclarationRequest;
}

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

/** A group of shared-location requests: the location it is named after, and its values. */
interface SharedGroup {
  readonly location: string;
  readonly values: Set<string>;
}

/**
 * The owners of the `--enum` enums of a run: requests of one owner share one enum.
 *
 * The owner of an enum is its schema location. A property and an inline `allOf` item of one
 * schema share it and one enum: TypeScript intersects them, and two enums would make the
 * intersection `never`. The elements and items of an array and the record values of an object
 * are typed at their holder's location too, and so is everything in them (the `kind` of each
 * element of `Shape` at `Shape/kind`), but they are not intersected with each other, and under one
 * name TypeScript merges their declarations, so each would admit the values of the others. Such a
 * request has a slot (`SchemaRequest.sharedSlot`): the steps into it from the location's schema.
 *
 * Requests of one slot are intersected (the items of a property and of an inline `allOf` item:
 * `TList[] & TList[]`), so they share one owner whatever their values; requests of the same values
 * at a location share one owner as before, whatever their slot. The two rules join groups, so the
 * owner of a request is its group, known only at the end of the run (`mergedOwners`): during the
 * run a request gets its group as far as it is joined, and each enum it names is renamed at the
 * end. A group also shares the enum of the location's own schema when that enum has exactly the
 * group's values; no order of typing decides which enums are one.
 */
export class EnumOwners {
  /** The values the requests at a location of its own asked for, by location. */
  private readonly ownValues = new Map<string, Set<string>>();
  /** The node each group node was joined to; a group's first node is its root. */
  private readonly parents = new Map<string, string>();
  /** When each group node was added: the older root of two joined groups stays the root. */
  private readonly ages = new Map<string, number>();
  private readonly groups = new Map<string, SharedGroup>();
  private readonly owned: OwnedRequest[] = [];

  /**
   * The owner of a request whose enum the run declares, which asks for `ownName`; it records the
   * request (`requests`).
   */
  ownerOf(request: EnumDeclarationRequest, ownName: string): string {
    const owner = this.ownerOfValues(request);
    this.owned.push({ owner, ownName, request });
    return owner;
  }

  /** Every request `ownerOf` gave an owner, in the order they asked. */
  requests(): readonly OwnedRequest[] {
    return this.owned;
  }

  private ownerOfValues(request: EnumDeclarationRequest): string {
    const values = valueKeys(request);
    if (!request.sharedSlot) {
      const own = this.ownValues.get(request.name) ?? new Set();
      this.ownValues.set(request.name, new Set([...own, ...values]));
      return request.name;
    }
    // The values node first: a group that only one value set asked for keeps its key.
    const valuesNode = JSON.stringify([request.name, [...values].sort(compareKeys)]);
    const slotNode = JSON.stringify([request.name, request.sharedSlot]);
    const root = this.joined(
      this.rootOf(valuesNode, request.name),
      this.rootOf(slotNode, request.name),
    );
    for (const value of values) {
      this.groups.get(root)?.values.add(value);
    }
    return root;
  }

  /**
   * The owner each owner a request got joins at the end: its group's, or the location's own owner
   * where the location's own enum has exactly the group's values. Known only once every request
   * asked; an owner that stays itself is left out.
   */
  mergedOwners(): ReadonlyMap<string, string> {
    const merged = new Map<string, string>();
    for (const node of this.parents.keys()) {
      const root = this.find(node);
      const group = this.groups.get(root);
      const own = group === undefined ? undefined : this.ownValues.get(group.location);
      const final =
        group !== undefined && own !== undefined && haveSameKeys(own, group.values)
          ? group.location
          : root;
      if (final !== node) {
        merged.set(node, final);
      }
    }
    return merged;
  }

  /** The root of a node's group; a new node is a group of its own. */
  private rootOf(node: string, location: string): string {
    if (!this.parents.has(node)) {
      this.parents.set(node, node);
      this.ages.set(node, this.ages.size);
      this.groups.set(node, { location, values: new Set() });
    }
    return this.find(node);
  }

  private find(node: string): string {
    const parent = this.parents.get(node) ?? node;
    if (parent === node) {
      return node;
    }
    const root = this.find(parent);
    // Path compression keeps every later lookup of the node's group short.
    this.parents.set(node, root);
    return root;
  }

  /** Joins two groups into the older one, whose root asked for its name first. */
  private joined(left: string, right: string): string {
    if (left === right) {
      return left;
    }
    const isLeftOlder = (this.ages.get(left) ?? 0) < (this.ages.get(right) ?? 0);
    const [older, newer] = isLeftOlder ? [left, right] : [right, left];
    this.parents.set(newer, older);
    for (const value of this.groups.get(newer)?.values ?? []) {
      this.groups.get(older)?.values.add(value);
    }
    this.groups.delete(newer);
    return older;
  }
}
