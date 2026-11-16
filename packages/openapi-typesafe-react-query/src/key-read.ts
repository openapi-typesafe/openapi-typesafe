/**
 * How a query key reads the caller's values (ADR-046), one rule for bodies, parameters, headers
 * and the other init members alike: which members a value has, which values are left out, and
 * that no read throws while the component renders. The body and the parameter keys write what is
 * read each by their own rule, as their serializers send it.
 */

/** How a body or a parameter key writes one value it has read. */
export type Walk<K> = (value: unknown, ancestors: Ancestors) => K;

/** An object nested deeper than one walk reads, kept to be read in a walk of its own. */
interface Segment {
  readonly value: object;
  readonly walk: Walk<unknown>;
  /** How many walks this one is below the walk of the whole key: 1 for the first deeper one. */
  readonly level: number;
}

/** The segments of one key, and the index of each by its object, per walk that reads it. */
interface Deeper {
  readonly segments: Segment[];
  readonly indexes: Map<Walk<unknown>, Map<object, number>>;
}

/**
 * Where a walk is: the objects it is inside of, so that a reference back to one of them ends it,
 * the segments of the key it is part of, and the level of its own segment.
 */
export interface Ancestors {
  readonly path: readonly object[];
  readonly deeper: Deeper;
  readonly level: number;
}

/**
 * How many objects deep one walk reads. The walk is recursive, and a value nested deeper than the
 * JavaScript stack allows made it overflow at a depth that changed from call to call, so a key
 * held more or less of the same body, and two bodies that differed below it shared one key. An
 * object this deep is read in a walk of its own, which starts on a stack as short as the first,
 * so a walk needs a small part of the stack, whatever the depth of the value. It also keeps each
 * part of a key within the depth TanStack Query's hash can write.
 */
const WALK_DEPTH = 100;

/**
 * How many walks below the first a key reads, ten thousand objects deep. Below them a value is
 * its JSON text, which `JSON.stringify` writes without the stack for plain data, as a JSON body
 * sends it: a getter that makes a new object each time it is read would be read without end.
 */
const SEGMENT_LEVELS = 100;

/**
 * The name of the member that stands for an object read in a walk of its own, with its index in
 * the segments of the key, which the init holds in order under the same name. In band, as
 * `"toJSON()"` is; no request names a member like this.
 */
export const DEEPER_FORM = "(deeper)";

/** `[object Name]`: the type tag is between these indexes of `Object.prototype.toString`. */
const TYPE_TAG_START = "[object ".length;
const TYPE_TAG_END = -1;

/**
 * The collections whose contents are in none of their members, each with the name under which a
 * key holds what iterating it gives: JSON and the default serializers send `{}` or nothing for
 * any of them, while a serializer of the client that sends their contents can only read those.
 * Other iterables are not iterated: an iterator is used up by reading it, which would take the
 * values its request sends, and a class of the caller may iterate without end. The names are in
 * band, as `"toJSON()"` is; no request names a member like this.
 */
const COLLECTION_FORMS: readonly (readonly [className: string, form: string, type: Collection])[] =
  [
    ["Map", "entries()", Map],
    ["Set", "values()", Set],
  ];

/** The class of a collection, whose `has` throws for a value without its internal slots. */
interface Collection {
  readonly prototype: { has(this: unknown, item: unknown): boolean };
}

/**
 * What `read` gives, or undefined when it throws. A getter, a `toJSON`, a `toString`, a Proxy
 * trap of the caller's value, or a revoked Proxy, may throw, and a key is made while the
 * component renders, where a throw crashes the component. The key is then left without what it
 * could not read, and the request, which reads the value again, reports the error as a query
 * error.
 */
export function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Whether a value is of the class `name`: an instance of this realm's global class of that name
 * (React Native's classes have no type tag), or a value with its type tag (a class of another
 * realm or of the `undici` package), as the fetch client tells bodies (ADR-030).
 */
export function isClass(value: object, name: string): boolean {
  const type = (globalThis as Record<string, unknown>)[name];
  return (
    (typeof type === "function" && value instanceof type) ||
    Object.prototype.toString.call(value).slice(TYPE_TAG_START, TYPE_TAG_END) === name
  );
}

/** The own enumerable members of an object, a member whose getter throws as `undefined`. */
function ownMembers(value: object): (readonly [string, unknown])[] {
  return Object.keys(value).map(
    (name) => [name, attempt(() => (value as Record<string, unknown>)[name])] as const,
  );
}

/**
 * Whether a value has the internal slots of the collection `type`, as a Map or a Set of any
 * realm (an iframe, `vm`, a Jest environment) and of any subclass has, whatever its type tag:
 * `has` of this realm's class reads them, and throws for any other value.
 */
export function hasSlotsOf(value: object, type: Collection): boolean {
  return (
    attempt(() => {
      type.prototype.has.call(value, undefined);
      return true;
    }) ?? false
  );
}

/**
 * Whether a value that is a Map or a Set by its type tag only keeps its contents for a key, as a
 * MobX observable Map or Set does: it iterates them, and its own `toJSON` is what JSON sends for
 * it, never its own members, which are its state and change as it is read (MobX notes each
 * reader). Any other value with such a tag is read by its own members, as JSON sends it.
 */
function isObservableCollection(value: object): boolean {
  const { toJSON, [Symbol.iterator]: iterate } = value as {
    toJSON?: unknown;
    [Symbol.iterator]?: unknown;
  };
  return typeof toJSON === "function" && typeof iterate === "function";
}

/**
 * The members of an object as a key reads them, by name: the items of an array by index, also a
 * hole; the own enumerable members of any other object, which JSON and the fetch client's
 * serializers send; and the contents of a Map or a Set as one more member, as `COLLECTION_FORMS`
 * names it. A Map or a Set of any realm keeps its contents where no member is, so its own members
 * are the caller's data and stay. A value that is a Map or a Set by its type tag only is its
 * contents alone when it is an observable collection (`isObservableCollection`), and else its
 * own members. May throw for a revoked Proxy.
 */
export function readMembers(value: object): (readonly [string, unknown])[] {
  if (Array.isArray(value)) {
    return Array.from(value, (item, index) => [String(index), item] as const);
  }
  // The slots are checked only for a value of the class or the tag: the check throws for any
  // other value, which made a key of a large body ten times slower.
  const tagged = COLLECTION_FORMS.filter(([className]) => isClass(value, className));
  const real = tagged.find(([, , type]) => hasSlotsOf(value, type));
  if (real !== undefined) {
    return [...ownMembers(value), [real[1], Array.from(value as Iterable<unknown>)] as const];
  }
  if (tagged[0] === undefined || !isObservableCollection(value)) {
    return ownMembers(value);
  }
  return [[tagged[0][1], Array.from(value as Iterable<unknown>)] as const];
}

/** The start of a key: no object read yet, and no segment. */
export function rootAncestors(): Ancestors {
  return { path: [], deeper: { segments: [], indexes: new Map() }, level: 0 };
}

/** Where a walk is once it reads the members or the JSON form of `value`. */
export function inside(ancestors: Ancestors, value: object): Ancestors {
  return { ...ancestors, path: [...ancestors.path, value] };
}

/**
 * The index of the segment that reads `value` with `walk`, added when there is none. An object
 * met again, by a reference from deeper still, keeps its index: that ends a reference back that
 * closes below `WALK_DEPTH`, as the path ends a shorter one, and writes a value that two members
 * share once.
 */
function segmentIndex(value: object, ancestors: Ancestors, walk: Walk<unknown>): number {
  const { segments, indexes } = ancestors.deeper;
  const known = indexes.get(walk) ?? new Map<object, number>();
  indexes.set(walk, known);
  const index = known.get(value) ?? segments.push({ value, walk, level: ancestors.level + 1 }) - 1;
  known.set(value, index);
  return index;
}

/**
 * A value as `walk` writes it, or undefined when the key leaves it out: a function, which no
 * serializer sends as data (JSON leaves it out) and filters compare by identity, so a filter with
 * the key of a later render, which has a new inline function, or after `hydrate`, which has none,
 * missed the query; a reference back to an object the walk is inside of, which no request can
 * send; and a value that throws while it is read. An object `WALK_DEPTH` deep is written as an
 * object of the one member `DEEPER_FORM`, the index of the segment that reads it.
 */
export function keyOf<K>(value: unknown, ancestors: Ancestors, walk: Walk<K>): K | undefined {
  if (typeof value === "function" || ancestors.path.includes(value as object)) {
    return undefined;
  }
  const isDeeper =
    typeof value === "object" && value !== null && ancestors.path.length >= WALK_DEPTH;
  const read = isDeeper ? { [DEEPER_FORM]: segmentIndex(value, ancestors, walk) } : value;
  return attempt(() => walk(read, ancestors));
}

/** The members of an object as `readMembers` reads them, each as `keyOf` writes it. */
export function walkMembers<K>(
  value: object,
  ancestors: Ancestors,
  walk: Walk<K>,
): (readonly [string, K | undefined])[] {
  const inner = inside(ancestors, value);
  return readMembers(value).map(([name, member]) => [name, keyOf(member, inner, walk)] as const);
}

/**
 * The key of each segment of a key, in order, each read in a walk of its own from this short
 * stack. Reading one may add more, which are read in turn: an array's iterator reads the items
 * added while it runs. A segment `SEGMENT_LEVELS` below the first is its JSON text, or undefined
 * when JSON fails for it (a bigint, a getter that throws), as a JSON request does.
 */
export function deeperKeys(ancestors: Ancestors): unknown[] {
  const { deeper } = ancestors;
  return Array.from(deeper.segments, ({ value, walk, level }) =>
    level > SEGMENT_LEVELS
      ? attempt(() => JSON.stringify(value))
      : keyOf(value, { path: [], deeper, level }, walk),
  );
}
